// ════════════════════════════════════════════════════════════════════════════════════════════════
// L'ACTIVITÉ DES LEADS CONVERTIS NE SE PERD PLUS EN ROUTE
//
// William, 14/09/2026 : « être sûr qu'on a bien tout importé ce qui concerne les pistes, que ce
// soit les tâches ouvertes, fermées, tout type de tâches et d'infos. »
//
// ══ LE TROU, ET POURQUOI IL EXISTE ═══════════════════════════════════════════════════════════
//
// 177 des 5 316 leads de Salesforce sont CONVERTIS : ils sont devenus un compte, un contact et une
// opportunité. `importer-leads-salesforce.cjs` les exclut volontairement — les importer comme
// pistes poserait un prospect en face de chaque client.
//
// Mais leur ACTIVITÉ, elle, est restée accrochée au lead. Les imports qui suivent cherchent tous
// une piste par l'identifiant du lead, ne la trouvent pas, et abandonnent la ligne :
//
//     45 tâches   ·  « sans piste retrouvée » dans importer-activites-leads-salesforce
//    256 mails    ·  « piste introuvable »    dans importer-mails-pistes-salesforce
//
// Ces 301 échanges ont bien eu lieu, avec des gens qui sont aujourd'hui CLIENTS. Les perdre, c'est
// ouvrir la fiche d'un client et ne rien voir de la prospection qui l'a amené.
//
// ══ OÙ ILS VONT ══════════════════════════════════════════════════════════════════════════════
//
// Salesforce dit lui-même où : `ConvertedAccountId` et `ConvertedContactId` sur le lead. On suit ce
// chemin — 166 des 177 ont un compte, 161 un contact — et l'échange atterrit sur le contact quand
// il existe, sur le compte sinon. Rien n'est inventé : quand Salesforce ne dit pas où, on ne devine
// pas, on laisse la ligne de côté et on la compte.
//
// ══ L'EXPORT ATTENDU ═════════════════════════════════════════════════════════════════════════
//
//   sf data query -o KiweeOrg --json --result-format json ^
//     -q "SELECT Id, ConvertedAccountId, ConvertedContactId, Company FROM Lead WHERE IsConverted = true"
//     > leads-convertis.json
//
//   plus les deux exports déjà produits pour les pistes : activites-leads.json et mails-pistes.json
//   (avec emr-leads.json pour savoir quel mail concerne quel lead).
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const f = {
  convertis: process.argv.find((a) => a.includes('leads-convertis')),
  activites: process.argv.find((a) => a.includes('activites-leads')),
  relations: process.argv.find((a) => a.includes('emr-leads')),
  mails: process.argv.find((a) => a.includes('mails-pistes')),
}
if (!f.convertis || !f.activites || !f.relations || !f.mails) {
  console.error('Usage : node scripts/rattraper-activite-leads-convertis.cjs \\')
  console.error('          leads-convertis.json activites-leads.json emr-leads.json mails-pistes.json [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs.readFileSync('.env.local', 'utf8').split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim()

function lire(fichier) {
  const brut = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '')
  return JSON.parse(brut.slice(brut.indexOf('{'))).result.records
}

const c15 = (s) => (s || '').slice(0, 15)
const CORPS_MAX = 8000
const TYPE_PAR_SOUS_TYPE = { Call: 'APPEL', Email: 'EMAIL', Task: 'AUTRE' }

;(async () => {
  const convertis = lire(f.convertis)
  const activites = lire(f.activites)
  const relations = lire(f.relations)
  const mails = new Map(lire(f.mails).map((m) => [c15(m.Id), m]))

  /* Le lead converti pointe son compte et son contact. On garde les deux : le contact est le bon
     destinataire d'un échange, le compte le repli quand la conversion n'en a pas créé. */
  const destination = new Map(convertis.map((l) => [c15(l.Id), {
    compteSf: c15(l.ConvertedAccountId), contactSf: c15(l.ConvertedContactId), societe: l.Company,
  }]))

  const cl = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await cl.connect()

  const comptes = new Map((await cl.query(
    `select id, id_salesforce from public.comptes where id_salesforce is not null`))
    .rows.map((r) => [c15(r.id_salesforce), r.id]))
  const contacts = new Map((await cl.query(
    `select id, id_salesforce, compte_id from public.contacts where id_salesforce is not null`))
    .rows.map((r) => [c15(r.id_salesforce), r]))

  const types = new Map((await cl.query(`select code, id from public.types_interactions`))
    .rows.map((r) => [r.code, r.id]))
  const profils = new Map((await cl.query(
    `select id, lower(email) as email from public.profils where email is not null`))
    .rows.map((r) => [r.email, r.id]))
  const dejaLa = new Set((await cl.query(
    `select source_externe_id from public.interactions where source_externe_id is not null`))
    .rows.map((r) => r.source_externe_id))

  /** Où poser l'échange : le contact issu de la conversion, et son compte. */
  function ou(leadId) {
    const d = destination.get(c15(leadId))
    if (!d) return null
    const contact = d.contactSf ? contacts.get(d.contactSf) : null
    const compte = (d.compteSf && comptes.get(d.compteSf)) || (contact && contact.compte_id) || null
    if (!contact && !compte) return null
    return { contact_id: contact ? contact.id : null, compte_id: compte }
  }

  const aEcrire = [], sansDestination = [], dejaImportees = []

  // ── Les tâches terminées des leads convertis ──
  for (const a of activites) {
    if (dejaLa.has(a.Id)) { dejaImportees.push(a.Id); continue }
    if (!destination.has(c15(a.WhoId))) continue   // lead non converti : ce n'est pas notre affaire
    const cible = ou(a.WhoId)
    if (!cible) { sansDestination.push(`tâche ${a.Id} — lead ${a.WhoId}`); continue }
    aEcrire.push({
      quoi: 'tâche',
      source: a.Id,
      type: types.get(TYPE_PAR_SOUS_TYPE[a.TaskSubtype] || 'AUTRE'),
      date: a.CreatedDate || (a.ActivityDate ? a.ActivityDate + 'T12:00:00Z' : null),
      objet: (a.Subject || 'Échange').slice(0, 500),
      corps: a.Description || null,
      sens: a.CallType === 'Inbound' ? 'ENTRANT' : a.CallType === 'Outbound' ? 'SORTANT' : null,
      fil: null,
      auteur: null,
      duree: a.CallDurationInSeconds === undefined ? null : a.CallDurationInSeconds,
      resultat: a.CallDisposition || null,
      ...cible,
    })
  }

  // ── Les mails des leads convertis ──
  const vus = new Set()
  for (const rel of relations) {
    const cle = c15(rel.EmailMessageId)
    if (vus.has(cle)) continue
    vus.add(cle)
    if (dejaLa.has(rel.EmailMessageId)) { dejaImportees.push(rel.EmailMessageId); continue }
    if (!destination.has(c15(rel.RelationId))) continue
    const m = mails.get(cle)
    if (!m) continue
    const cible = ou(rel.RelationId)
    if (!cible) { sansDestination.push(`mail ${rel.EmailMessageId} — lead ${rel.RelationId}`); continue }
    aEcrire.push({
      quoi: 'mail',
      source: m.Id,
      type: types.get('EMAIL'),
      date: m.MessageDate || null,
      objet: (m.Subject || '(sans objet)').slice(0, 500),
      corps: m.TextBody ? m.TextBody.slice(0, CORPS_MAX) : null,
      sens: m.Incoming ? 'ENTRANT' : 'SORTANT',
      fil: m.ThreadIdentifier || null,
      auteur: (!m.Incoming && m.FromAddress && profils.get(m.FromAddress.toLowerCase())) || null,
      duree: null,
      resultat: null,
      ...cible,
    })
  }

  const parQuoi = {}
  for (const e of aEcrire) parQuoi[e.quoi] = (parQuoi[e.quoi] || 0) + 1

  console.log('══ CE QUE LE RATTRAPAGE FERAIT ══')
  console.log(`leads convertis           : ${convertis.length}`)
  console.log(`À ÉCRIRE                  : ${aEcrire.length}  ${JSON.stringify(parQuoi)}`)
  console.log(`   posées sur un contact  : ${aEcrire.filter((e) => e.contact_id).length}`)
  console.log(`   posées sur le compte   : ${aEcrire.filter((e) => !e.contact_id && e.compte_id).length}`)
  console.log(`sans destination connue   : ${sansDestination.length}`)
  for (const s of sansDestination.slice(0, 5)) console.log('   ' + s)
  console.log(`\ncomptes qui gagnent de l'historique : ${new Set(aEcrire.map((e) => e.compte_id)).size}`)

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await cl.end()
    return
  }

  const avant = Number((await cl.query(`select count(*) n from public.interactions`)).rows[0].n)

  await cl.query('begin')
  try {
    let ecrites = 0
    for (const e of aEcrire) {
      const r = await cl.query(
        `insert into public.interactions
           (type_interaction_id, date_interaction, objet, resume, resultat, sens,
            contact_id, compte_id, source_externe_id, fil_discussion, auteur_profil_id,
            duree_appel_secondes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (source_externe_id) where source_externe_id is not null do nothing
         returning id`,
        [e.type, e.date, e.objet, e.corps, e.resultat, e.sens, e.contact_id, e.compte_id,
          e.source, e.fil, e.auteur, e.duree])
      if (r.rowCount > 0) ecrites++
    }

    /* Le contrôle porte sur les lignes de ce script — pas sur l'état de la table, où trois autres
       imports écrivent. Un garde-fou qui accuse le script d'à côté s'apprend à contourner. */
    const sources = aEcrire.map((e) => e.source)
    const k = (await cl.query(
      `select count(*) filter (where source_externe_id = any($1))::int as ecrites,
              count(*) filter (where source_externe_id = any($1)
                               and contact_id is null and compte_id is null)::int as orphelines,
              count(*) filter (where source_externe_id = any($1) and date_interaction is null)::int as sans_date,
              count(*) filter (where source_externe_id = any($1) and type_interaction_id is null)::int as sans_type
         from public.interactions`, [sources])).rows[0]
    if (k.orphelines > 0) throw new Error(`${k.orphelines} échange(s) sans contact ni compte`)
    if (k.sans_type > 0) throw new Error(`${k.sans_type} échange(s) sans type`)
    if (k.sans_date > 0) throw new Error(`${k.sans_date} échange(s) sans date : illisibles dans le fil`)

    const apres = Number((await cl.query(`select count(*) n from public.interactions`)).rows[0].n)
    if (apres - avant !== ecrites) {
      throw new Error(`${ecrites} écritures annoncées, ${apres - avant} interactions en plus`)
    }

    await cl.query('commit')
    console.log(`\n✓ ${ecrites} échanges rendus aux clients issus d'une piste convertie.`)
    console.log('  Retour arrière : delete sur interactions.source_externe_id, la colonne les isole.')
  } catch (e) {
    await cl.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + e.message)
    process.exitCode = 1
  }
  await cl.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
