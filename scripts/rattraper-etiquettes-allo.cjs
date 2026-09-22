/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * RATTRAPER LES ÉTIQUETTES DE CONTENU D'ALLÔ SUR TOUT L'HISTORIQUE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « rattrape tout l'historique ».
 *
 * Le webhook garde désormais les étiquettes des appels À VENIR (migration 20260922130000). Les
 * 6 963 appels déjà en base (identifiants `cll-…`, du 04/12/2025 à aujourd'hui) n'en ont aucune,
 * alors qu'Allô les a produites à l'époque et les conserve — 11 972 appels côté Allô, dont une
 * bonne moitié étiquetée. Ce script va les rechercher et les réécrit chez nous.
 *
 * ══ POURQUOI UN SCRIPT ET NON UNE FONCTION DE L'APPLICATION ══
 *
 * La clé Allô n'existe QUE côté serveur, et c'est une décision de sécurité écrite dans
 * `api/allo/_client.ts` : « elle ouvre tout le compte Allô — lire les appels, les transcriptions,
 * envoyer des SMS ». Elle n'est pas dans `.env.local`, donc aucune session de développement ne
 * l'a. Ce script la lit dans SON environnement, le temps d'un lancement :
 *
 *     ALLO_API_KEY="ak_live_…" node scripts/rattraper-etiquettes-allo.cjs
 *
 * Ajouter `--depuis 2026-01-01` pour limiter la période, `--essai` pour ne rien écrire.
 *
 * ══ CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS ══
 *
 * IL NE TOUCHE QU'À `etiquettes_allo`. Pas au résumé, pas à la durée, pas au résultat : ces
 * colonnes sont déjà remplies et parfois corrigées à la main. Un rattrapage qui réécrit ce qu'il
 * n'a pas besoin de réécrire est un rattrapage qu'on n'ose pas relancer.
 *
 * IL EST REJOUABLE. L'appariement se fait sur `source_externe_id`, l'identifiant d'Allô ; relancer
 * le script écrit les mêmes valeurs aux mêmes lignes. C'est ce qui permet de l'arrêter au milieu.
 *
 * ══ LA LIMITE DE DÉBIT EST RESPECTÉE, PAS SUBIE ══
 *
 * Allô accepte 20 lectures par seconde. On lit par pages de 100 avec une pause entre deux pages —
 * sur ~11 000 appels cela fait 110 requêtes, soit quelques minutes. Un 429 est attendu et relancé
 * après la pause qu'ils indiquent, plutôt que de faire échouer tout le rattrapage à la page 78.
 */
const fs = require('fs')
const { Client } = require('/Users/williamgoupil/Desktop/Kimatch/node_modules/pg')

const CLE = process.env.ALLO_API_KEY
if (!CLE) {
  console.error('\n  Clé manquante. Lancez :\n')
  console.error('    ALLO_API_KEY="ak_live_…" node scripts/rattraper-etiquettes-allo.cjs\n')
  process.exit(1)
}

const args = process.argv.slice(2)
const ESSAI = args.includes('--essai')
const depuisArg = args.indexOf('--depuis')
const DEPUIS = depuisArg >= 0 ? args[depuisArg + 1] : null

const urlBase = fs.readFileSync(`${__dirname}/../.env.local`, 'utf8')
  .split('\n').find((l) => l.startsWith('SUPABASE_DB_URL='))
  .slice('SUPABASE_DB_URL='.length).trim().replace(/^["']|["']$/g, '')

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

/** Une page de la recherche d'appels. Relance une fois sur 429, en respectant leur en-tête. */
async function page(numero) {
  const corps = { type: 'CALL', size: 100, page: numero, sort: 'DATE' }
  if (DEPUIS) corps.date_from = DEPUIS
  for (let essai = 0; essai < 3; essai++) {
    const res = await fetch('https://api.withallo.com/v2/api/conversations/items/search', {
      method: 'POST',
      headers: { Authorization: `Api-Key ${CLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
    if (res.status === 429) {
      const pause = Number(res.headers.get('X-RateLimit-Reset') || 2) * 1000
      console.log(`    429 — pause de ${Math.round(pause / 1000)} s`)
      await attendre(pause)
      continue
    }
    if (!res.ok) throw new Error(`page ${numero} : HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
    return res.json()
  }
  throw new Error(`page ${numero} : trois 429 d'affilée, on s'arrête`)
}

;(async () => {
  const db = new Client({ connectionString: urlBase, ssl: { rejectUnauthorized: false } })
  await db.connect()

  let p = 1, lus = 0, avecEtiquettes = 0, ecritsInteractions = 0, ecritsAppels = 0, pages = null
  console.log(`\n  Rattrapage des étiquettes Allô${DEPUIS ? ` depuis le ${DEPUIS}` : ' — tout l’historique'}${ESSAI ? ' (essai, aucune écriture)' : ''}\n`)

  while (pages === null || p <= pages) {
    const { data, pagination } = await page(p)
    if (pages === null) {
      pages = pagination.total_pages
      console.log(`  ${pagination.total_count} appels, ${pages} pages de 100\n`)
    }
    for (const appel of data ?? []) {
      lus++
      const tags = Array.isArray(appel.tags) ? appel.tags.filter((t) => typeof t === 'string' && t.trim()) : []
      if (tags.length === 0 || !appel.id) continue
      avecEtiquettes++
      if (ESSAI) continue

      /* LES DEUX TABLES, parce qu'elles répondent à deux questions : `interactions` porte
         l'historique qu'on relit sur une fiche, `appels_en_cours` la carte d'appel du jour. */
      const a = await db.query(
        `update interactions set etiquettes_allo = $1
          where source_externe_id = $2 and actif and etiquettes_allo is distinct from $1`,
        [tags, appel.id],
      )
      ecritsInteractions += a.rowCount
      const b = await db.query(
        `update appels_en_cours set etiquettes_allo = $1
          where source_externe_id = $2 and etiquettes_allo is distinct from $1`,
        [tags, appel.id],
      )
      ecritsAppels += b.rowCount
    }
    if (p % 10 === 0 || p === pages) {
      console.log(`  page ${p}/${pages} — ${lus} lus, ${avecEtiquettes} étiquetés, ${ecritsInteractions} écrits`)
    }
    p++
    await attendre(120) // ~8 requêtes par seconde : bien sous le plafond de 20
  }

  await db.end()
  console.log(`\n  Terminé.`)
  console.log(`    ${lus} appels lus chez Allô`)
  console.log(`    ${avecEtiquettes} portent au moins une étiquette`)
  console.log(`    ${ecritsInteractions} lignes d’historique mises à jour`)
  console.log(`    ${ecritsAppels} cartes d’appel mises à jour\n`)
})().catch((e) => { console.error('\n  ' + e.message + '\n'); process.exit(1) })
