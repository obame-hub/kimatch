// ════════════════════════════════════════════════════════════════════════════════════════════════
// RÉIMPORTER LES APPELS DE SALESFORCE QUI MANQUENT DANS KIMATCH
//
// Michel, 31/08/2026 : les consignations d'appels ne remontent pas toutes.
//
// MESURÉ : 16 610 appels dans Salesforce, 8 786 dans Kimatch, 7 824 absents. Et la cause n'est pas
// un bug d'import — c'est un rattachement absent :
//
//   3 570  appels sur un LEAD Salesforce. Kimatch n'a que 4 pistes et aucune colonne d'identifiant
//          Salesforce sur `pistes` : ces appels n'ont nulle part où aller. Les importer suppose
//          d'importer d'abord les Leads comme pistes — c'est un chantier, pas un correctif.
//   3 034  sans aucun rattachement, y compris DANS Salesforce. Irrécupérables par nature.
//   1 102  rattachés à un compte sans contact.
//     118  rattachés à un contact.
//
// CE SCRIPT N'IMPORTE QUE CE QU'IL PEUT RATTACHER POUR DE VRAI : le contact quand il est reconnu (le
// compte en découle, c'est le contact qui le porte), le compte seul sinon et sans ambiguïté. Une
// consignation qui n'apparaît sur aucune fiche ne consigne rien.
//
// LE DICTIONNAIRE SALESFORCE → KIMATCH EST APPRIS SUR LES DONNÉES. Ni `comptes` ni `contacts` ne
// portent de colonne `id_salesforce` : le rapprochement se fait sur les 31 793 interactions déjà
// importées, qui portent à la fois le Id de la Task et les identifiants Kimatch. 0 conflit sur les
// 1 809 contacts ; 86 comptes sur 1 330 pointent vers deux comptes Kimatch et sont écartés.
//
// IDEMPOTENT : `source_externe_id` est la clé, comparée avant insertion. Relancer n'ajoute rien.
// RÉVERSIBLE : toutes les lignes écrites portent leur Id Salesforce, le retour arrière est un delete.
//
// Usage :
//   node scripts_scratch/importer-appels.cjs <dossier-des-exports> --simulation
//   node scripts_scratch/importer-appels.cjs <dossier-des-exports> --ecrire
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const S = process.argv[2]
const ecrire = process.argv.includes('--ecrire')
if (!S || (!ecrire && !process.argv.includes('--simulation'))) {
  console.log('Usage : node scripts_scratch/importer-appels.cjs <dossier> --simulation|--ecrire')
  process.exit(1)
}
const m = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)

function lireCsv(f) {
  const l = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((x) => x.trim())
  const t = l[0].split(',').map((k) => k.trim().replace(/^﻿/, ''))
  return l.slice(1).map((x) => {
    const v = []
    let cur = ''
    let dans = false
    for (const ch of x) {
      if (ch === '"') { dans = !dans; continue }
      if (ch === ',' && !dans) { v.push(cur); cur = ''; continue }
      cur += ch
    }
    v.push(cur)
    const o = {}
    t.forEach((k, i) => { o[k] = (v[i] ?? '').trim() })
    return o
  })
}

const SQL_INSERT =
  'insert into interactions' +
  ' (type_interaction_id, date_interaction, objet, resume, sens, resultat,' +
  '  duree_appel_secondes, compte_id, contact_id, source_externe_id, actif, auteur_profil_id)' +
  ' values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)'

async function principal() {
  const appels = JSON.parse(fs.readFileSync(path.join(S, 'sf_calls_full.json'), 'utf8').replace(/^﻿/, '')).result.records
  const parId = new Map(lireCsv(path.join(S, 'sf_tasks_all.csv')).map((r) => [r.Id, r]))

  const c = new Client({
    connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const dejaLa = new Set(
    (await c.query('select source_externe_id from interactions where source_externe_id is not null'))
      .rows.map((r) => r.source_externe_id),
  )
  const compteDuContact = new Map(
    (await c.query('select id, compte_id from contacts')).rows.map((r) => [r.id, r.compte_id]),
  )
  const typeAppel = (await c.query("select id from types_interactions where code = 'APPEL'")).rows[0]
  if (!typeAppel) throw new Error("Le type d'interaction APPEL est introuvable.")

  // ── Le dictionnaire, appris sur ce qui est déjà là ──
  const rows = (await c.query(
    "select source_externe_id, compte_id, contact_id from interactions where source_externe_id like '00T%'",
  )).rows
  const dicoContact = new Map()
  const comptesVus = new Map()
  for (const r of rows) {
    const t = parId.get(r.source_externe_id)
    if (!t) continue
    if (t.WhoId && r.contact_id) dicoContact.set(t.WhoId, r.contact_id)
    if (t.AccountId && r.compte_id) {
      if (!comptesVus.has(t.AccountId)) comptesVus.set(t.AccountId, new Set())
      comptesVus.get(t.AccountId).add(r.compte_id)
    }
  }
  // Un AccountId qui a mené à deux comptes Kimatch ne prouve rien : on l'écarte plutôt que de
  // trancher au hasard. 86 sur 1 330.
  const dicoCompte = new Map(
    [...comptesVus].filter(([, s]) => s.size === 1).map(([k, s]) => [k, [...s][0]]),
  )

  // ── QUI A PASSÉ L'APPEL ──
  // L'import précédent renseigne `auteur_profil_id` (7 927 lignes sur 8 786) et laisse `cree_par_id`
  // et `proprietaire_id` vides. On suit la même convention : un appel repris de Salesforce n'a pas
  // été créé par quelqu'un dans Kimatch, mais il a bien été passé par un commercial.
  //
  // Le dictionnaire OwnerId → profil s'apprend comme les autres, sur les appels déjà importés :
  // `profils` ne porte aucune colonne d'identifiant Salesforce.
  const dicoProfil = new Map()
  {
    const dejaAppels = (await c.query(
      "select i.source_externe_id, i.auteur_profil_id from interactions i" +
      " join types_interactions t on t.id = i.type_interaction_id" +
      " where t.code = 'APPEL' and i.source_externe_id like '00T%' and i.auteur_profil_id is not null",
    )).rows
    const ownerParTask = new Map(appels.map((a) => [a.Id, a.OwnerId]))
    const vus = new Map()
    for (const r of dejaAppels) {
      const o = ownerParTask.get(r.source_externe_id)
      if (!o) continue
      if (!vus.has(o)) vus.set(o, new Set())
      vus.get(o).add(r.auteur_profil_id)
    }
    // Un propriétaire Salesforce qui a mené à deux profils Kimatch est écarté : on préfère un appel
    // sans auteur à un appel attribué au mauvais commercial.
    for (const [o, s2] of vus) if (s2.size === 1) dicoProfil.set(o, [...s2][0])
    console.log('profils Salesforce reconnus           : ' + dicoProfil.size +
                ' (ecartes pour ambiguite : ' + [...vus.values()].filter((x) => x.size > 1).length + ')')
  }

  const aEcrire = []
  const bilan = {
    deja: 0, sur_lead: 0, sans_lien: 0, compte_ambigu: 0, retenu_contact: 0, retenu_compte: 0,
  }
  for (const a of appels) {
    if (dejaLa.has(a.Id)) { bilan.deja++; continue }
    const contactId = a.WhoId ? dicoContact.get(a.WhoId) : null
    if (contactId) {
      bilan.retenu_contact++
      aEcrire.push({ a, contact_id: contactId, compte_id: compteDuContact.get(contactId) ?? null })
      continue
    }
    if (a.WhoId && a.WhoId.startsWith('00Q')) { bilan.sur_lead++; continue }
    if (a.AccountId) {
      const k = dicoCompte.get(a.AccountId)
      if (k) { bilan.retenu_compte++; aEcrire.push({ a, contact_id: null, compte_id: k }); continue }
      bilan.compte_ambigu++
      continue
    }
    bilan.sans_lien++
  }

  console.log('appels Salesforce                     : ' + appels.length)
  console.log('  deja dans Kimatch                   : ' + bilan.deja)
  console.log('  sur un Lead, sans piste ou aller    : ' + bilan.sur_lead)
  console.log('  sans aucun rattachement Salesforce  : ' + bilan.sans_lien)
  console.log('  compte Salesforce non resolu        : ' + bilan.compte_ambigu)
  console.log('  A IMPORTER via le contact           : ' + bilan.retenu_contact)
  console.log('  A IMPORTER via le compte seul       : ' + bilan.retenu_compte)
  console.log('  TOTAL A IMPORTER                    : ' + aEcrire.length)

  if (!ecrire) {
    console.log('')
    console.log('SIMULATION : rien n a ete ecrit.')
    for (const e of aEcrire.slice(0, 3)) {
      console.log('  ex. ' + e.a.Id + ' | ' + (e.a.Subject || 'sans objet') + ' | ' + e.a.CreatedDate +
                  ' | compte ' + (e.compte_id ? 'oui' : 'non') + ' | contact ' + (e.contact_id ? 'oui' : 'non') +
                  ' | auteur ' + (e.a.OwnerId && dicoProfil.get(e.a.OwnerId) ? 'oui' : 'non'))
    }
    await c.end()
    return
  }

  // ── L'écriture, en une transaction : un import à moitié fait serait pire que pas d'import ──
  await c.query('begin')
  let n = 0
  try {
    for (const e of aEcrire) {
      const a = e.a
      // `sens` : Salesforce le dit dans CallType. Absent, on ne l'invente pas.
      const sens = a.CallType === 'Inbound' ? 'entrant' : a.CallType === 'Outbound' ? 'sortant' : null
      await c.query(SQL_INSERT, [
        typeAppel.id,
        a.CreatedDate || (a.ActivityDate ? a.ActivityDate + 'T12:00:00Z' : null),
        (a.Subject || 'Appel').slice(0, 500),
        a.Description || null,
        sens,
        a.CallDisposition || a.Status || null,
        a.CallDurationInSeconds === undefined ? null : a.CallDurationInSeconds,
        e.compte_id,
        e.contact_id,
        a.Id,
        (a.OwnerId && dicoProfil.get(a.OwnerId)) || null,
      ])
      n++
    }
    await c.query('commit')
  } catch (err) {
    await c.query('rollback')
    throw err
  }
  fs.writeFileSync(path.join(S, 'appels_importes.txt'), aEcrire.map((e) => e.a.Id).join('\n'))
  console.log('')
  console.log('ECRIT : ' + n + ' appels.')
  console.log('Retour arriere possible : les ' + n + ' Id Salesforce sont dans appels_importes.txt,')
  console.log('un delete sur interactions.source_externe_id les retire sans toucher au reste.')
  await c.end()
}

principal().catch((e) => { console.error('ERREUR : ' + e.message); process.exit(1) })
