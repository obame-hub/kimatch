// Applique UN fichier de migration sur la base Supabase de production.
//
// Existe parce que ni psql ni la CLI Supabase ne sont installés sur ce poste, et que certaines
// migrations générées dépassent ce que l'éditeur SQL du navigateur accepte. Vit dans le dépôt et non
// dans un dossier temporaire : c'est un outil qui sert à chaque migration.
//
// Usage, depuis n'importe quel dossier :
//
//   node C:\Users\nghou\kiwee-os\scripts\appliquer-migration.cjs 20260819120000
//
// L'argument est soit le début du nom du fichier (l'horodatage suffit), soit un chemin complet.
// Sans argument, le script liste les migrations du dépôt et n'applique rien.
//
// Ajouter --simulation pour vérifier quel fichier serait appliqué sans toucher à la base : le script
// résout le nom, contrôle le garde-fou, et s'arrête avant même de se connecter.
//
// L'URL de connexion est lue dans .env.local, à la racine du dépôt — elle n'est jamais dans le code
// ni affichée, y compris en cas d'erreur.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const DOSSIER_MIGRATIONS = path.join(RACINE, 'supabase', 'migrations')

function resoudreFichier(arg) {
  if (!arg) return null
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) return arg
  // Résolution par préfixe : l'horodatage seul suffit, on ne recopie pas un nom de 60 caractères.
  const candidats = fs
    .readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && f.startsWith(arg))
  if (candidats.length === 1) return path.join(DOSSIER_MIGRATIONS, candidats[0])
  if (candidats.length === 0) {
    console.error('Aucune migration ne commence par « ' + arg + ' ».')
  } else {
    // On en montre quelques-unes : cracher 40 noms noie le message au lieu d'aider.
    console.error('Plusieurs migrations commencent par « ' + arg + ' » :')
    for (const c of candidats.slice(0, 8)) console.error('  ' + c)
    if (candidats.length > 8) console.error('  … et ' + (candidats.length - 8) + ' autres')
    console.error('Préciser davantage.')
  }
  process.exit(1)
}

const argv = process.argv.slice(2)
const simulation = argv.includes('--simulation')
const fichier = resoudreFichier(argv.find((a) => !a.startsWith('--')))
if (!fichier) {
  console.log('Usage : node scripts/appliquer-migration.cjs <horodatage|chemin.sql> [--simulation]')
  console.log('')
  console.log('Migrations du dépôt (les 12 dernières) :')
  const toutes = fs.readdirSync(DOSSIER_MIGRATIONS).filter((f) => f.endsWith('.sql'))
  for (const f of toutes.slice(-12)) console.log('  ' + f)
  process.exit(1)
}

const cheminEnv = path.join(RACINE, '.env.local')
if (!fs.existsSync(cheminEnv)) {
  console.error('.env.local introuvable à la racine du dépôt : ' + cheminEnv)
  process.exit(1)
}
const correspondance = fs.readFileSync(cheminEnv, 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
if (!correspondance) {
  console.error('SUPABASE_DB_URL absent de .env.local.')
  process.exit(1)
}
const dbUrl = correspondance[1].trim().replace(/^["']|["']$/g, '')
const sql = fs.readFileSync(fichier, 'utf8')

// GARDE-FOU. Toutes nos migrations portent leurs propres begin/commit : en cas d'erreur SQL, Postgres
// annule le lot entier et la base reste dans son état d'avant. Un fichier qui en manque s'appliquerait
// instruction par instruction et pourrait rester à moitié fait — on refuse plutôt que de le découvrir
// après coup.
if (!/^\s*begin\s*;/im.test(sql) || !/^\s*commit\s*;/im.test(sql)) {
  console.error("Ce fichier n'a pas de begin;/commit; : il pourrait s'appliquer à moitié.")
  console.error('Refusé. Encadrer la migration par begin; ... commit; puis relancer.')
  process.exit(1)
}

if (simulation) {
  // Tout ce qui pouvait être contrôlé sans écrire l'a été : le fichier existe, il est unique pour ce
  // préfixe, il est atomique, et la connexion est configurée. On s'arrête là.
  console.log('fichier   : ' + path.basename(fichier))
  console.log('taille    : ' + Math.round(sql.length / 1024) + ' Ko')
  console.log('instructions SQL (hors commentaires) :')
  for (const ligne of sql
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'))) {
    console.log('  ' + ligne)
  }
  console.log('resultat  : SIMULATION — rien n a ete applique. Relancer sans --simulation.')
  process.exit(0)
}

// Pannes réseau constatées sur ce poste le 18/08/2026 : la résolution DNS du pooler Supabase échoue
// par intermittence (ENOTFOUND), puis remarche quelques secondes plus tard.
//
// On retente donc la CONNEXION, jamais la migration elle-même. Rejouer une migration qui aurait
// commencé à s'appliquer serait le vrai danger ; ici c'est impossible, puisqu'on ne retente que tant
// qu'aucune requête n'est partie.
const ERREURS_RESEAU = ['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']

async function connecter(essais = 5) {
  for (let i = 1; i <= essais; i++) {
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
    try {
      await client.connect()
      return client
    } catch (e) {
      await client.end().catch(() => {})
      if (!ERREURS_RESEAU.includes(e.code) || i === essais) throw e
      const attente = i * 2
      console.log(
        'reseau    : ' + e.code + ' — nouvelle tentative dans ' + attente + ' s (' + i + '/' + (essais - 1) + ')',
      )
      await new Promise((r) => setTimeout(r, attente * 1000))
    }
  }
  throw new Error('connexion impossible')
}

async function main() {
  console.log('fichier   : ' + path.basename(fichier))
  console.log('taille    : ' + Math.round(sql.length / 1024) + ' Ko')

  let client
  try {
    client = await connecter()
  } catch (e) {
    console.log('resultat  : ECHEC — la base n a pas pu etre jointe, rien n a ete applique')
    console.log('erreur    : ' + (e.code || '') + ' ' + e.message)
    console.log('conseil   : c est le reseau et non la migration. Relancer la meme commande.')
    process.exitCode = 1
    return
  }

  const debut = process.hrtime.bigint()
  try {
    await client.query(sql)
    console.log(
      'resultat  : APPLIQUEE en ' + Math.round(Number(process.hrtime.bigint() - debut) / 1e6) + ' ms',
    )
  } catch (e) {
    console.log('resultat  : ECHEC — rien n a ete applique (la transaction a ete annulee)')
    console.log('erreur    : ' + e.code + ' — ' + e.message)
    if (e.position) console.log('position  : caractere ' + e.position)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
