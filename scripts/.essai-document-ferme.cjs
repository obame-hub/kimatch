/** OUVRIR UN DOCUMENT, POUR DE VRAI, UNE FOIS LE SEAU FERME. */
const { chromium } = require('playwright')
const fs = require('fs')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = 'http://localhost:5184'

;(async () => {
  const doc = (await (await fetch(U + '/rest/v1/documents?select=url,nom_fichier&url=not.is.null&limit=1', { headers: H })).json())[0]
  console.log('document : ' + (doc.nom_fichier || '(sans nom)'))

  // ① SANS SESSION, l'adresse publique ne doit plus rien rendre.
  const pub = await fetch(doc.url, { method: 'GET' })
  console.log('  adresse publique, sans compte : HTTP ' + pub.status + (pub.ok ? '  *** ENCORE SERVI ***' : '  refuse'))

  // ② AVEC SESSION, la signature doit marcher.
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()
  const mail = (await (await fetch(U + "/rest/v1/profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1", { headers: H })).json())[0].email
  const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: 'magiclink', email: mail, options: { redirect_to: BASE } }),
  })).json()
  await page.goto(lr.properties ? lr.properties.action_link : lr.action_link, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  const res = await page.evaluate(async ({ url, sup, anon }) => {
    const ref = new URL(sup).hostname.split('.')[0]
    const t = JSON.parse(localStorage.getItem('sb-' + ref + '-auth-token')).access_token
    const MARQ = '/storage/v1/object/public/documents/'
    const i = url.indexOf(MARQ)
    const chemin = decodeURIComponent(url.slice(i + MARQ.length))
    const r = await fetch(sup + '/storage/v1/object/sign/documents/' + chemin, {
      method: 'POST',
      headers: { apikey: anon, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    if (!r.ok) return { etape: 'signature', statut: r.status, texte: (await r.text()).slice(0, 150) }
    const { signedURL } = await r.json()
    const f = await fetch(sup + '/storage/v1' + signedURL)
    const b = await f.blob()
    return { etape: 'telechargement', statut: f.status, taille: b.size, type: b.type }
  }, { url: doc.url, sup: U, anon: env('VITE_SUPABASE_ANON_KEY') })

  console.log('  connecte (' + mail + ') : ' + JSON.stringify(res))
  await nav.close()

  console.log('')
  const ok = !pub.ok && res.etape === 'telechargement' && res.statut === 200 && res.taille > 0
  console.log(ok
    ? '  PREUVE : Internet est dehors, l equipe telecharge ' + (res.taille / 1024).toFixed(0) + ' Ko.'
    : '  *** A REGARDER ***')
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
