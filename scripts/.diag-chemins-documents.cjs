/**
 * LES CHEMINS DE `documents.url` CORRESPONDENT-ILS À `storage.objects.name` ?
 *
 * La policy à venir fait reposer la lecture d'un fichier sur l'existence de sa fiche. Si le
 * rapprochement échoue — un accent encodé d'un côté et pas de l'autre —, l'équipe perd l'accès à
 * des documents bien réels. On mesure AVANT d'écrire la règle, sur les vraies données.
 *
 * On compare trois méthodes, et l'on retient celle qui rapproche le plus.
 */
const fs = require('fs')
const { Client } = require('pg')

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const c = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await c.connect()

  const total = (await c.query("select count(*) n from storage.objects where bucket_id='documents'")).rows[0].n
  const docs = (await c.query('select count(*) n from documents where url is not null')).rows[0].n
  console.log('')
  console.log('   fichiers dans le seau : ' + total)
  console.log('   lignes documents avec url : ' + docs)

  // ── Les chemins, des deux côtés, ramenés en JavaScript pour comparer proprement ──
  const noms = (await c.query(
    "select name from storage.objects where bucket_id='documents'")).rows.map((r) => r.name)
  const urls = (await c.query(
    "select url from documents where url is not null")).rows.map((r) => r.url)

  const MARQ = '/documents/'
  const cheminsDocs = new Set()
  const cheminsDocsBruts = new Set()
  for (const u of urls) {
    const i = u.indexOf(MARQ)
    if (i < 0) continue
    const brut = u.slice(i + MARQ.length)
    cheminsDocsBruts.add(brut)
    try { cheminsDocs.add(decodeURIComponent(brut)) } catch { cheminsDocs.add(brut) }
  }

  let apparies = 0
  let appariesBruts = 0
  const orphelins = []
  for (const n of noms) {
    if (cheminsDocs.has(n)) apparies++
    else if (cheminsDocsBruts.has(n)) appariesBruts++
    else orphelins.push(n)
  }

  console.log('')
  console.log('══ RAPPROCHEMENT ══')
  console.log('   par le chemin DÉCODÉ      : ' + apparies + ' / ' + total)
  console.log('   par le chemin brut seul   : ' + appariesBruts)
  console.log('   sans fiche correspondante : ' + orphelins.length)

  if (orphelins.length) {
    console.log('')
    console.log('══ CE QUI N A PAS DE FICHE (10 premiers) ══')
    for (const o of orphelins.slice(0, 10)) console.log('   ' + o.slice(0, 84))
    const parDossier = {}
    for (const o of orphelins) {
      const d = o.split('/')[0]
      parDossier[d] = (parDossier[d] || 0) + 1
    }
    console.log('')
    console.log('══ PAR DOSSIER ══')
    console.table(Object.entries(parDossier)
      .sort((a, b) => b[1] - a[1])
      .map(([dossier, n]) => ({ dossier, orphelins: n })))
  }

  const couverture = ((apparies + appariesBruts) / Number(total) * 100).toFixed(1)
  console.log('')
  console.log('   couverture : ' + couverture + ' %')
  console.log(Number(couverture) > 95
    ? '   -> la regle « un fichier suit sa fiche » tient.'
    : '   *** trop de fichiers sans fiche : la regle couperait l equipe ***')

  await c.end()
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
