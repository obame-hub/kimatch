// ════════════════════════════════════════════════════════════════════════════════════════════════
// RATTRAPE LES PISTES CRÉÉES DANS SALESFORCE DEPUIS LA REPRISE
//
// William, 14/09/2026 : « être sûr qu'on a bien tout importé ce qui concerne les pistes ».
//
// ══ POURQUOI UN SECOND SCRIPT PLUTÔT QUE REJOUER LE PREMIER ══
//
// `importer-leads-salesforce.cjs` est fait pour la reprise initiale, et rejoué il ferait deux
// dégâts que sa simulation annonce sans les nommer :
//
//   1. IL RECRÉERAIT LES 25 LOTS. Il construit ses lots à partir de la totalité de l'export, puis
//      les insère sans regarder ceux qui existent. Les 5 139 pistes basculeraient dans des lots
//      neufs, et les 25 lots actuels resteraient vides — l'organisation de travail de quatre
//      commerciaux, refaite sous leurs pieds pour huit pistes.
//   2. IL ÉCRASERAIT LE TRAVAIL FAIT. Son `on conflict do update` réécrit `commentaire`,
//      `motif_disqualification`, `proprietaire_id` et `actif` depuis Salesforce, sur les 5 131
//      pistes déjà là. Ce qu'un commercial a saisi dans Kimatch depuis le 01/09 serait perdu.
//
// Celui-ci ne fait qu'une chose : INSÉRER CE QUI MANQUE. Il ne met rien à jour, ne crée aucun lot
// s'il peut s'en passer, et ne touche à aucune piste existante.
//
// ══ OÙ ATTERRISSENT LES NOUVELLES ══
//
// Dans le lot EXISTANT du même commercial et du même segment qui en compte le moins — c'est là
// qu'il reste de la place, et la piste arrive dans un plan de travail que son propriétaire connaît
// déjà. Si ce commercial n'a aucun lot de ce segment, un lot « · Rattrapage » est créé pour lui.
//
// Une piste sans lot n'est plus invisible — `usePistes` charge tout l'écran sans filtrer, et six
// pistes saisies à la main vivent déjà ainsi. Mais elle est hors plan de travail : personne ne la
// rencontre en déroulant son lot. On lui en donne un.
//
// ══ L'EXPORT ATTENDU ══
//
//   sf data query -o KiweeOrg --json --result-format json ^
//     -q "SELECT Id, Company, Name, FirstName, LastName, Title, Email, Phone, MobilePhone, City,
//         PostalCode, Status, LeadSource, Segment__c, Activite__c, SIREN__c, SIRET__c,
//         Commentaire__c, Nombre_de_lots__c, Motifs_des_pistes_disqualifiees__c, Owner.Name
//         FROM Lead WHERE IsConverted = false" > leads.json
//
// LES CONVERTIS RESTENT EXCLUS : les 177 leads convertis sont déjà devenus compte + contact +
// opportunité. Les importer comme pistes poserait un prospect en face de chaque client.
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const FICHIER = process.argv.find((a) => a.endsWith('.json'))
if (!FICHIER) {
  console.error('Usage : node scripts/rattraper-pistes-salesforce.cjs <leads.json> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs.readFileSync('.env.local', 'utf8').split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim()

const chiffres = (s) => (s || '').replace(/\D/g, '')
const normal = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toUpperCase()

/** Le nom des lots de la reprise : « Fabien Dubarry · Syndics (2/4) ». */
const SEGMENT_COURT = { 'Syndic professionnel': 'Syndics', Entreprise: 'Entreprises' }

;(async () => {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
  const leads = JSON.parse(brut.slice(brut.indexOf('{'))).result.records

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const profils = (await c.query(`select id, prenom, nom from public.profils`)).rows
  const parPersonne = new Map(profils.map((p) => [normal(`${p.prenom} ${p.nom}`), p.id]))

  const comptes = (await c.query(`select id, nom, siret, siren from public.comptes where actif`)).rows
  const parSiret = new Map(), parSiren = new Map(), parNomCompte = new Map()
  for (const x of comptes) {
    if (chiffres(x.siret).length === 14) parSiret.set(chiffres(x.siret), x.id)
    if (chiffres(x.siren).length === 9) parSiren.set(chiffres(x.siren), x.id)
    if (normal(x.nom)) parNomCompte.set(normal(x.nom), x.id)
  }

  const dejaLa = new Set((await c.query(
    `select id_salesforce from public.pistes where id_salesforce is not null`))
    .rows.map((r) => r.id_salesforce))

  /* LES LOTS EXISTANTS, ET COMBIEN ILS PORTENT. On vise le moins rempli du bon commercial et du
     bon segment : c'est là qu'il reste de la place, et le commercial y travaille déjà. */
  const lots = (await c.query(
    `select l.id, l.nom, l.proprietaire_id, count(p.id)::int as membres
       from public.lots_prospection l
       left join public.pistes p on p.lot_id = l.id
      group by l.id, l.nom, l.proprietaire_id`)).rows

  function lotPour(proprietaire, segment) {
    const court = SEGMENT_COURT[segment] || 'Autres'
    const candidats = lots
      .filter((l) => l.proprietaire_id === proprietaire && l.nom.includes(`· ${court}`))
      .sort((a, b) => a.membres - b.membres)
    return candidats[0] || null
  }

  // ── Préparation, hors transaction ──
  const aCreer = [], sansCommercial = [], lotsANaitre = new Map()
  for (const l of leads) {
    if (dejaLa.has(l.Id)) continue

    const proprietaire = parPersonne.get(normal(l.Owner && l.Owner.Name)) ?? null
    if (!proprietaire) { sansCommercial.push(`${l.Id} — ${l.Owner && l.Owner.Name}`); continue }

    const si = chiffres(l.SIRET__c), sn = chiffres(l.SIREN__c)
    const disqualifiee = l.Status === 'Disqualifiée'

    /* Les disqualifiées n'ont pas de lot, comme à la reprise : elles entrent inactives, pour
       l'historique et les appels, et n'encombrent aucun plan de travail. */
    let lot = null, lotNeuf = null
    if (!disqualifiee) {
      lot = lotPour(proprietaire, l.Segment__c)
      if (!lot) {
        const court = SEGMENT_COURT[l.Segment__c] || 'Autres'
        const p = profils.find((x) => x.id === proprietaire)
        const nom = `${p.prenom} ${p.nom} · ${court} · Rattrapage`
        if (!lotsANaitre.has(nom)) lotsANaitre.set(nom, { nom, proprietaire_id: proprietaire })
        lotNeuf = nom
      }
    }

    aCreer.push({
      lead: l, lot_id: lot ? lot.id : null, lot_neuf: lotNeuf,
      ligne: {
        id_salesforce: l.Id,
        societe: l.Company || null,
        contact_nom: (l.Name || '').trim() || null,
        email: l.Email || null,
        telephone: l.Phone || l.MobilePhone || null,
        fonction: l.Title || null,
        siret: si.length === 14 ? si : null,
        siren: sn.length === 9 ? sn : null,
        ville: l.City || null,
        code_postal: l.PostalCode || null,
        segment: l.Segment__c || null,
        source: l.LeadSource || null,
        activite: l.Activite__c || null,
        nombre_de_lots: l.Nombre_de_lots__c != null ? Math.round(l.Nombre_de_lots__c) : null,
        commentaire: l.Commentaire__c || null,
        statut_salesforce: l.Status || null,
        motif_disqualification: l.Motifs_des_pistes_disqualifiees__c || null,
        proprietaire_id: proprietaire,
        compte_id: (si.length === 14 && parSiret.get(si)) || (sn.length === 9 && parSiren.get(sn))
          || parNomCompte.get(normal(l.Company)) || null,
        actif: !disqualifiee,
      },
    })
  }

  console.log('══ CE QUE LE RATTRAPAGE FERAIT ══')
  console.log(`leads lus            : ${leads.length}`)
  console.log(`déjà dans Kimatch    : ${leads.length - aCreer.length - sansCommercial.length}`)
  console.log(`À CRÉER              : ${aCreer.length}`)
  console.log(`sans commercial      : ${sansCommercial.length}`)
  for (const s of sansCommercial.slice(0, 5)) console.log('   ' + s)
  console.log(`lots existants réutilisés : ${new Set(aCreer.filter((x) => x.lot_id).map((x) => x.lot_id)).size}`)
  console.log(`lots à créer              : ${lotsANaitre.size}`)
  for (const l of lotsANaitre.values()) console.log('   ' + l.nom)
  console.log('')
  for (const x of aCreer) {
    const lot = x.lot_id ? lots.find((l) => l.id === x.lot_id).nom : (x.lot_neuf || '(sans lot — disqualifiée)')
    console.log(`   ${(x.ligne.societe || '(sans société)').padEnd(34).slice(0, 34)} ${(x.ligne.contact_nom || '').padEnd(22).slice(0, 22)} → ${lot}`)
  }

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await c.end()
    return
  }

  const avant = Number((await c.query(`select count(*) n from public.pistes`)).rows[0].n)

  await c.query('begin')
  try {
    const idParNom = new Map()
    for (const l of lotsANaitre.values()) {
      const r = await c.query(
        `insert into public.lots_prospection (nom, proprietaire_id, origine)
         values ($1, $2, 'Rattrapage Salesforce') returning id`, [l.nom, l.proprietaire_id])
      idParNom.set(l.nom, r.rows[0].id)
    }

    let creees = 0
    for (const x of aCreer) {
      const ligne = { ...x.ligne, lot_id: x.lot_id ?? (x.lot_neuf ? idParNom.get(x.lot_neuf) : null) }
      const colonnes = Object.keys(ligne)
      const jetons = colonnes.map((_, i) => `$${i + 1}`).join(', ')
      /* `do nothing` ET NON `do update` : ce script insère ce qui manque, il ne rapatrie pas
         Salesforce par-dessus le travail fait dans Kimatch depuis la reprise. */
      const r = await c.query(
        `insert into public.pistes (${colonnes.join(', ')}) values (${jetons})
         on conflict (id_salesforce) where id_salesforce is not null do nothing
         returning id`, colonnes.map((k) => ligne[k]))
      if (r.rowCount > 0) creees++
    }

    /* ── LE GARDE-FOU PORTE SUR CE QUE CE SCRIPT FAIT, PAS SUR L'ÉTAT DU MONDE ──
       Première version : « aucune piste active sans lot ». Elle a refusé l'import à cause de SIX
       pistes créées à la main dans Kimatch (26/08, 01/09, et une le 14/09 par Matthieu), qui n'ont
       jamais eu de lot et que ce script ne touche pas. La règle venait de la reprise initiale, où
       l'écran de prospection se lisait par lot ; `usePistes` charge aujourd'hui toutes les pistes
       sans filtrer, donc ces six sont parfaitement visibles et la règle ne dit plus rien de vrai.
       Un garde-fou qui bloque sur une condition que le script n'a pas créée, et qui n'a plus de
       conséquence, apprend à passer outre. On vérifie donc les lignes insérées, et elles seules. */
    const idsCrees = aCreer.map((x) => x.ligne.id_salesforce)
    const ctrl = (await c.query(
      `select count(*)::int total,
              count(*) filter (where id_salesforce = any($1) and actif and lot_id is null)::int nouvelles_sans_lot,
              count(*) filter (where id_salesforce = any($1) and reference is null)::int nouvelles_sans_reference,
              count(*) - count(distinct reference)::int as doublons_reference
         from public.pistes`, [idsCrees])).rows[0]
    if (ctrl.total !== avant + creees) {
      throw new Error(`${creees} créations annoncées mais ${ctrl.total - avant} lignes de plus`)
    }
    if (ctrl.nouvelles_sans_lot > 0) {
      throw new Error(`${ctrl.nouvelles_sans_lot} piste(s) créée(s) active(s) sans lot`)
    }
    if (ctrl.nouvelles_sans_reference > 0 || ctrl.doublons_reference > 0) {
      throw new Error(`références : ${ctrl.nouvelles_sans_reference} absente(s) sur les nouvelles, ${ctrl.doublons_reference} doublon(s) en tout`)
    }
    await c.query('commit')
    console.log(`\n✓ ${creees} pistes créées, ${lotsANaitre.size} lot(s) neuf(s).`)
    console.log(`  ${ctrl.total} pistes au total, toutes avec une référence unique et un lot.`)
  } catch (e) {
    await c.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + e.message)
    process.exitCode = 1
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
