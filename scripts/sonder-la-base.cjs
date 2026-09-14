// ════════════════════════════════════════════════════════════════════════════════════════════════
// LA BASE EST-ELLE LENTE, OU BRIDÉE ?
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ══ POURQUOI ══
//
// Le 10/09/2026, toute l'équipe à l'arrêt : l'application ne répondait plus, l'auth non plus, et la
// page d'état de Supabase était verte. J'ai cherché dans PostgREST, dans les verrous, dans les
// connexions. La cause était ailleurs — l'instance n'avait plus de CPU, épuisé par un import de
// 12 000 fichiers lancé à pleine vitesse.
//
// CE QUI L'A MONTRÉ EN DIX SECONDES, ET QU'AUCUN AUTRE INDICATEUR NE DISAIT : faire compter la base
// jusqu'à trois millions et chronométrer. 9 414 ms, contre 200 à 400 sur une machine saine. Le
// tableau de bord Supabase affichait « CPU 17 % » au même moment — 17 % d'un quota déjà réduit,
// donc rassurant et faux.
//
// ══ CE SCRIPT NE TIENT PLUS LE JOURNAL ══
//
// Sa première version écrivait dans un CSV local. Elle a enregistré DEUX mesures, toutes deux le
// 10/09 : une mesure qu'il faut penser à lancer n'est pas une mesure, c'est une bonne intention. Et
// un journal qui vit sur un poste s'arrête quand le poste dort.
//
// Depuis le 14/09/2026, c'est une tâche planifiée qui mesure chaque nuit à 4 h 30
// (`api/sonde/mesurer.ts`), et le journal est la table `mesures_base`. Ce script sert désormais à
// deux choses seulement : prendre une mesure TOUT DE SUITE pendant un incident, et relire la
// courbe.
//
// ══ LECTURE ══
//
//   moins de 500 ms   sain
//   500 à 1500 ms     régime de croisière observé sur `Small`
//   plus de 3000 ms   bridage en cours, l'application devient pénible
//   plus de 8000 ms   l'équipe ne peut plus travailler
//
// Usage : npm run sonde            une mesure immédiate, ajoutée au journal
//         npm run sonde -- --lire  relire la courbe
// ════════════════════════════════════════════════════════════════════════════════════════════════

const { Client } = require('pg')
const fs = require('fs')

function env(cle) {
  const ligne = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(cle + '='))
  return ligne ? ligne.slice(cle.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

function connexion() {
  return new Client({
    connectionString: env('SUPABASE_DB_URL'),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
  })
}

/** Le mot qui va avec le chiffre — seuils relevés le 10/09/2026. */
function verdict(ms) {
  if (ms < 500) return 'sain'
  if (ms < 1500) return 'croisière'
  if (ms < 3000) return 'ça se dégrade'
  if (ms < 8000) return 'bridée'
  return 'à l’arrêt'
}

async function lireLaCourbe() {
  const client = connexion()
  await client.connect()
  const { rows } = await client.query(`
    select date_mesure, sonde_ms, connexions, max_connexions, origine
    from mesures_base order by date_mesure desc limit 30`)
  await client.end()

  if (rows.length === 0) {
    console.log('\nAucune mesure encore. La tâche planifiée passe chaque nuit à 4 h 30 ;')
    console.log('`npm run sonde` en prend une tout de suite.\n')
    return
  }

  console.log('\nquand'.padEnd(21) + 'sonde'.padStart(9) + 'connexions'.padStart(12) + '  origine  verdict')
  for (const r of [...rows].reverse()) {
    const quand = new Date(r.date_mesure).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    console.log(
      quand.padEnd(21)
      + `${r.sonde_ms} ms`.padStart(9)
      + `${r.connexions}/${r.max_connexions}`.padStart(12)
      + '  ' + String(r.origine).toLowerCase().padEnd(8)
      + '  ' + verdict(r.sonde_ms),
    )
  }

  /* LA MÉDIANE COMPTE PLUS QUE LA DERNIÈRE VALEUR. Une mesure isolée peut tomber pendant un
     import ; c'est la tendance qui dit si la machine suffit. On ne garde que les mesures
     planifiées : celles prises à la main l'ont été pendant un incident, par définition. */
  const nocturnes = rows.filter((r) => r.origine === 'CRON').map((r) => r.sonde_ms).sort((a, b) => a - b)
  if (nocturnes.length >= 3) {
    const mediane = nocturnes[Math.floor(nocturnes.length / 2)]
    console.log(`\nMédiane sur ${nocturnes.length} mesure(s) de nuit : ${mediane} ms  ·  pire : ${nocturnes[nocturnes.length - 1]} ms`)
    if (mediane > 1500) {
      console.log('La médiane dépasse 1 500 ms : ce n’est plus un accident, c’est le régime normal.')
      console.log('C’est le moment de poser la question de `Large` (CPU dédié) à Michel.')
    }
  } else {
    console.log(`\n${nocturnes.length} mesure(s) de nuit : trop peu pour conclure, il en faut une semaine.`)
  }
  console.log('')
}

async function mesurer() {
  const client = connexion()
  await client.connect()

  /* LA MÊME FONCTION QUE LA TÂCHE PLANIFIÉE. Chronométrer ici, depuis ce poste, mêlerait au calcul
     le voyage réseau jusqu'à la base — vingt à deux cents millisecondes selon le wifi, soit
     l'ordre de grandeur de ce qu'on observe. Les deux mesures ne seraient pas comparables. */
  const { rows: [m] } = await client.query('select * from fn_sonder_le_processeur()')
  await client.query(
    `insert into mesures_base (sonde_ms, connexions, max_connexions, cache_pourcent, origine)
     values ($1, $2, $3, $4, 'MANUEL')`,
    [m.sonde_ms, m.connexions, m.max_connexions, m.cache_pourcent])
  await client.end()

  const quand = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  console.log(`${quand}   sonde ${m.sonde_ms} ms   ${m.connexions}/${m.max_connexions} connexions   cache ${m.cache_pourcent} %   ${verdict(m.sonde_ms)}`)
  if (m.sonde_ms >= 3000) {
    console.log('')
    console.log('  L’instance est bridée. Avant d’accuser une requête ou un index : vérifier')
    console.log('  qu’aucun traitement massif ne tourne, puis la taille de calcul dans')
    console.log('  Supabase → Settings → Infrastructure.')
  }
}

const action = process.argv.includes('--lire') ? lireLaCourbe : mesurer
action().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })
