/* JOUER UNE MIGRATION POUR DE VRAI, PUIS L'ANNULER.
   `--simulation` ne vérifie que la FORME du fichier : elle ne l'exécute pas. Ici on exécute tout —
   DDL, déclencheurs, garde-fou compris — et on remplace le `commit` final par un `rollback`.
   Usage : node .essai-migration.cjs <horodatage> */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const horodatage = process.argv[2]
const dossier = 'supabase/migrations'
const fichier = fs.readdirSync(dossier).find((f) => f.startsWith(horodatage))
if (!fichier) { console.error('Migration introuvable :', horodatage); process.exit(1) }
let sql = fs.readFileSync(path.join(dossier, fichier), 'utf8')
sql = sql.replace(/^\s*begin\s*;\s*$/mi, '').replace(/^\s*commit\s*;\s*$/mi, '')
;(async () => {
  const cl = new Client({ connectionString: env('SUPABASE_DB_URL'), ssl: { rejectUnauthorized: false }, statement_timeout: 300000 })
  await cl.connect()
  cl.on('notice', (m) => console.log('   notice :', m.message))
  console.log(`Essai de ${fichier}\n`)
  await cl.query('begin')
  let verdict = '✔ LA MIGRATION PASSE'
  try {
    await cl.query(sql)
  } catch (e) {
    verdict = `✗ ÉCHEC : ${e.message}`
    if (e.where) verdict += `\n   où : ${String(e.where).split('\n')[0]}`
  }
  await cl.query('rollback')
  console.log(`\n${verdict}`)
  console.log('(annulée — la base est inchangée)')
  await cl.end()
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })
