/* Le lien signe fonctionne-t-il AVANT qu on ferme le seau ?
   On ne ferme rien tant que ce n est pas prouve : les commerciaux travaillent en production. */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const doc = (await (await fetch(U + '/rest/v1/documents?select=nom,url&url=like.*object/public/documents*&limit=1', { headers: H })).json())[0]
  console.log('document d essai :', String(doc.nom).slice(0, 50))

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const j = await r.json()
    await page.goto(j.properties ? j.properties.action_link : j.action_link, { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const brut = await page.evaluate((x) => localStorage.getItem(x), cs)
    const jeton = JSON.parse(brut).access_token

    const marqueur = '/storage/v1/object/public/documents/'
    const chemin = decodeURIComponent(doc.url.slice(doc.url.indexOf(marqueur) + marqueur.length))

    // ① Un utilisateur connecte obtient-il une signature ?
    const sig = await fetch(U + '/storage/v1/object/sign/documents/' + encodeURI(chemin), {
      method: 'POST',
      headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    const sj = await sig.json()
    console.log('')
    console.log('1. signature par un utilisateur connecte : HTTP ' + sig.status + (sj.signedURL ? '  -> obtenue' : '  *** ' + JSON.stringify(sj).slice(0, 100)))
    if (!sj.signedURL) return

    // ② Le lien signe telecharge-t-il vraiment ?
    const dl = await fetch(U + '/storage/v1' + sj.signedURL, { method: 'HEAD' })
    console.log('2. telechargement par le lien signe      : HTTP ' + dl.status + (dl.ok ? '  -> le fichier arrive' : '  *** echec'))

    // ③ Et sans session ?
    const sans = await fetch(U + '/storage/v1/object/sign/documents/' + encodeURI(chemin), {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    console.log('3. signature SANS session                : HTTP ' + sans.status + (sans.ok ? '  *** ACCORDEE ***' : '  -> refusee'))
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
