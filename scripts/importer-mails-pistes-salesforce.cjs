// ════════════════════════════════════════════════════════════════════════════════════════════════
// LE FIL DE MAILS DES PISTES, REPRIS DE SALESFORCE
//
// William, 14/09/2026 : « avoir le fil de la conversation de mail dans Kimatch ».
//
// ══ CE QUI MANQUAIT, MESURÉ AVANT D'ÉCRIRE UNE LIGNE ═════════════════════════════════════════
//
// Kimatch portait 1 220 « mails » sur ses pistes. Ce n'étaient pas des mails : c'étaient les TÂCHES
// Salesforce de sous-type Email, importées le 01/09 — un objet, une date, et rien d'autre. Le texte
// du message, l'expéditeur, le destinataire, la conversation à laquelle il appartient : tout cela
// vit dans `EmailMessage`, un autre objet, que l'import des activités n'a jamais touché.
//
// Relevé dans l'org : 1 600 `EmailMessageRelation` pointent un Lead, soit 1 598 messages distincts
// sur 605 pistes, 1 340 sortants et 258 entrants, 1 596 avec leur corps, et 1 085 fils de
// conversation. Quatre de ces messages sont déjà dans Kimatch — rattachés à un CONTACT, pas à la
// piste. Les 1 594 autres n'y sont pas du tout.
//
// ══ POURQUOI LE SCRIPT RATTACHE PARFOIS AU LIEU D'INSÉRER ════════════════════════════════════
//
// `interactions_source_externe_id_idx` est UNIQUE. Un `EmailMessage` ne peut donc exister qu'une
// fois dans Kimatch, quel que soit le nombre d'objets qu'il concerne. Pour les quatre déjà présents,
// insérer une seconde ligne serait refusé par la base — et ce serait une erreur de vouloir le faire :
// le même mail deux fois, c'est deux échanges dans l'historique là où il n'y en a eu qu'un.
//
// On POSE donc `piste_id` sur la ligne existante. Le mail apparaît alors sur la piste ET sur le
// contact, ce qui est exactement la vérité : il concerne les deux.
//
// ══ LE FIL ═══════════════════════════════════════════════════════════════════════════════════
//
// `ThreadIdentifier` va dans `fil_discussion` (migration 20260914160000). C'est lui qui transforme
// six lignes triées par date en une conversation qu'on déroule.
//
// ══ L'EXPORT ATTENDU ═════════════════════════════════════════════════════════════════════════
//
//   sf data query -o KiweeOrg --json --result-format json ^
//     -q "SELECT EmailMessageId, RelationId, RelationType FROM EmailMessageRelation
//         WHERE Relation.Type = 'Lead'" > emr-leads.json
//
//   sf data query -o KiweeOrg --json --result-format json ^
//     -q "SELECT Id, Subject, TextBody, Incoming, MessageDate, FromAddress, FromName, ToAddress,
//         CcAddress, ThreadIdentifier, Status FROM EmailMessage
//         WHERE Id IN (SELECT EmailMessageId FROM EmailMessageRelation WHERE Relation.Type = 'Lead')"
//         > mails-pistes.json
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const fichiers = process.argv.filter((a) => a.endsWith('.json'))
if (fichiers.length < 2) {
  console.error('Usage : node scripts/importer-mails-pistes-salesforce.cjs <emr-leads.json> <mails-pistes.json> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs.readFileSync('.env.local', 'utf8').split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim()

/** Le BOM que `sf` place en tête de ses exports fait échouer JSON.parse sans rien expliquer. */
function lire(f) {
  const brut = fs.readFileSync(f, 'utf8').replace(/^﻿/, '')
  return JSON.parse(brut.slice(brut.indexOf('{'))).result.records
}

/* Le corps d'un mail traîne sa signature, ses mentions légales et parfois tout l'historique cité.
   On garde 8 000 caractères : de quoi lire l'échange sans charger un roman dans chaque fiche. */
const CORPS_MAX = 8000

;(async () => {
  const relations = lire(fichiers[0])
  const mails = lire(fichiers[1])
  const parId = new Map(mails.map((m) => [m.Id, m]))

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const pistes = new Map((await c.query(
    `select id, id_salesforce from public.pistes where id_salesforce is not null`))
    .rows.map((r) => [r.id_salesforce.slice(0, 15), r.id]))

  const typeEmail = (await c.query(
    `select id from public.types_interactions where code = 'EMAIL'`)).rows[0]
  if (!typeEmail) throw new Error('Le type d\'interaction EMAIL est absent du référentiel.')

  const profils = new Map((await c.query(
    `select id, lower(email) as email from public.profils where email is not null`))
    .rows.map((r) => [r.email, r.id]))

  const existantes = new Map((await c.query(
    `select id, source_externe_id, piste_id from public.interactions
      where source_externe_id like '02s%'`))
    .rows.map((r) => [r.source_externe_id.slice(0, 15), r]))

  // ── Préparation, hors transaction ──
  const aCreer = [], aRattacher = [], sansPiste = [], sansMail = [], dejaSurLaPiste = []
  const vus = new Set()
  for (const rel of relations) {
    const cle = rel.EmailMessageId.slice(0, 15)
    /* Un même message peut relier plusieurs leads (destinataire + copie). On ne le traite qu'une
       fois : l'identifiant est unique en base, donc la première piste rencontrée l'emporte. */
    if (vus.has(cle)) continue
    vus.add(cle)

    const m = parId.get(rel.EmailMessageId)
    if (!m) { sansMail.push(rel.EmailMessageId); continue }
    const piste = pistes.get(rel.RelationId.slice(0, 15))
    if (!piste) { sansPiste.push(`${rel.EmailMessageId} → lead ${rel.RelationId}`); continue }

    const dejaLa = existantes.get(cle)
    if (dejaLa) {
      if (dejaLa.piste_id) dejaSurLaPiste.push(cle)
      else aRattacher.push({ id: dejaLa.id, piste, fil: m.ThreadIdentifier || null })
      continue
    }

    aCreer.push({
      piste,
      source: m.Id,
      /* `Incoming` dit le sens sans ambiguïté, et il est renseigné partout. `interactions_sens_check`
         n'accepte que les majuscules — la leçon du 31/08, où 1 010 appels ont été refusés d'un bloc. */
      sens: m.Incoming ? 'ENTRANT' : 'SORTANT',
      date: m.MessageDate || null,
      objet: (m.Subject || '(sans objet)').slice(0, 500),
      corps: m.TextBody ? m.TextBody.slice(0, CORPS_MAX) : null,
      fil: m.ThreadIdentifier || null,
      /* L'auteur, seulement quand le mail SORT de chez nous et que l'adresse est celle d'un profil.
         Sur un mail entrant, l'expéditeur est le prospect : lui attribuer l'interaction ferait dire
         à l'historique qu'un commercial a écrit ce que le client a écrit. */
      auteur: (!m.Incoming && m.FromAddress && profils.get(m.FromAddress.toLowerCase())) || null,
      correspondant: m.Incoming ? m.FromAddress : m.ToAddress,
    })
  }

  const fils = new Set(aCreer.map((x) => x.fil).filter(Boolean))
  console.log('══ CE QUE L\'IMPORT FERAIT ══')
  console.log(`relations lues              : ${relations.length}  (${vus.size} messages distincts)`)
  console.log(`À CRÉER sur une piste       : ${aCreer.length}`)
  console.log(`   dont entrants            : ${aCreer.filter((x) => x.sens === 'ENTRANT').length}`)
  console.log(`   dont avec un corps       : ${aCreer.filter((x) => x.corps).length}`)
  console.log(`   fils de conversation     : ${fils.size}`)
  console.log(`   auteur reconnu           : ${aCreer.filter((x) => x.auteur).length}`)
  console.log(`À RATTACHER (déjà en base)  : ${aRattacher.length}`)
  console.log(`déjà sur leur piste         : ${dejaSurLaPiste.length}`)
  console.log(`piste introuvable           : ${sansPiste.length}`)
  for (const s of sansPiste.slice(0, 5)) console.log('   ' + s)
  console.log(`mail absent de l'export     : ${sansMail.length}`)
  console.log(`\npistes qui gagneront un fil : ${new Set(aCreer.map((x) => x.piste)).size}`)

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await c.end()
    return
  }

  const avant = Number((await c.query(
    `select count(*) n from public.interactions where piste_id is not null`)).rows[0].n)

  await c.query('begin')
  try {
    let rattachees = 0
    for (const x of aRattacher) {
      const r = await c.query(
        `update public.interactions set piste_id = $1, fil_discussion = coalesce(fil_discussion, $2),
                date_modification = now()
          where id = $3 and piste_id is null`,
        [x.piste, x.fil, x.id])
      rattachees += r.rowCount
    }

    let creees = 0
    for (const x of aCreer) {
      const r = await c.query(
        `insert into public.interactions
           (type_interaction_id, date_interaction, objet, resume, sens, piste_id,
            source_externe_id, fil_discussion, auteur_profil_id, numero_correspondant)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (source_externe_id) where source_externe_id is not null do nothing
         returning id`,
        [typeEmail.id, x.date, x.objet, x.corps, x.sens, x.piste, x.source, x.fil, x.auteur,
          (x.correspondant || '').slice(0, 255) || null])
      if (r.rowCount > 0) creees++
    }

    /* ── LE GARDE-FOU PORTE SUR CE QUE CE SCRIPT ÉCRIT ──
       Pas sur l'état général de la table : deux autres imports y écrivent, et un contrôle global
       accuserait le script d'à côté — le défaut qui a bloqué le rattrapage des tâches ce matin. */
    const sources = aCreer.map((x) => x.source)
    const k = (await c.query(
      `select count(*) filter (where source_externe_id = any($1))::int as ecrites,
              count(*) filter (where source_externe_id = any($1) and piste_id is null)::int as sans_piste,
              count(*) filter (where source_externe_id = any($1) and type_interaction_id is null)::int as sans_type,
              count(*) filter (where source_externe_id = any($1) and date_interaction is null)::int as sans_date
         from public.interactions`, [sources])).rows[0]
    if (k.sans_piste > 0) throw new Error(`${k.sans_piste} mail(s) écrit(s) sans piste`)
    if (k.sans_type > 0) throw new Error(`${k.sans_type} mail(s) écrit(s) sans type`)
    if (k.sans_date > 0) throw new Error(`${k.sans_date} mail(s) écrit(s) sans date : ils seraient illisibles dans le fil`)

    const apres = Number((await c.query(
      `select count(*) n from public.interactions where piste_id is not null`)).rows[0].n)
    /* LES DEUX GESTES FONT MONTER LE COMPTE, et le premier essai l'avait oublié : un mail rattaché
       à sa piste est une interaction de piste de plus, exactement comme un mail créé. Le contrôle
       a annoncé 1 341 pour 1 342 et tout annulé — il avait raison, c'est mon calcul qui était faux. */
    const attendu = creees + rattachees
    if (apres - avant !== attendu) {
      throw new Error(`${creees} créations + ${rattachees} rattachements = ${attendu} attendus, ${apres - avant} interactions de piste en plus`)
    }

    await c.query('commit')
    console.log(`\n✓ ${creees} mails créés, ${rattachees} rattachés à leur piste.`)
    console.log(`  ${apres} interactions portent une piste, dont ${fils.size} fils de conversation.`)
    console.log('  Retour arrière : delete sur interactions.source_externe_id, la colonne les isole.')
  } catch (e) {
    await c.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + e.message)
    process.exitCode = 1
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
