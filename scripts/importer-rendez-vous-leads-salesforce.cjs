// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES RENDEZ-VOUS PRIS AVEC LES PISTES
//
// Troisième et dernière pièce de « récupérer l'activité des pistes de Salesforce » (Naoëlle,
// 08/09/2026). Les deux premières : les 6 392 échanges terminés (01/09) et les 156 tâches ouvertes.
//
// ══ IL Y EN A QUATRE ══
//
// Quatre `Event` rattachés à un lead, et c'est tout — relevé le 08/09/2026. Des visios de 15 minutes,
// entre octobre 2025 et avril 2026, portant de vrais intitulés :
//
//   « Échange visio Alexia & Thomas - Renégociation des contrats énergie »
//
// Quatre lignes ne justifient pas un script, mais QUATRE LIGNES QU'ON REJOUERA en justifient un :
// l'équipe continue de prendre des rendez-vous, et la prochaine reprise doit les ramasser sans
// dupliquer les précédents. C'est `source_externe_id` qui le garantit.
//
// ══ LE CHATTER, LUI, N'EST PAS IMPORTÉ — ET CE N'EST PAS UN OUBLI ══
//
// `LeadFeed` compte 37 lignes sur 29 leads, ce qui promettait des commentaires écrits par les
// commerciaux. Vérifié avant d'écrire une ligne de code : LES 37 ONT UN CORPS VIDE. 36 sont des
// `TrackedChange` — le suivi automatique des modifications de champ par Salesforce — et la
// trente-septième un `CreateRecordEvent`. Aucun texte humain.
//
// Les importer aurait créé 37 interactions vides sur les fiches, ce qui est pire que rien : une
// interaction sans contenu se lit comme une donnée perdue.
//
// ══ L'EXPORT ATTENDU ══
//
// Depuis PowerShell — `sf` échoue depuis Git Bash sur ce poste, son chemin contient un espace :
//
//   sf data query --target-org KiweeOrg --json -q "SELECT Id, WhoId, Subject, Description,
//     StartDateTime, EndDateTime, DurationInMinutes, ActivityDate, Location, Owner.Name
//     FROM Event WHERE Who.Type = 'Lead'" > events-leads.json
//
// ══ USAGE ══
//
//   node scripts/importer-rendez-vous-leads-salesforce.cjs <events-leads.json>
//   node scripts/importer-rendez-vous-leads-salesforce.cjs <events-leads.json> --appliquer
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const FICHIER = process.argv.find((a) => a.endsWith('.json'))
const APPLIQUER = process.argv.includes('--appliquer')

if (!FICHIER) {
  console.error('Usage : node scripts/importer-rendez-vous-leads-salesforce.cjs <events-leads.json> [--appliquer]')
  process.exit(1)
}

/** Pannes DNS intermittentes du poste (18/08/2026) : on retente la CONNEXION, jamais l'écriture. */
const ERREURS_RESEAU = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']
async function connecter(essais = 5) {
  const chemin = path.join(RACINE, '.env.local')
  const m = fs.readFileSync(chemin, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!m) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  for (let i = 1; i <= essais; i++) {
    const c = new Client({ connectionString: m[1].trim(), ssl: { rejectUnauthorized: false } })
    try {
      await c.connect()
      return c
    } catch (e) {
      await c.end().catch(() => {})
      if (!ERREURS_RESEAU.includes(e.code) || i === essais) throw e
      console.log(`réseau : ${e.code} — nouvelle tentative dans ${i * 2} s`)
      await new Promise((r) => setTimeout(r, i * 2000))
    }
  }
}

const normal = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toUpperCase()

;(async () => {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
  const events = JSON.parse(brut.slice(brut.indexOf('{'))).result.records
  if (!Array.isArray(events)) throw new Error('Export illisible : `result.records` attendu.')

  const c = await connecter()

  const pistes = new Map()
  for (const r of (await c.query(
    `select id, id_salesforce from public.pistes where id_salesforce is not null`)).rows) {
    pistes.set(r.id_salesforce, r.id)
    // L'Id Salesforce existe en 15 et en 18 caractères ; un export en rend toujours 18.
    pistes.set(String(r.id_salesforce).slice(0, 15), r.id)
  }
  const types = new Map((await c.query('select code, id from public.types_interactions')).rows
    .map((r) => [r.code, r.id]))
  const profils = new Map((await c.query('select id, prenom, nom from public.profils')).rows
    .map((r) => [normal(`${r.prenom} ${r.nom}`), r.id]))
  const dejaLa = new Set((await c.query(
    `select source_externe_id from public.interactions where source_externe_id is not null`)).rows
    .map((r) => r.source_externe_id))

  const typeRdv = types.get('RENDEZ_VOUS')
  if (!typeRdv) throw new Error('Le type RENDEZ_VOUS est absent de `types_interactions`.')

  // ── Tous les contrôles avant la transaction ─────────────────────────────────────────────────
  const aEcrire = []
  const sansPiste = []
  let dejaImportes = 0

  for (const e of events) {
    if (dejaLa.has(e.Id)) { dejaImportes += 1; continue }
    const piste = pistes.get(e.WhoId) ?? pistes.get(String(e.WhoId || '').slice(0, 15))
    if (!piste) { sansPiste.push({ id: e.Id, who: e.WhoId, sujet: e.Subject }); continue }

    // `StartDateTime` porte l'heure. À défaut, `ActivityDate` n'a que le jour : midi, jamais minuit,
    // qui basculerait la veille dans un fuseau à l'ouest.
    const quand = e.StartDateTime || (e.ActivityDate ? `${e.ActivityDate}T12:00:00Z` : null)
    if (!quand) { sansPiste.push({ id: e.Id, who: e.WhoId, sujet: '(sans date)' }); continue }

    // Le lieu rejoint le résumé quand il existe : `interactions` n'a pas de colonne pour lui, et
    // l'inventer pour quatre lignes serait disproportionné. Les quatre sont des visios.
    const morceaux = [e.Description, e.Location ? `Lieu : ${e.Location}` : null].filter(Boolean)

    aEcrire.push({
      id: e.Id,
      piste,
      quand,
      objet: (e.Subject || 'Rendez-vous').slice(0, 500),
      resume: morceaux.length > 0 ? morceaux.join('\n\n') : null,
      minutes: e.DurationInMinutes ?? null,
      auteur: e.Owner && e.Owner.Name ? profils.get(normal(e.Owner.Name)) ?? null : null,
    })
  }

  console.log('\n══ CE QUE L’IMPORT FERAIT ══\n')
  console.log(`  rendez-vous lus       : ${events.length}`)
  console.log(`  déjà importés         : ${dejaImportes}`)
  console.log(`  à écrire              : ${aEcrire.length}`)
  console.log(`  sans piste ou sans date : ${sansPiste.length}`)
  for (const s of sansPiste.slice(0, 5)) console.log(`     ${s.who}  ${(s.sujet || '').slice(0, 50)}`)
  for (const e of aEcrire) {
    console.log(`     ${e.quand.slice(0, 10)}  ${e.minutes ?? '?'} min  ${e.objet.slice(0, 58)}`)
  }

  if (!APPLIQUER) {
    console.log('\n  Simulation seule. Relancer avec --appliquer pour écrire.\n')
    await c.end()
    return
  }
  if (aEcrire.length === 0) {
    console.log('\n  Rien de nouveau à écrire : ces rendez-vous sont déjà tous en base.\n')
    await c.end()
    return
  }

  await c.query('begin')
  try {
    for (const e of aEcrire) {
      await c.query(
        `insert into public.interactions
           (type_interaction_id, date_interaction, objet, resume, duree_minutes,
            piste_id, source_externe_id, auteur_profil_id, proprietaire_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         on conflict (source_externe_id) where source_externe_id is not null do nothing`,
        [typeRdv, e.quand, e.objet, e.resume, e.minutes, e.piste, e.id, e.auteur])
    }
    await c.query('commit')
    console.log(`\n✓ ${aEcrire.length} rendez-vous écrit(s).`)
    console.log('  Retour arrière : delete from interactions where source_externe_id = <Id de l’Event>.')
  } catch (err) {
    await c.query('rollback')
    console.error('\n✗ Rien n’a été écrit : ' + err.message)
    process.exitCode = 1
    await c.end()
    return
  }

  // Quatre lignes ne périment aucune statistique. La règle ne se négocie pas au cas par cas —
  // c'est ainsi qu'on l'oublie le jour où elle compte (l'arrêt du 07/09/2026).
  process.stdout.write('\n  analyze interactions… ')
  const debut = Date.now()
  await c.query('analyze public.interactions')
  console.log(`${Math.round((Date.now() - debut) / 1000)} s`)

  console.log('\n  Où les voir : fiche piste → panneau « Activité · piste ».\n')
  await c.end()
})().catch((e) => {
  console.error('\n' + e.message + '\n')
  process.exit(1)
})
