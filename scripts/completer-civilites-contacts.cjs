// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA CIVILITÉ DES CONTACTS, REPRISE DE SALESFORCE
//
// Naoëlle, 14/09/2026 : « il faut que le nom complet de nos contacts soit divisé en trois
// sous-champs : civilité Monsieur ou Madame, nom en majuscules et prénom première lettre en
// majuscule. C'est très très important pour plus tard quand on fera des rapports, des stats. »
//
// Le découpage existait déjà ; la mise en forme est passée en base (migration 20260914180000, un
// déclencheur qui s'applique à chaque écriture). Reste la civilité, qui ne se devine pas :
//
//     Kimatch      33 contacts sur 3 419 en ont une
//     Salesforce  1 840 sur 3 373   —  1 079 « M. », 736 « Mme », 13 « Monsieur », 12 « Madame »
//
// ON NE LA DÉDUIT PAS DU PRÉNOM. Ce serait faux une fois sur dix, et se tromper de genre sur une
// personne est le genre d'erreur qu'un client remarque. Ce qui n'est pas dans Salesforce reste
// vide, ce qui est honnête et se corrige à la main.
//
// La normalisation « M. » → « Monsieur » n'est pas faite ici : le déclencheur s'en charge, quelle
// que soit l'origine de l'écriture. C'est le principe même de l'avoir mise en base.
//
// ══ L'EXPORT ATTENDU ═════════════════════════════════════════════════════════════════════════
//
//   sf data query -o KiweeOrg --json --result-format json ^
//     -q "SELECT Id, Salutation FROM Contact WHERE Salutation != null" > civilites.json
//
// SANS `--appliquer`, RIEN N'EST ÉCRIT.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require(path.join(process.cwd(), 'node_modules', 'pg'))

const FICHIER = process.argv.filter((a) => a.endsWith('.json'))[0]
if (!FICHIER) {
  console.error('Usage : node scripts/completer-civilites-contacts.cjs <civilites.json> [--appliquer]')
  process.exit(1)
}
const APPLIQUER = process.argv.includes('--appliquer')

const url = fs.readFileSync('.env.local', 'utf8').split('\n')
  .find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim()

;(async () => {
  const brut = fs.readFileSync(FICHIER, 'utf8').replace(/^﻿/, '')
  const sf = JSON.parse(brut.slice(brut.indexOf('{'))).result.records

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 300000 })
  await c.connect()

  const contacts = new Map((await c.query(
    `select id, id_salesforce, civilite from public.contacts where id_salesforce is not null`))
    .rows.map((r) => [r.id_salesforce.slice(0, 15), r]))

  const aEcrire = [], sansContact = [], dejaLa = []
  for (const s of sf) {
    const k = contacts.get(s.Id.slice(0, 15))
    if (!k) { sansContact.push(s.Id); continue }
    /* ON NE RÉÉCRIT PAS UNE CIVILITÉ DÉJÀ POSÉE. Les 33 existantes ont pu être corrigées à la main
       dans Kimatch ; Salesforce n'a pas autorité sur ce qu'on a rectifié depuis. */
    if (k.civilite) { dejaLa.push(s.Id); continue }
    aEcrire.push({ id: k.id, civilite: s.Salutation })
  }

  const parValeur = {}
  for (const e of aEcrire) parValeur[e.civilite] = (parValeur[e.civilite] || 0) + 1

  console.log('══ CE QUE LA REPRISE FERAIT ══')
  console.log(`civilités lues dans Salesforce : ${sf.length}`)
  console.log(`À ÉCRIRE                       : ${aEcrire.length}  ${JSON.stringify(parValeur)}`)
  console.log(`déjà renseignées ici           : ${dejaLa.length}`)
  console.log(`contact introuvable            : ${sansContact.length}`)

  if (!APPLIQUER) {
    console.log('\nSimulation seule. Relancer avec --appliquer pour écrire.')
    await c.end()
    return
  }

  await c.query('begin')
  try {
    // Une seule requête : `unnest` déplie les deux tableaux côte à côte.
    await c.query(
      `update public.contacts k set civilite = n.civilite, date_modification = now()
         from (select unnest($1::uuid[]) as id, unnest($2::text[]) as civilite) n
        where n.id = k.id`,
      [aEcrire.map((e) => e.id), aEcrire.map((e) => e.civilite)])

    /* LE CONTRÔLE PORTE SUR CE QUE LE SCRIPT ÉCRIT, et il vérifie ce qui compte vraiment : que le
       déclencheur a bien normalisé. Si « M. » ressortait tel quel, un rapport aurait quatre
       civilités au lieu de deux et la demande du 14/09 serait ratée en silence. */
    const ids = aEcrire.map((e) => e.id)
    const k = (await c.query(
      `select count(*) filter (where id = any($1) and civilite is not null)::int as posees,
              count(*) filter (where id = any($1)
                               and civilite not in ('M.', 'Mme'))::int as non_normalisees,
              count(*) filter (where civilite is not null)::int as total_avec_civilite
         from public.contacts`, [ids])).rows[0]
    if (k.posees < aEcrire.length) {
      throw new Error(`${k.posees} civilités posées pour ${aEcrire.length} attendues`)
    }
    if (k.non_normalisees > 0) {
      throw new Error(`${k.non_normalisees} civilité(s) ne valent ni « M. » ni « Mme » : le déclencheur ne s'applique pas`)
    }

    await c.query('commit')
    console.log(`\n✓ ${aEcrire.length} civilités reprises, toutes normalisées.`)
    console.log(`  ${k.total_avec_civilite} contacts sur 3 419 ont désormais une civilité.`)
  } catch (e) {
    await c.query('rollback')
    console.error('\n✗ Rien n\'a été écrit : ' + e.message)
    process.exitCode = 1
  }
  await c.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
