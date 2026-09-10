// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA BASE EST-ELLE LENTE, OU BRIDÉE ? — UNE MESURE PAR JOUR
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ══ POURQUOI ══
//
// Le 10/09/2026, toute l'équipe à l'arrêt : l'application ne répondait plus, l'auth non plus, et
// la page d'état de Supabase était verte. J'ai cherché dans PostgREST, dans les verrous, dans les
// connexions. La cause était ailleurs : l'instance n'avait plus de CPU, épuisé par un import de
// 12 000 fichiers que j'avais lancé à pleine vitesse.
//
// CE QUI L'A MONTRÉ EN DIX SECONDES, ET QU'AUCUN AUTRE INDICATEUR NE DISAIT : faire compter la
// base jusqu'à trois millions et chronométrer. 9 414 ms, contre 200 à 400 sur une machine saine.
// Le tableau de bord Supabase affichait « CPU 17 % » au même moment — 17 % d'un quota déjà réduit,
// donc rassurant et faux.
//
// ══ POURQUOI CETTE MESURE-LÀ ET PAS UNE AUTRE ══
//
// `generate_series` ne lit aucune table, ne touche pas au disque, ne dépend d'aucun index et
// d'aucune statistique. Le temps obtenu ne dépend QUE du processeur disponible. Une requête
// métier, elle, mêle tout — on ne saurait pas si elle rame parce que la machine est bridée ou
// parce qu'il manque un index.
//
// La mémoire est relevée aussi : le 10/09, le vrai goulot était là. 78 % de 0,5 Go sur un
// `t3.nano`, bien avant que le CPU ne s'effondre.
//
// ══ CE QUE LA COURBE DOIT TRANCHER ══
//
// Kimatch tourne sur `Small` (2 Go, CPU PARTAGÉ), passé en urgence depuis `Nano` le 10/09. Small,
// Micro et Medium sont tous partagés : ils accumulent des crédits de calcul et se font brider
// quand ils les épuisent. `Large` est le premier à CPU dédié — mais à 110 $/mois contre 15.
//
// La question n'est donc pas « faut-il plus gros », c'est « À QUELLE FRÉQUENCE FRÔLE-T-ON LA
// LIMITE EN USAGE NORMAL ». Une semaine de mesures y répond ; une mauvaise journée, non. Michel
// tranchera sur la courbe.
//
// ══ LECTURE ══
//
//   moins de 500 ms   sain
//   500 à 1500 ms     régime de croisière actuel sur Small
//   plus de 3000 ms   bridage en cours, l'application va devenir pénible
//   plus de 8000 ms   l'équipe ne peut plus travailler
//
// Usage : npm run sonde            une mesure, ajoutée au journal
//         npm run sonde -- --lire  relire le journal
// ════════════════════════════════════════════════════════════════════════════════════════════════

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const JOURNAL = path.join('.mesures', 'sonde-base.csv')

function env(cle) {
  const ligne = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

function lireLeJournal() {
  if (!fs.existsSync(JOURNAL)) {
    console.log('Aucune mesure encore. `npm run sonde` en prend une.')
    return
  }
  const lignes = fs.readFileSync(JOURNAL, 'utf8').trim().split('\n').slice(1)
  console.log('\nquand'.padEnd(22) + 'sonde'.padStart(9) + 'connexions'.padStart(12) + '   verdict')
  for (const l of lignes) {
    const [quand, ms, conn, max] = l.split(',')
    const n = Number(ms)
    const verdict = n < 500 ? 'sain'
      : n < 1500 ? 'croisière'
      : n < 3000 ? 'ça se dégrade'
      : n < 8000 ? 'bridée' : 'à l’arrêt'
    console.log(quand.padEnd(22) + `${ms} ms`.padStart(9) + `${conn}/${max}`.padStart(12) + '   ' + verdict)
  }
  /* LA TENDANCE COMPTE PLUS QUE LA DERNIÈRE VALEUR. Une mesure isolée peut tomber pendant un
     import ; c'est la médiane sur la durée qui dit si la machine suffit. */
  const valeurs = lignes.map((l) => Number(l.split(',')[1])).sort((a, b) => a - b)
  if (valeurs.length >= 3) {
    const mediane = valeurs[Math.floor(valeurs.length / 2)]
    console.log(`\nMédiane sur ${valeurs.length} mesures : ${mediane} ms  ·  pire : ${valeurs[valeurs.length - 1]} ms`)
    if (mediane > 1500) {
      console.log('La médiane dépasse 1 500 ms : ce n’est plus un accident, c’est le régime normal.')
      console.log('C’est le moment de poser la question de `Large` (CPU dédié) à Michel.')
    }
  }
}

async function mesurer() {
  const client = new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  })
  await client.connect()

  const debut = Date.now()
  await client.query('select count(*) from generate_series(1, 3000000)')
  const ms = Date.now() - debut

  const { rows: [c] } = await client.query('select count(*)::int n from pg_stat_activity')
  const { rows: [m] } = await client.query("select setting::int n from pg_settings where name = 'max_connections'")
  const { rows: [cache] } = await client.query(`
    select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 1) as taux
    from pg_stat_database where datname = current_database()`)
  await client.end()

  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true })
  if (!fs.existsSync(JOURNAL)) {
    fs.writeFileSync(JOURNAL, 'quand,sonde_ms,connexions,max_connexions,cache_pourcent\n')
  }
  const quand = new Date().toISOString().slice(0, 19).replace('T', ' ')
  fs.appendFileSync(JOURNAL, `${quand},${ms},${c.n},${m.n},${cache.taux}\n`)

  const verdict = ms < 500 ? '✓ sain'
    : ms < 1500 ? '· régime de croisière'
    : ms < 3000 ? '! ça se dégrade'
    : ms < 8000 ? '✗ BRIDÉE' : '✗✗ À L’ARRÊT'
  console.log(`${quand}   sonde ${ms} ms   ${c.n}/${m.n} connexions   cache ${cache.taux} %   ${verdict}`)
  if (ms >= 3000) {
    console.log('')
    console.log('  L’instance est bridée. Avant d’accuser une requête ou un index : vérifier')
    console.log('  qu’aucun traitement massif ne tourne, puis la taille de calcul dans')
    console.log('  Supabase → Settings → Infrastructure.')
  }
}

if (process.argv.includes('--lire')) lireLeJournal()
else mesurer().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })
