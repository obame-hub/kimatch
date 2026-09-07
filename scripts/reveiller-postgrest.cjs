// ════════════════════════════════════════════════════════════════════════════════════════════════
// « PLUS RIEN NE SE CHARGE » — LE DIAGNOSTIC EN TROIS QUESTIONS
//
// ══ L'INCIDENT DU 07/09/2026 ══
//
// Toute l'équipe à l'arrêt pendant une heure, écrans bloqués sur « Chargement… ». J'ai cherché dans
// le mauvais ordre, deux fois, et c'est ce script qui existe pour que ça n'arrive plus.
//
//   1. J'ai accusé les STATISTIQUES. Elles étaient bien périmées — celles d'`interactions` datant du
//      1er septembre après un import de 10 539 lignes — et l'`analyze` a fait repartir l'application
//      un moment. Mais ce n'était pas la cause : ça a masqué le vrai problème une demi-heure.
//
//   2. J'ai accusé le BUDGET D'ENTRÉES-SORTIES de l'instance, et fait chercher un graphe. Il était
//      à 1 %. CPU 4 %, mémoire 61 %, 19 connexions sur 60, aucun verrou en attente : la base ne
//      faisait rien.
//
//   3. La cause était POSTGREST, la couche qui sert l'API. Coincé dans le rechargement de son cache
//      de schéma — il en garde une image en mémoire, et chaque vue, fonction ou déclencheur créé la
//      lui fait recharger. J'en avais créé beaucoup ce jour-là.
//
// CE QUI L'AURAIT MONTRÉ EN DIX SECONDES : l'auth répondait en 184 ms pendant que le REST renvoyait
// des 503. Deux services devant la même base, un seul en panne. C'était dans mes propres mesures
// depuis le début, et je ne l'ai pas lu.
//
// ══ CE QUE FAIT CE SCRIPT ══
//
// Il pose les trois questions dans le bon ordre, et n'agit que si la signature correspond :
//
//   L'AUTH RÉPOND-ELLE ?          non  → la plateforme entière est en cause, voir le tableau de bord
//   LE REST RÉPOND-IL ?           non, alors que l'auth oui → PostgREST est coincé, on le réveille
//   LA BASE EST-ELLE SAINE ?      connexions, verrous, statistiques
//
// LE RÉVEIL EST UN `NOTIFY`, rien de plus : aucune donnée touchée, aucun schéma modifié. Il est donc
// envoyé automatiquement quand le diagnostic le désigne — dans une panne, on ne veut pas d'un
// second geste à taper.
//
// ══ USAGE ══
//
//   node scripts/reveiller-postgrest.cjs             diagnostic, et réveil si c'est PostgREST
//   node scripts/reveiller-postgrest.cjs --constater  diagnostic seul, sans rien envoyer
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')
const constaterSeulement = process.argv.includes('--constater')

function secrets() {
  const chemin = path.join(RACINE, '.env.local')
  if (!fs.existsSync(chemin)) throw new Error('.env.local introuvable : ' + chemin)
  const env = fs.readFileSync(chemin, 'utf8')
  const lire = (nom) => env.match(new RegExp('^' + nom + '=(.+)$', 'm'))?.[1].trim()
  const s = {
    api: lire('VITE_SUPABASE_URL'),
    cle: lire('VITE_SUPABASE_ANON_KEY'),
    base: lire('SUPABASE_DB_URL'),
  }
  if (!s.api || !s.cle) throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY absent de .env.local.')
  return s
}

/** Interroge une URL et rend son code et sa durée. Ne lève jamais : un échec est une mesure. */
async function mesurer(url, entetes, plafondMs = 15000) {
  const t = Date.now()
  try {
    const res = await fetch(url, { headers: entetes, signal: AbortSignal.timeout(plafondMs) })
    await res.text()
    return { ok: res.ok, code: res.status, ms: Date.now() - t }
  } catch (e) {
    return { ok: false, code: e.name === 'TimeoutError' ? 'timeout' : 'échec', ms: Date.now() - t }
  }
}

function ligne(libelle, r) {
  const etat = r.ok ? '✓' : '✗'
  console.log(`  ${etat} ${libelle.padEnd(22)} ${String(r.code).padEnd(8)} ${r.ms} ms`)
}

async function main() {
  const s = secrets()
  const entetes = { apikey: s.cle, Authorization: 'Bearer ' + s.cle }

  console.log('\n══ 1. LES DEUX SERVICES QUI COMPTENT ══\n')
  const auth = await mesurer(`${s.api}/auth/v1/health`, entetes)
  ligne('auth', auth)
  // Une table de référence : petite, lue par tout le monde, et sans dépendance à des vues.
  const rest = await mesurer(`${s.api}/rest/v1/types_comptes?select=id&limit=1`, entetes)
  ligne('rest (PostgREST)', rest)

  const postgrestSeulEnPanne = auth.ok && !rest.ok

  console.log('\n══ 2. LA BASE ELLE-MÊME ══\n')
  let baseSaine = false
  if (!s.base) {
    console.log('  — SUPABASE_DB_URL absent : diagnostic de la base impossible.')
  } else {
    const t = Date.now()
    const c = new Client({ connectionString: s.base, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })
    try {
      await c.connect()
      const msConnexion = Date.now() - t
      console.log(`  ✓ connexion              ${msConnexion} ms`)

      const { rows: [co] } = await c.query(`
        select count(*)::int as total,
               count(*) filter (where state = 'active')::int as actives,
               count(*) filter (where state like 'idle in trans%')::int as en_transaction,
               current_setting('max_connections') as maximum
        from pg_stat_activity`)
      console.log(`    connexions             ${co.total} / ${co.maximum}  (${co.actives} actives, ${co.en_transaction} en transaction)`)

      const { rows: [v] } = await c.query('select count(*)::int as n from pg_locks where not granted')
      console.log(`    verrous en attente     ${v.n}`)

      const { rows: stats } = await c.query(`
        select relname, n_mod_since_analyze as modifs
        from pg_stat_user_tables
        where schemaname = 'public'
          and n_mod_since_analyze > 50 + 0.1 * greatest(n_live_tup, 1)
        order by n_mod_since_analyze desc limit 5`)
      if (stats.length === 0) {
        console.log('    statistiques           à jour')
      } else {
        console.log(`    statistiques           ${stats.length} table(s) ont décroché :`)
        for (const r of stats) console.log(`                             ${r.relname} (${r.modifs} modifs)`)
      }

      baseSaine = co.total < Number(co.maximum) * 0.8 && v.n === 0 && msConnexion < 3000

      // ══ 3. LE RÉVEIL, si et seulement si la signature correspond ══
      if (postgrestSeulEnPanne) {
        console.log('\n══ 3. POSTGREST EST COINCÉ ══\n')
        console.log('  L’auth répond, le REST non : deux services devant la même base, un seul en panne.')
        console.log('  C’est la signature d’un cache de schéma bloqué.')
        if (constaterSeulement) {
          console.log('\n  --constater : rien n’a été envoyé. Relancez sans l’option pour réveiller PostgREST.')
        } else {
          process.stdout.write('\n  envoi du rechargement… ')
          await c.query("notify pgrst, 'reload schema'")
          await c.query("notify pgrst, 'reload config'")
          console.log('fait.')
          // Le rechargement n'est pas instantané : on laisse à PostgREST le temps de repartir avant
          // de conclure, sinon on annoncerait un échec sur une mesure prise trop tôt.
          await new Promise((r) => setTimeout(r, 8000))
          const apres = await mesurer(`${s.api}/rest/v1/types_comptes?select=id&limit=1`, entetes)
          console.log('')
          ligne('rest, après réveil', apres)
          console.log(apres.ok
            ? '\n✓ L’API répond de nouveau. Demandez à l’équipe de recharger la page.'
            : '\n✗ Toujours en panne. Redémarrez le projet : Supabase → Project Settings → General → Restart project.')
        }
      }
    } catch (e) {
      console.log(`  ✗ base injoignable : ${e.message}`)
    } finally {
      await c.end().catch(() => {})
    }
  }

  if (!postgrestSeulEnPanne) {
    console.log('\n══ CE QUE ÇA VEUT DIRE ══\n')
    if (rest.ok && auth.ok) {
      // DEUX MESSAGES TRÈS DIFFÉRENTS SELON LA RAISON DE L'APPEL. Lancé par précaution après une
      // migration, « la panne n'est pas côté Supabase » laissait croire qu'il y avait une panne.
      if (baseSaine) {
        console.log('  ✓ Tout répond normalement : auth, API et base.')
        console.log('    Si quelqu’un voit encore un écran bloqué, c’est son navigateur — un')
        console.log('    rechargement forcé (Ctrl+Maj+R) suffit après un déploiement.')
      } else {
        console.log('  Les deux services répondent, mais la base montre des signes de charge —')
        console.log('  voir ci-dessus. Si l’application est lente sans être bloquée, c’est là.')
      }
    } else if (!auth.ok) {
      console.log('  L’auth ne répond pas non plus : c’est la plateforme entière.')
      console.log('  Tableau de bord Supabase, puis status.supabase.com.')
    }
    // Le conseil ne s'affiche que s'il sert : le rappeler quand tout va bien fait douter.
    if (!baseSaine) console.log('\n  Statistiques décrochées : node scripts/reanalyser.cjs --faire')
  }
  console.log('')
}

main().catch((e) => {
  console.error('\n' + e.message)
  process.exit(1)
})
