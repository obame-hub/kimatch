// ════════════════════════════════════════════════════════════════════════════════════════════════
// PUBLIER UNE NOUVEAUTÉ DANS KIMATCH
//
// Naoëlle, 07/09/2026 : « il faut que chaque chose que l'on fasse soit écrite dans l'onglet
// nouveauté, je te l'écris maintenant pour pas te le répéter à chaque fois qu'on fixe un bug ou
// qu'on implémente une nouvelle fonctionnalité. Bien différencier les fix de bug, les
// fonctionnalités, les connexions API et le reste. » Puis : « publie toi-même à chaque fois, faut
// que ce soit compréhensible pour les équipes. »
//
// C'est aussi la consigne de William, rappelée en rouge : « IMPORTANT : quand tu finalises une
// modification, pense bien à le noter dans l'onglet Nouveautés. »
//
// ── POURQUOI UN SCRIPT PLUTÔT QUE DU SQL À LA MAIN ──
//
// Une publication part à treize personnes. Écrite en SQL au coup par coup, elle finit par manquer
// son type, ou par contenir du HTML mal formé qui casse l'affichage de la page pour tout le monde.
// Ce script impose la forme : un type parmi ceux qui existent, un titre, un corps en HTML restreint
// aux balises que l'éditeur produit, et un auteur réel.
//
// ── USAGE ──
//
//   node scripts/publier-nouveaute.cjs <fichier.json>
//   node scripts/publier-nouveaute.cjs <fichier.json> --brouillon
//   node scripts/publier-nouveaute.cjs --lister
//
// Le fichier JSON, un objet ou un tableau d'objets :
//
//   {
//     "type": "CORRECTION",
//     "titre": "Le signataire peut venir d'un autre compte",
//     "corps": "<p>Texte…</p><ul><li>…</li></ul>",
//     "date": "2026-09-03 18:32:05"
//   }
//
// Sans `--brouillon`, la publication paraît immédiatement et apparaît dans la popup de tous ceux
// qui ne l'ont pas lue.
//
// ── LA DATE EST CELLE DE LA LIVRAISON, PAS CELLE DE LA PUBLICATION ──
//
// Naoëlle, 07/09/2026 : « il faut mettre les vraies dates de quand on a fait les modifs, car tout
// est à aujourd'hui. » Quand on rattrape plusieurs jours de travail d'un coup, tout dater du jour
// écrase la chronologie : la frise de la page Nouveautés sert justement à revenir chercher « c'était
// quand, le changement sur les mandats ? », et huit publications empilées à la même minute ne
// répondent plus. La date se prend dans `git log` du commit correspondant.
//
// Champ `date` optionnel, au format `YYYY-MM-DD HH:MM:SS`. Absent, c'est maintenant.
//
// ── LES QUATRE FAMILLES ──
//
//   CORRECTION     un bug corrigé
//   NOUVEAUTE      une fonctionnalité qui n'existait pas
//   INTEGRATION    une connexion à un service extérieur (Allo, DocuSign, Enedis, Ellisphere…)
//   AMELIORATION   le reste : un écran plus clair, un calcul plus juste, un champ modifiable
//   MAINTENANCE    ce qui touche aux données ou à la plomberie sans changer l'usage
//   ANNONCE        ce qui n'est pas un changement du produit
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const RACINE = path.resolve(__dirname, '..')

/**
 * L'AUTEUR DES PUBLICATIONS.
 *
 * Le compte de Naoëlle, parce que c'est elle qui porte ces annonces devant l'équipe et qu'elle a
 * demandé qu'elles partent sans passer par elle. Une publication non signée s'afficherait sans
 * visage dans la frise, et personne ne saurait à qui poser une question.
 */
const AUTEUR_PAR_DEFAUT = '22c7cc2e-64d4-436c-8e6e-3a6f31fa304f'

/**
 * LES BALISES ADMISES, celles que l'éditeur TipTap de la page produit lui-même.
 *
 * Le corps est inséré tel quel dans la page : une balise inattendue — un `<script>`, un `<style>`,
 * un `<iframe>` — s'exécuterait chez tous les lecteurs. On refuse plutôt que d'assainir : un
 * nettoyage silencieux laisserait publier un texte amputé sans le dire.
 */
const BALISES_ADMISES = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'a', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span',
])

function verifierHtml(corps, ou) {
  const balises = [...corps.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase())
  const refusees = [...new Set(balises)].filter((b) => !BALISES_ADMISES.has(b))
  if (refusees.length > 0) {
    throw new Error(`${ou} : balise(s) non admise(s) dans le corps — ${refusees.join(', ')}`)
  }
}

function connexion() {
  const cheminEnv = path.join(RACINE, '.env.local')
  if (!fs.existsSync(cheminEnv)) throw new Error('.env.local introuvable : ' + cheminEnv)
  const url = fs.readFileSync(cheminEnv, 'utf8').match(/^SUPABASE_DB_URL=(.+)$/m)
  if (!url) throw new Error('SUPABASE_DB_URL absent de .env.local.')
  return new Client({ connectionString: url[1].trim(), ssl: { rejectUnauthorized: false } })
}

async function lister(client) {
  const { rows } = await client.query(`
    select t.code, p.titre,
           -- À L'HEURE DE PARIS, ET NON CELLE DE LA BASE. La session Postgres est en UTC : sans
           -- cette conversion, la liste affichait 18:03 pour une nouveauté que la page montre à
           -- 20:03, et on doutait de la date au lieu de la lire. C'est ce qui m'a fait vérifier
           -- l'heure de trois publications le 07/09/2026 — elles étaient justes, la liste non.
           to_char(coalesce(p.date_publication, p.date_creation) at time zone 'Europe/Paris',
                   'DD/MM/YYYY HH24:MI') as quand,
           p.date_publication is not null as parue
    from publications p
    left join types_publications t on t.id = p.type_publication_id
    where p.actif = true
    order by coalesce(p.date_publication, p.date_creation) desc
    limit 30`)
  if (rows.length === 0) {
    console.log('Aucune publication.')
    return
  }
  for (const r of rows) {
    console.log(`${r.quand}  ${(r.code || '—').padEnd(13)} ${r.parue ? ' ' : '[brouillon] '}${r.titre}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const client = connexion()
  await client.connect()

  try {
    if (args.includes('--lister') || args.length === 0) {
      await lister(client)
      if (args.length === 0) {
        console.log('\nUsage : node scripts/publier-nouveaute.cjs <fichier.json> [--brouillon]')
      }
      return
    }

    const fichier = args.find((a) => !a.startsWith('--'))
    if (!fichier) throw new Error('Aucun fichier JSON donné.')
    const brouillon = args.includes('--brouillon')

    const contenu = JSON.parse(fs.readFileSync(fichier, 'utf8'))
    const publications = Array.isArray(contenu) ? contenu : [contenu]

    // Les types disponibles, lus en base : on ne devine pas les codes, et un code inconnu
    // s'arrête ici plutôt que de produire une publication sans étiquette.
    const { rows: types } = await client.query('select id, code, libelle from types_publications where actif = true')
    const parCode = new Map(types.map((t) => [t.code, t]))

    // TOUT EST VÉRIFIÉ AVANT LA PREMIÈRE ÉCRITURE : une série à moitié publiée serait pire qu'un
    // refus, parce que la moitié partie ne se rattrape pas.
    for (const [i, p] of publications.entries()) {
      const ou = `publication ${i + 1}`
      if (!p.type || !parCode.has(p.type)) {
        throw new Error(`${ou} : type « ${p.type} » inconnu. Disponibles : ${[...parCode.keys()].sort().join(', ')}`)
      }
      if (!p.titre || !p.titre.trim()) throw new Error(`${ou} : titre vide.`)
      if (p.titre.length > 120) throw new Error(`${ou} : titre de ${p.titre.length} caractères, 120 au maximum.`)
      if (!p.corps || !p.corps.trim()) throw new Error(`${ou} : corps vide.`)
      verifierHtml(p.corps, ou)
      if (p.date) {
        const d = new Date(p.date.replace(' ', 'T'))
        if (Number.isNaN(d.getTime())) throw new Error(`${ou} : date « ${p.date} » illisible.`)
        // UNE DATE FUTURE EST UNE FAUTE DE FRAPPE, pas une intention : une publication datée de
        // demain resterait invisible dans une frise triée par date.
        if (d.getTime() > Date.now() + 60_000) throw new Error(`${ou} : date dans le futur (${p.date}).`)
        p._date = d.toISOString()
      }
    }

    await client.query('begin')
    for (const p of publications) {
      const type = parCode.get(p.type)
      const { rows } = await client.query(
        `insert into publications (titre, type_publication_id, contenu_html, auteur_id, cree_par_id, date_publication)
         values ($1, $2, $3, $4, $4, $5) returning id`,
        [p.titre.trim(), type.id, p.corps.trim(), p.auteur_id || AUTEUR_PAR_DEFAUT,
          brouillon ? null : (p._date ?? new Date().toISOString())],
      )
      const quand = p._date ? new Date(p._date).toLocaleString('fr-FR') : 'maintenant'
      console.log(`${brouillon ? 'Brouillon' : 'Publié'} — [${type.libelle}] ${p.titre}  (${quand})`)
    }
    await client.query('commit')

    console.log(`\n${publications.length} publication(s) ${brouillon ? 'enregistrée(s) en brouillon' : 'parue(s)'}.`)
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
