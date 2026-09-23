// ÉPROUVER UNE MIGRATION SANS L'APPLIQUER
//
// `appliquer-migration.cjs --simulation` ne se connecte même pas : il vérifie le nom du fichier et
// s'arrête. C'est utile, mais ça ne dit RIEN de ce que Postgres pense du SQL — une colonne mal
// nommée, une contrainte qui refuse la valeur qu'on vient d'ajouter, un garde-fou qui échoue
// passent tous la simulation sans un mot.
//
// Ce script-ci exécute VRAIMENT la migration, garde-fou compris, puis annule tout par `rollback`.
// La base retrouve son état d'avant, et l'on sait si la migration tient debout.
//
// Usage :   node .essai-migration.cjs 20260923143000
//
// COMMENT L'ANNULATION EST GARANTIE : nos migrations portent leur propre `begin;` … `commit;`.
// On les prive de ces deux mots — on ouvre nous-même la transaction, et l'on termine par
// `rollback`. Un `commit` laissé dans le corps refermerait la transaction avant la fin et rendrait
// l'annulation impossible : c'est le seul vrai risque, donc on refuse le fichier s'il en reste un.
//
// CE QU'IL NE PEUT PAS DIRE : une migration annulée n'a rien laissé en base, donc elle ne prouve
// pas non plus que les données rattrapées sont les bonnes. Elle prouve que le SQL s'exécute et que
// le garde-fou passe. C'est Naoëlle qui applique pour de bon, avec `scripts/appliquer-migration.cjs`.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = __dirname
const DOSSIER = path.join(RACINE, 'supabase', 'migrations')

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!arg) {
  console.log('Usage : node .essai-migration.cjs <horodatage|chemin.sql>')
  console.log('')
  console.log('Migrations du dépôt (les 10 dernières) :')
  for (const f of fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.sql')).slice(-10)) {
    console.log('  ' + f)
  }
  process.exit(1)
}

let fichier = fs.existsSync(arg) && fs.statSync(arg).isFile() ? arg : null
if (!fichier) {
  const c = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.sql') && f.startsWith(arg))
  if (c.length !== 1) {
    console.error(c.length === 0
      ? 'Aucune migration ne commence par « ' + arg + ' ».'
      : 'Plusieurs migrations commencent par « ' + arg + ' » : ' + c.join(', '))
    process.exit(1)
  }
  fichier = path.join(DOSSIER, c[0])
}

const correspondance = fs.readFileSync(path.join(RACINE, '.env.local'), 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
if (!correspondance) {
  console.error('SUPABASE_DB_URL absent de .env.local.')
  process.exit(1)
}
const dbUrl = correspondance[1].trim().replace(/^["']|["']$/g, '')

const brut = fs.readFileSync(fichier, 'utf8')

// On retire le `begin;` et le `commit;` de tête et de queue : la transaction, c'est nous qui la
// tenons, pour pouvoir l'annuler.
const corps = brut.replace(/^\s*begin\s*;/im, '').replace(/^\s*commit\s*;\s*$/im, '')

// LE SEUL DANGER RÉEL. Un `commit;` restant au milieu du corps refermerait la transaction et rendrait
// le `rollback` sans effet : la migration serait appliquée pour de bon, sans qu'on l'ait voulu.
if (/^\s*commit\s*;/im.test(corps)) {
  console.error('Il reste un « commit; » dans le corps : l’annulation ne serait pas garantie.')
  console.error('Refusé — rien n’a été exécuté.')
  process.exit(1)
}

;(async () => {
  console.log('fichier   : ' + path.basename(fichier))
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  // Les `raise notice` des garde-fous sont le verdict de la migration sur elle-même : sans cette
  // écoute, node-postgres les avale.
  client.on('notice', (n) => { if (n.message) console.log('notice    : ' + n.message) })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(corps)
    console.log('resultat  : LE SQL PASSE, garde-fou compris.')
  } catch (e) {
    console.log('resultat  : ECHEC — ' + e.message)
    if (e.hint) console.log('indice    : ' + e.hint)
    if (e.where) console.log('dans      : ' + String(e.where).split('\n')[0])
    process.exitCode = 1
  } finally {
    // TOUJOURS, y compris après un succès : ce script n'applique jamais rien.
    await client.query('rollback').catch(() => {})
    await client.end().catch(() => {})
    console.log('base      : inchangée (rollback).')
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
