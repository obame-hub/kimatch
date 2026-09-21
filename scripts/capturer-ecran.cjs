// ════════════════════════════════════════════════════════════════════════════════════════════════
// VOIR UN ÉCRAN POUR DE VRAI, AVANT DE DIRE QU'IL EST BON
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// Naoëlle, 20/09/2026, capture d'écran à l'appui : « je n'aime pas la barre de recherche que t'as
// mise, c'est pas du tout responsive ». Le défaut était une liste déroulante native qui recouvrait
// la fiche entière — invisible au build, aux tests et au lint, qui passaient tous les trois.
//
// AUCUN CONTRÔLE AUTOMATIQUE NE VOIT ÇA. Il fallait ouvrir la page. D'où ce script : il ouvre
// l'application comme un utilisateur, se connecte, va où on lui dit, et rend une image.
//
// ══ POURQUOI UN LIEN MAGIQUE PLUTÔT QU'UN MOT DE PASSE ══
//
// Kimatch n'a pas de mot de passe : la connexion se fait par lien. `admin/generate_link` fabrique
// ce lien et le retourne au lieu de l'expédier — c'est déjà ce que fait `lien-de-connexion.cjs`,
// dont ce script reprend le mécanisme. Rien n'est envoyé, le quota de courriels ne bouge pas.
//
// LA REDIRECTION VISE LE SERVEUR LOCAL, et c'est toute la différence avec l'autre script : un lien
// qui ramène sur kimatch.fr ouvrirait une session en production, où le code qu'on veut justement
// regarder n'est pas encore déployé.
//
// ══ USAGE ══
//
//   npm run capture -- <chemin> [fichier.png] [options]
//
//   npm run capture -- /comptes
//   npm run capture -- /recommandations/<id> cloture.png --large //     --clic "Clôturer" --clic "Refusée" --clic "^Oui$" //     --saisir "Chercher un fournisseur=en" --vers "Une opportunité de suivi"
//
//   --large    fenêtre 1440 px au lieu de 900 (l'étroite montre mieux les débordements)
//   --entier   toute la hauteur de la page
//   --clic     un libellé de bouton à cliquer, répétable et dans l'ordre
//   --saisir   « placeholder=texte » : remplit un champ avant la photo
//   --vers     amène le bloc portant ce texte sous les yeux
//
// L'adresse de connexion se prend dans `.env.local` (`ADRESSE_CAPTURE`), à défaut celle de
// `git config user.email`. Elle n'est jamais devinée : la capture ouvre une session à ce nom.
//
// PRÉREQUIS : le serveur de développement doit tourner (`npm run dev`).
// ════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('fs')
const path = require('path')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

const BASE = process.env.BASE_CAPTURE || 'http://localhost:5173'
/* GIT BASH RÉÉCRIT LES ARGUMENTS QUI COMMENCENT PAR « / » en chemins Windows : « /recommandations »
   arrive ici en « C:/Program Files/Git/recommandations ». On rattrape la forme d'origine plutôt que
   d'imposer une syntaxe à qui appelle le script. */
const brut = process.argv[2] || '/'
const chemin = /^[A-Za-z]:[\\/]/.test(brut)
  ? '/' + brut.replace(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/]/i, '').replace(/\\/g, '/')
  : brut
const sortie = path.resolve(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'capture.png')
/* Une fenêtre étroite par défaut : c'est là que les débordements se voient. `--large` pour
   contrôler la version bureau du même écran. */
const large = process.argv.includes('--large')
/* `--entier` capture toute la hauteur : utile pour trouver ou se trouve un bloc avant de le viser. */
const entier = process.argv.includes('--entier')

/* L'ADRESSE DE CELUI QUI TRAVAILLE, PAS LA PREMIÈRE VENUE.
   Première version : « la première adresse @kiwee-energie.fr par ordre alphabétique ». Elle a
   ouvert une session au nom d'un collègue qui n'avait rien demandé. Une capture se prend avec SON
   propre compte : `ADRESSE_CAPTURE` dans `.env.local`, à défaut le propriétaire du dépôt. */
function adresseDeConnexion() {
  const explicite = env('ADRESSE_CAPTURE')
  if (explicite) return explicite
  const { execSync } = require('child_process')
  try {
    const courriel = execSync('git config user.email', { encoding: 'utf8' }).trim()
    if (courriel.endsWith('@kiwee-energie.fr')) return courriel
  } catch { /* pas de git configuré : on tombe sur le message ci-dessous */ }
  throw new Error(
    'Renseigne ADRESSE_CAPTURE dans .env.local avec TON adresse : la capture ouvre une session '
    + 'au nom de cette personne, elle ne se choisit pas au hasard.',
  )
}

async function lienDeConnexion(adresse) {
  const url = env('VITE_SUPABASE_URL')
  const cle = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  const r = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: adresse, options: { redirect_to: BASE } }),
    signal: AbortSignal.timeout(25000),
  })
  const corps = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`generate_link HTTP ${r.status} — ${JSON.stringify(corps).slice(0, 200)}`)
  const lien = corps?.properties?.action_link ?? corps?.action_link
  if (!lien) throw new Error('Pas de lien dans la réponse : ' + JSON.stringify(corps).slice(0, 200))
  /* Supabase renvoie le lien vers SON domaine, qui redirige ensuite. On force la redirection finale
     vers le serveur local : sans ça, la session se pose sur kimatch.fr et la capture montrerait la
     production. */
  return lien.replace(/redirect_to=[^&]*/, `redirect_to=${encodeURIComponent(BASE)}`)
}

;(async () => {
  const { chromium } = require('playwright')
  const adresse = adresseDeConnexion()
  console.log(`Connexion en tant que ${adresse}`)
  const lien = await lienDeConnexion(adresse)

  const navigateur = await chromium.launch()
  const contexte = await navigateur.newContext({
    viewport: large ? { width: 1440, height: 820 } : { width: 900, height: 820 },
    locale: 'fr-FR',
  })
  const page = await contexte.newPage()
  const soucis = []
  page.on('console', (m) => { if (m.type() === 'error') soucis.push(m.text().slice(0, 200)) })
  /* Les requetes refusees par le serveur : c'est la qu'on voit pourquoi une liste est vide alors
     que la base est pleine. */
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().startsWith('chrome')) soucis.push(`HTTP ${r.status()} ${r.url().slice(0, 150)}`)
  })

  /* ══ LA SESSION SE POSE À LA MAIN, ET C'EST VOULU ══
     Suivre le lien et laisser l'application faire aurait été plus court, mais ça dépend de la liste
     des « Redirect URLs » de Supabase : `localhost` n'y est pas, la redirection part donc sur
     kimatch.fr et la capture montre la PRODUCTION au lieu du code qu'on veut regarder. Éprouvé le
     20/09/2026 — la première capture n'a rendu que l'écran de connexion.

     On intercepte donc la redirection pour récupérer les jetons du fragment, et on les écrit
     nous-mêmes là où supabase-js les lit. Rien n'est contourné : c'est le même jeton, posé au même
     endroit, simplement sans passer par un domaine qu'on ne veut pas charger. */
  let fragment = null
  await page.route('**/*', async (route) => {
    const u = route.request().url()
    if (fragment === null && /[#&]access_token=/.test(u)) fragment = u
    if (!u.startsWith(BASE) && !u.includes('supabase')) return route.abort()
    return route.continue()
  })
  page.on('framenavigated', (f) => {
    if (fragment === null && /[#&]access_token=/.test(f.url())) fragment = f.url()
  })

  await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)
  if (fragment === null && /[#&]access_token=/.test(page.url())) fragment = page.url()
  if (fragment === null) throw new Error("Le lien n'a pas rendu de jeton — la session n'a pas pu être ouverte.")

  const h = new URLSearchParams(fragment.split('#')[1] || '')
  const ref = new URL(env('VITE_SUPABASE_URL')).hostname.split('.')[0]
  const session = {
    access_token: h.get('access_token'),
    refresh_token: h.get('refresh_token'),
    token_type: 'bearer',
    expires_in: Number(h.get('expires_in') || 3600),
    expires_at: Math.floor(Date.now() / 1000) + Number(h.get('expires_in') || 3600),
  }

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(([cle, valeur]) => window.localStorage.setItem(cle, valeur),
    [`sb-${ref}-auth-token`, JSON.stringify(session)])

  await page.goto(`${BASE}${chemin}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  /* `--attendre N` pour les ecrans lents : une capture prise trop tot montre une page blanche et
     ferait croire a une panne la ou il n'y a qu'une liste qui charge. */
  const iAtt = process.argv.indexOf('--attendre')
  await page.waitForTimeout(iAtt > -1 && process.argv[iAtt + 1] ? Number(process.argv[iAtt + 1]) * 1000 : 6000)

  /* GESTES OPTIONNELS, pour atteindre un panneau qui ne s'ouvre pas tout seul. Chaque entree est
     un libelle de bouton a cliquer, dans l'ordre : --clic "Cloturer" --clic "Refusee". */
  const clics = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--clic' && process.argv[i + 1]) clics.push(process.argv[i + 1])
  }
  for (const libelle of clics) {
    const cible = page.getByRole('button', { name: new RegExp(libelle, 'i') }).first()
    /* LE BOUTON EST SOUVENT HORS DE L'ECRAN sur une fiche longue. Playwright fait defiler tout seul
       au clic, mais pas si un element le recouvre : on l'amene au centre d'abord. */
    await cible.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(400)
    await cible.click({ timeout: 15000 }).catch((e) => console.log(`clic « ${libelle} » : ${String(e.message).slice(0, 90)}`))
    await page.waitForTimeout(1200)
  }
  if (clics.length) await page.waitForTimeout(1500)

  /* `--vers "texte"` amene un bloc precis sous les yeux avant la photo. Le contenu de Kimatch defile
     dans un conteneur interne, pas dans la fenetre : `window.scrollTo` n'y peut rien, seul
     scrollIntoView sur l'element vise fonctionne. */
  /* `--saisir "placeholder=texte"` remplit un champ, pour voir un ecran dans son etat utile plutot
     que vide : une liste de resultats ne se juge pas sur un champ ou personne n'a tape. */
  const iSaisir = process.argv.indexOf('--saisir')
  if (iSaisir > -1 && process.argv[iSaisir + 1]) {
    const [ph, texte] = String(process.argv[iSaisir + 1]).split('=')
    await page.getByPlaceholder(new RegExp(ph, 'i')).first().fill(texte, { timeout: 10000 })
      .catch((e) => console.log(`--saisir : ${String(e.message).slice(0, 80)}`))
    await page.waitForTimeout(1500)
  }

  const iVers = process.argv.indexOf('--vers')
  if (iVers > -1 && process.argv[iVers + 1]) {
    await page.getByText(new RegExp(process.argv[iVers + 1], 'i')).first()
      .scrollIntoViewIfNeeded({ timeout: 10000 })
      .catch((e) => console.log(`--vers : ${String(e.message).slice(0, 80)}`))
    await page.waitForTimeout(1200)
  }

  await page.screenshot({ path: sortie, fullPage: entier })
  console.log(`Capture : ${sortie}`)
  if (soucis.length) console.log('Erreurs console :\n  ' + soucis.slice(0, 5).join('\n  '))

  await navigateur.close()
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1) })
