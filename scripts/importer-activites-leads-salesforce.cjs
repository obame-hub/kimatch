// ════════════════════════════════════════════════════════════════════════════════════════════════
// REND AUX PISTES L'HISTORIQUE DE LEURS LEADS
//
// Suite de `importer-leads-salesforce.cjs`, qui a fait entrer les 5 131 leads comme pistes. Leurs
// échanges, eux, sont restés dans Salesforce : 6 436 activités terminées y sont rattachées.
//
//     3 577  appels     → interaction APPEL
//     1 264  e-mails    → interaction EMAIL
//     1 595  tâches     → interaction AUTRE
//
// LES 164 TÂCHES ENCORE OUVERTES NE SONT PAS REPRISES ICI, et c'est délibéré : une tâche ouverte est
// un travail à faire, pas un échange qui a eu lieu. Sa place est dans `actions`, pas dans
// `interactions`. L'importer comme interaction écrirait dans l'historique quelque chose qui n'est
// pas encore arrivé.
//
// ══ L'EXPORT ATTENDU ══
//
//   sf data query --target-org KiweeOrg --json --result-format json ^
//     -q "SELECT Id, WhoId, Subject, Description, ActivityDate, CreatedDate, Status, TaskSubtype,
//         CallType, CallDisposition, CallDurationInSeconds, Owner.Name
//         FROM Task WHERE Who.Type = 'Lead' AND Status = 'Completed'" > activites-leads.json
//
// ══ LES DEUX PIÈGES DÉJÀ PAYÉS, ET ÉVITÉS ICI ══
//
// `sens` s'écrit EN MAJUSCULES. `interactions_sens_check` n'accepte que ENTRANT, SORTANT, INTERNE ou
// nul. Écrits en minuscules lors de l'import du 31/08, les 1 010 appels ont été refusés d'un bloc.
// Le contrôle se fait donc AVANT d'ouvrir la transaction, pas au milieu.
//
// L'idempotence tient à `source_externe_id`, qui porte l'Id Salesforce de l'activité. Rejouer le
// script ne duplique rien et rattrape ce qui a été ajouté depuis.
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const FICHIER = process.argv.find((a) => a.endsWith('.json'))
if (!FICHIER) {
  console.error('Usage : node scripts/importer-activites-leads-salesforce.cjs <activites.json> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs
  .readFileSync('.env.local', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length)
  .trim()

/** Le sous-type Salesforce dit la nature de l'échange ; à défaut, on ne l'invente pas mieux. */
const TYPE_PAR_SOUS_TYPE = { Call: 'APPEL', Email: 'EMAIL', Task: 'AUTRE' }
const SENS_ADMIS = new Set(['ENTRANT', 'SORTANT', 'INTERNE'])

const normal = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toUpperCase()

;(async () => {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
  const activites = JSON.parse(brut.slice(brut.indexOf('{'))).result.records

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const pistes = new Map((await c.query(
    `select id, id_salesforce from public.pistes where id_salesforce is not null`))
    .rows.map((r) => [r.id_salesforce, r.id]))
  const types = new Map((await c.query(`select code, id from public.types_interactions`))
    .rows.map((r) => [r.code, r.id]))
  const profils = new Map((await c.query(`select id, prenom, nom from public.profils`))
    .rows.map((r) => [normal(`${r.prenom} ${r.nom}`), r.id]))
  const dejaLa = new Set((await c.query(
    `select source_externe_id from public.interactions where source_externe_id is not null`))
    .rows.map((r) => r.source_externe_id))

  // ── Contrôle AVANT transaction ──
  const aEcrire = [], sansPiste = [], refus = []
  for (const a of activites) {
    const piste = pistes.get(a.WhoId)
    if (!piste) { sansPiste.push(a.Id); continue }
    if (dejaLa.has(a.Id)) continue
    const code = TYPE_PAR_SOUS_TYPE[a.TaskSubtype] || 'AUTRE'
    if (!types.has(code)) { refus.push(`${a.Id} : type « ${code} » absent du référentiel`); continue }
    const sens = a.CallType === 'Inbound' ? 'ENTRANT' : a.CallType === 'Outbound' ? 'SORTANT' : null
    if (sens !== null && !SENS_ADMIS.has(sens)) { refus.push(`${a.Id} : sens « ${sens} » refusé`); continue }
    aEcrire.push({ a, piste, type: types.get(code), sens })
  }

  const parType = {}
  for (const e of aEcrire) parType[e.a.TaskSubtype || 'Task'] = (parType[e.a.TaskSubtype || 'Task'] || 0) + 1

  console.log('══ CE QUE L\'IMPORT FERAIT ══')
  console.log(`activités lues        : ${activites.length}`)
  console.log(`déjà importées        : ${activites.length - aEcrire.length - sansPiste.length - refus.length}`)
  console.log(`à écrire              : ${aEcrire.length}  ${JSON.stringify(parType)}`)
  console.log(`sans piste retrouvée  : ${sansPiste.length}`)
  console.log(`refusées au contrôle  : ${refus.length}`)
  for (const r of refus.slice(0, 5)) console.log('   ' + r)
  console.log(`\npistes qui recevront un historique : ${new Set(aEcrire.map((e) => e.piste)).size}`)

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await c.end()
    return
  }

  await c.query('begin')
  try {
    for (const e of aEcrire) {
      const a = e.a
      await c.query(
        `insert into public.interactions
           (type_interaction_id, date_interaction, objet, resume, sens, resultat,
            duree_appel_secondes, piste_id, source_externe_id, auteur_profil_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          e.type,
          // `CreatedDate` porte l'heure ; `ActivityDate` n'a que le jour. À défaut d'heure, midi —
          // et non minuit, qui basculerait la veille dans un fuseau à l'ouest.
          a.CreatedDate || (a.ActivityDate ? a.ActivityDate + 'T12:00:00Z' : null),
          (a.Subject || 'Échange').slice(0, 500),
          a.Description || null,
          e.sens,
          a.CallDisposition || null,
          a.CallDurationInSeconds === undefined ? null : a.CallDurationInSeconds,
          e.piste,
          a.Id,
          (a.Owner && profils.get(normal(a.Owner.Name))) || null,
        ])
    }

    const controle = await c.query(
      `select count(*) filter (where piste_id is not null) sur_pistes,
              count(*) filter (where piste_id is not null and type_interaction_id is null) sans_type
         from public.interactions`)
    if (Number(controle.rows[0].sans_type) > 0) {
      throw new Error('des interactions de piste sans type d\'interaction')
    }
    await c.query('commit')
    console.log(`\n✓ ${aEcrire.length} interactions écrites.`)
    console.log(`  ${controle.rows[0].sur_pistes} interactions portent désormais une piste.`)
    console.log('  Retour arrière : delete sur interactions.source_externe_id, la colonne les isole.')
  } catch (err) {
    await c.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + err.message)
    process.exitCode = 1
  }
  await c.end()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
