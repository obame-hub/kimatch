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

/**
 * Decoupe un fichier SQL en instructions, pour les envoyer une par une.
 *
 * N'EST UTILISE QUE POUR LES MIGRATIONS SANS TRANSACTION, et c'est ce qui rend ce decoupage sur
 * `;` acceptable : le garde-fou a deja verifie qu'un tel fichier ne fait que poser des index et
 * reanalyser. On gere quand meme les chaines et les blocs `$$…$$`, parce qu'un decoupage naif qui
 * marche aujourd'hui est un piege pour le fichier de demain.
 */
function decouperInstructions(texte) {
  const instructions = []
  let courante = ''
  let i = 0
  while (i < texte.length) {
    const c = texte[i]

    // Commentaire de ligne : jusqu'au saut de ligne.
    if (c === '-' && texte[i + 1] === '-') {
      const fin = texte.indexOf('\n', i)
      i = fin === -1 ? texte.length : fin + 1
      continue
    }
    // Commentaire de bloc.
    if (c === '/' && texte[i + 1] === '*') {
      const fin = texte.indexOf('*/', i + 2)
      i = fin === -1 ? texte.length : fin + 2
      continue
    }
    // Chaine litterale : le `;` qu'elle contiendrait ne decoupe rien.
    if (c === "'") {
      const debut = i
      i += 1
      while (i < texte.length && !(texte[i] === "'" && texte[i + 1] !== "'")) {
        i += texte[i] === "'" && texte[i + 1] === "'" ? 2 : 1
      }
      i += 1
      courante += texte.slice(debut, i)
      continue
    }
    // Bloc `$$ … $$` ou `$nom$ … $nom$` (corps de fonction).
    if (c === '$') {
      const marque = /^\$[A-Za-z_]*\$/.exec(texte.slice(i))
      if (marque) {
        const fin = texte.indexOf(marque[0], i + marque[0].length)
        const stop = fin === -1 ? texte.length : fin + marque[0].length
        courante += texte.slice(i, stop)
        i = stop
        continue
      }
    }
    if (c === ';') {
      if (courante.trim()) instructions.push(courante.trim())
      courante = ''
      i += 1
      continue
    }
    courante += c
    i += 1
  }
  if (courante.trim()) instructions.push(courante.trim())
  return instructions
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
//
// ══ LA SEULE EXCEPTION, ET ELLE SE DÉCLARE ══════════════════════════════════════════════════════
//
// `create index concurrently` NE PEUT PAS s'exécuter dans une transaction : Postgres le refuse avec
// « CREATE INDEX CONCURRENTLY cannot run inside a transaction block ». En échange, il ne pose aucun
// verrou d'écriture — c'est ce qui permet d'indexer une table de 222 000 lignes en pleine journée
// sans arrêter l'équipe. Un `create index` ordinaire, lui, verrouille la table pendant toute la
// construction.
//
// Un fichier peut donc réclamer l'exception, en portant cette ligne EXACTE en tête :
//
//     -- MIGRATION-SANS-TRANSACTION: <la raison, en clair>
//
// ON NE FAIT PAS SAUTER LE GARDE-FOU, ON LE DÉPLACE. Le fichier qui se déclare ainsi accepte une
// contrainte que les autres n'ont pas : CHAQUE INSTRUCTION DOIT ÊTRE INDÉPENDANTE ET REJOUABLE.
// Concrètement, `create index concurrently IF NOT EXISTS` et rien qui modifie des données. Une
// interruption laisse alors un travail à moitié fait mais COHÉRENT : on relance le fichier, il
// reprend où il s'était arrêté.
//
// C'est le contraire d'une migration ordinaire, où l'atomicité fait tout le travail. D'où
// l'obligation d'écrire la raison : elle force à se demander si le cas la mérite vraiment, et le
// prochain à lire le fichier saura pourquoi il est différent.
const exception = sql.match(/^\s*--\s*MIGRATION-SANS-TRANSACTION\s*:\s*(.+)$/im)
if (!exception && (!/^\s*begin\s*;/im.test(sql) || !/^\s*commit\s*;/im.test(sql))) {
  console.error("Ce fichier n'a pas de begin;/commit; : il pourrait s'appliquer à moitié.")
  console.error('Refusé. Encadrer la migration par begin; ... commit; puis relancer.')
  console.error('')
  console.error("Si c'est délibéré (create index concurrently), déclarer l'exception en tête :")
  console.error('  -- MIGRATION-SANS-TRANSACTION: <la raison>')
  process.exit(1)
}
if (exception) {
  // Une migration hors transaction qui écrirait des données pourrait laisser la base à moitié
  // modifiée sans moyen de revenir en arrière. On vérifie donc que le fichier ne fait que ce pour
  // quoi l'exception existe. Les commentaires sont retirés d'abord, sinon la phrase qui explique
  // pourquoi on n'écrit pas de données déclencherait le refus.
  const instructions = sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  // `update\s+[\w."]+\s+set` et non `update\b` : la seconde forme laissait passer
  // `update comptes set …` parce que le `\b` final tombait au milieu du nom de table. Vérifié en
  // écrivant ce contrôle — un garde-fou qu'on ne met pas à l'épreuve ne garde rien.
  const interdits = instructions.match(
    /\b(insert\s+into|update\s+[\w."]+\s+set|delete\s+from|drop\s+table|truncate)/i,
  )
  if (interdits) {
    console.error('Ce fichier se déclare sans transaction, mais il écrit des données :')
    console.error('  « ' + interdits[0] + ' »')
    console.error('')
    console.error("Hors transaction, une interruption laisserait la base a moitié modifiée sans")
    console.error('retour possible. Séparer : les index dans ce fichier, les données dans un autre,')
    console.error('celui-là avec begin;/commit;.')
    process.exit(1)
  }
  console.log('SANS TRANSACTION — raison déclarée : ' + exception[1].trim())
  console.log('Chaque instruction doit être rejouable. En cas d’arrêt, relancer ce même fichier.')
  console.log('')
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
      // LES NOTICES SONT LE RESULTAT, PAS DU BRUIT. Nos migrations annoncent par `raise notice` le
      // verdict de leur garde-fou -- « Garde-fou passe : ... » -- et c'est la seule preuve qu'elles
      // ont verifie leur propre travail. node-postgres ne les imprime pas sans qu'on les ecoute :
      // elles etaient donc avalees, y compris quand elles disaient l'essentiel.
      client.on('notice', (n) => { if (n.message) console.log('notice    : ' + n.message) })
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
    // SIGNER L'HISTORIQUE. Le declencheur d'audit ecrit `auth.uid()`, qui vaut NULL ici : une
    // migration n'est personne. Resultat, 122 030 des 122 424 lignes d'historique n'avaient aucun
    // auteur et l'ecran affichait « Auteur inconnu » — ce qui se lit comme un bug alors que c'est
    // un fait. Ce reglage de session dit ce qui ecrit, et le declencheur le recopie.
    //
    // Pas `application_name` : le pooler de Supabase le remplace par « Supavisor », et tout
    // l'historique se serait retrouve signe d'un nom faux. Un reglage a nous, personne ne l'ecrase.
    // `set_config` et non `SET` : la commande SET n'accepte pas de parametre, elle veut un litteral.
    // Passer le nom du fichier par concatenation aurait marche et aurait ete une mauvaise habitude.
    await client.query('select set_config($1, $2, false)', [
      'kimatch.origine',
      'migration ' + path.basename(fichier, '.sql'),
    ])
    if (exception) {
      // ══ UNE INSTRUCTION A LA FOIS, ET C'EST TOUT LE POINT ═══════════════════════════════════
      //
      // Le pilote `pg` envoie un fichier multi-instructions en UNE seule « simple query », et
      // PostgreSQL enveloppe implicitement ce lot dans une transaction. D'ou l'echec observe le
      // 13/09/2026 en appliquant la migration des index :
      //
      //     erreur : 25001 - CREATE INDEX CONCURRENTLY cannot run inside a transaction block
      //
      // Le garde-fou avait bien reconnu l'exception, mais l'EXECUTION restait transactionnelle :
      // declarer ne suffit pas, il faut aussi executer autrement. Envoyer les instructions une par
      // une les met en autocommit, ce que `create index concurrently` exige.
      //
      // RIEN N'AVAIT ETE APPLIQUE lors de cet echec : la transaction implicite a ete annulee, et
      // le script l'a dit. C'est le comportement voulu -- une erreur bruyante plutot qu'un demi-
      // travail silencieux.
      const instructions = decouperInstructions(sql)
      console.log('instructions : ' + instructions.length + ' (une par une, hors transaction)')
      for (let i = 0; i < instructions.length; i++) {
        const debutUne = process.hrtime.bigint()
        const apercu = instructions[i].replace(/\s+/g, ' ').slice(0, 70)
        try {
          await client.query(instructions[i])
        } catch (e) {
          // PAS DE ROLLBACK POSSIBLE, et le dire est le minimum : les instructions precedentes
          // sont passees et le restent. Le fichier est rejouable (`if not exists`), donc la
          // reprise consiste a le relancer une fois la cause levee.
          console.error('')
          console.error('  ECHEC a l instruction ' + (i + 1) + '/' + instructions.length + ' : ' + apercu)
          console.error('  ' + (e.code ? e.code + ' - ' : '') + e.message)
          console.error('')
          console.error('  Les ' + i + ' instructions precedentes SONT APPLIQUEES (pas de rollback hors')
          console.error('  transaction). Ce fichier est rejouable : corriger la cause, puis relancer.')
          throw e
        }
        const ms = Math.round(Number(process.hrtime.bigint() - debutUne) / 1e6)
        console.log('  ' + String(i + 1).padStart(2) + '/' + instructions.length + '  ' + String(ms).padStart(6) + ' ms  ' + apercu)
      }
    } else {
      await client.query(sql)
    }
    console.log(
      'resultat  : APPLIQUEE en ' + Math.round(Number(process.hrtime.bigint() - debut) / 1e6) + ' ms',
    )

    /* ══ LA CARTE DES DONNEES EST CONFRONTEE AU NOUVEAU SCHEMA, ICI ET MAINTENANT ═══════════════
       Naoelle, 08/09/2026 : « comment on fait pour la mettre a jour a chaque fois ». La reponse est
       de ne pas avoir a y penser : le schema ne change qu'ici, donc le controle a sa place ici.
       Une migration qui renomme ou supprime une colonne encore lue par un ecran se voit dans la
       seconde, et non le jour ou quelqu'un ouvre la fiche.
       ELLE N'ECHOUE JAMAIS LA MIGRATION : elle est deja appliquee et validee a ce point du script.
       Faire echouer le processus ici ferait croire a un rollback qui n'a pas eu lieu — c'est
       exactement le mensonge que la lecon du 07/09 interdit. On avertit, on ne pretend pas. */
    try {
      const { execFileSync } = require('child_process')
      execFileSync(process.execPath, [path.join(__dirname, 'cartographier-donnees.cjs'), '--verifier'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      console.log('carte     : le code et le schema sont d accord')
    } catch (e) {
      const sortie = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
      console.log('')
      console.log('carte     : ATTENTION — le code lit des colonnes que le schema ne porte plus')
      for (const l of sortie.split(/\r?\n/).filter((l) => l.trim().startsWith('!'))) {
        console.log('            ' + l.trim())
      }
      console.log('            La migration EST appliquee. Corrigez le code, puis `npm run carte`.')
    }
  } catch (e) {
    console.log('resultat  : ECHEC — rien n a ete applique (la transaction a ete annulee)')
    console.log('erreur    : ' + e.code + ' — ' + e.message)
    // `position` est un decalage en caracteres : inutilisable tel quel. Traduit en numero de
    // ligne, il pointe l'endroit du fichier ou aller regarder.
    if (e.position) {
      const ligne = sql.slice(0, Number(e.position)).split(/\r?\n/).length
      console.log('position  : ' + path.basename(fichier) + ':' + ligne)
    }
    if (e.detail) console.log('detail    : ' + e.detail)
    if (e.hint) console.log('piste     : ' + e.hint)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
