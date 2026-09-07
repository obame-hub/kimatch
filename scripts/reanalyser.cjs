// ════════════════════════════════════════════════════════════════════════════════════════════════
// RAFRAÎCHIR LES STATISTIQUES DU PLANIFICATEUR
//
// ══ POURQUOI CE SCRIPT EXISTE : L'ARRÊT DU 07/09/2026 ══
//
// L'import des appels Allo a ajouté 10 539 lignes à `interactions`, qui en comptait 74 047. Vingt
// minutes plus tard, toute l'équipe était à l'arrêt : les écrans restaient sur « Chargement… ».
//
// Ni la base ni l'API n'étaient en cause — elles répondaient. Le coupable était les STATISTIQUES :
// PostgreSQL choisit son plan d'exécution d'après une image de la table prise à la dernière analyse.
// Celle d'`interactions` datait du 1er septembre, avec 6 654 modifications non prises en compte. Le
// moteur croyait la table à sa taille d'une semaine plus tôt et la parcourait entière au lieu
// d'utiliser ses index.
//
// Ce que ça coûtait, relevé dans `pg_stat_statements` : la requête des interactions à 2 297 ms de
// moyenne, 17 664 appels, 40 578 secondes de base consommées. Ces lectures partant en rafale sur
// chaque fiche, elles saturaient le pool de connexions — les requêtes ne plantaient pas, elles
// faisaient la queue. Un `count(*)` sur la table dépassait 30 secondes ; après `analyze`, moins de 3.
//
// ══ CE QUE FAIT CE SCRIPT ══
//
// Il repère les tables dont les statistiques ont décroché, et les réanalyse. Le seuil est celui que
// PostgreSQL utilise lui-même pour déclencher son autoanalyse — 10 % des lignes plus 50 — sauf que
// l'autoanalyse peut tarder, et que vingt minutes de retard suffisent à bloquer une équipe.
//
// À LANCER APRÈS TOUT IMPORT EN MASSE. Six scripts du dépôt insèrent des milliers de lignes sans
// réanalyser : `corriger-consommations-salesforce`, `generer-signaux-echeance`,
// `importer-activites-leads-salesforce`, `importer-appels-salesforce`,
// `importer-echeances-salesforce`, `importer-leads-salesforce`. Tant qu'ils ne le font pas
// eux-mêmes, ce script est l'étape qui suit.
//
// ══ USAGE ══
//
//   node scripts/reanalyser.cjs                  liste ce qui a décroché, sans rien faire
//   node scripts/reanalyser.cjs --faire           réanalyse ce qui a décroché
//   node scripts/reanalyser.cjs --faire interactions comptes    réanalyse ces tables-là
//
// Sans argument il ne fait que regarder : `analyze` prend une minute sur une grosse table, et on ne
// lance pas une minute de travail sur la production par accident.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const faire = process.argv.includes('--faire')
const tablesDemandees = process.argv.slice(2).filter((a) => !a.startsWith('--'))

/**
 * Le seuil de décrochage.
 *
 * Celui de PostgreSQL : `autovacuum_analyze_threshold` (50) plus 10 % des lignes. En dessous, les
 * statistiques restent assez justes pour que le planificateur choisisse bien ; au-dessus, il se
 * trompe de plus en plus, et sur une grosse table il se trompe de façon spectaculaire.
 */
const REQUETE = `
  select relname,
         n_live_tup                                       as lignes,
         n_mod_since_analyze                              as modifs,
         coalesce(to_char(greatest(last_analyze, last_autoanalyze), 'DD/MM/YYYY HH24:MI'),
                  'jamais')                               as depuis,
         pg_size_pretty(pg_total_relation_size(relid))     as taille,
         (n_mod_since_analyze > 50 + 0.1 * greatest(n_live_tup, 1)) as a_decroche
  from pg_stat_user_tables
  where schemaname = 'public'
  order by n_mod_since_analyze desc
`

function connexion() {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const url = fs.readFileSync(chemin, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!url) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  return new Client({ connectionString: url[1].trim(), ssl: { rejectUnauthorized: false } })
}

async function main() {
  const client = connexion()
  await client.connect()
  try {
    const { rows } = await client.query(REQUETE)
    const decrochees = rows.filter((r) => r.a_decroche)

    const cibles = tablesDemandees.length > 0
      ? rows.filter((r) => tablesDemandees.includes(r.relname))
      : decrochees

    if (tablesDemandees.length > 0) {
      const inconnues = tablesDemandees.filter((t) => !rows.some((r) => r.relname === t))
      if (inconnues.length > 0) throw new Error('Table(s) inconnue(s) : ' + inconnues.join(', '))
    }

    console.log(`${rows.length} tables dans le schéma public.`)
    if (decrochees.length === 0) {
      console.log('\n✓ Aucune table n’a décroché : les statistiques sont à jour.')
    } else {
      console.log(`\n${decrochees.length} table(s) dont les statistiques ont décroché :\n`)
      console.log('  modifs    lignes    taille        dernière analyse   table')
      for (const r of decrochees) {
        console.log(`  ${String(r.modifs).padStart(8)}  ${String(r.lignes).padStart(8)}  `
          + `${r.taille.padEnd(12)}  ${r.depuis.padEnd(17)}  ${r.relname}`)
      }
    }

    if (!faire) {
      if (cibles.length > 0) {
        console.log('\nRien n’a été fait. Pour réanalyser :')
        console.log('  node scripts/reanalyser.cjs --faire')
      }
      return
    }

    if (cibles.length === 0) {
      console.log('\nRien à réanalyser.')
      return
    }

    console.log('')
    for (const r of cibles) {
      process.stdout.write(`analyze ${r.relname} (${r.taille})… `)
      const debut = Date.now()
      // `analyze` prend ses propres verrous légers : il ne bloque ni les lectures ni les écritures.
      // Une table à la fois, et non toutes en parallèle : sur une petite instance, saturer les
      // entrées-sorties pour aller plus vite ralentirait justement l'application qu'on répare.
      await client.query(`analyze ${JSON.stringify(r.relname).replace(/"/g, '"')}`)
      console.log(`${Math.round((Date.now() - debut) / 1000)} s`)
    }
    console.log(`\n✓ ${cibles.length} table(s) réanalysée(s).`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
