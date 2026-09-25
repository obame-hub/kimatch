/**
 * OUVRIR UNE SESSION SUR LE SERVEUR LOCAL, SANS PASSER PAR LE MAGIC LINK.
 *
 * Supabase n'accepte `redirect_to` que vers une URL déclarée dans sa configuration. `localhost:5184`
 * n'y est pas : le lien renvoie donc systématiquement sur kimatch.fr, et l'on croit tester le code
 * local alors qu'on mesure la production. C'est ce qui m'a fait perdre du temps cet après-midi.
 *
 * On obtient donc les jetons par l'API (`verify` du lien), puis on les POSE dans le localStorage du
 * navigateur avant d'ouvrir la page. C'est exactement ce que fait l'application elle-même après un
 * clic sur le lien — sans la redirection.
 *
 * Fourni comme module : `const { connecter } = require('./.session-locale.cjs')`.
 */
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

/**
 * Connecte `page` sur `base` au nom de `email`. Rend le jeton d'accès.
 *
 * @param {import('playwright').Page} page
 * @param {string} email
 * @param {string} base  par exemple http://localhost:5184
 */
async function connecter(page, email, base) {
  const U = env('VITE_SUPABASE_URL')
  const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  const ANON = env('VITE_SUPABASE_ANON_KEY')
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

  // ① Un lien magique, dont on ne garde que le jeton à usage unique.
  const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: 'magiclink', email }),
  })).json()

  /* LE JETON EST TANTÔT DANS `properties`, TANTÔT À LA RACINE, selon la version de GoTrue et la
     présence d'`options` dans la demande. On prend le premier des deux qui existe plutôt que de
     supposer une forme. */
  const hashed = (lr.properties && lr.properties.hashed_token) || lr.hashed_token || null
  if (!hashed) throw new Error('aucun jeton pour ' + email + ' : ' + JSON.stringify(lr).slice(0, 200))

  // ② On l'échange contre une vraie session, sans navigateur.
  /* `token_hash` ET `type`, RIEN D'AUTRE. Avec `token` seul, GoTrue réclame une adresse ; avec
     l'adresse en plus, il répond « Only the token_hash and type should be provided ». Les deux
     messages se contredisent en apparence : ils décrivent en fait deux formes différentes de la
     même route, et c'est celle-ci qui vaut ici. */
  const rv = await fetch(U + '/auth/v1/verify', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  })
  if (!rv.ok) throw new Error('verify a échoué : HTTP ' + rv.status + ' ' + (await rv.text()).slice(0, 160))
  const session = await rv.json()
  if (!session.access_token) throw new Error('aucun access_token rendu')

  // ③ On la pose là où l'application la cherche.
  const ref = new URL(U).hostname.split('.')[0]
  const cle = 'sb-' + ref + '-auth-token'

  /* IL FAUT ÊTRE SUR L'ORIGINE AVANT D'ÉCRIRE : `localStorage` est cloisonné par origine, et un
     `page.evaluate` sur `about:blank` écrirait dans le vide. */
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [cle, JSON.stringify(session)])

  return session.access_token
}

module.exports = { connecter, env }
