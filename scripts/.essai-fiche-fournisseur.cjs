/* Les conditions importees se voient-elles sur la fiche fournisseur ?
   La base est juste — ca ne dit pas que l ecran les montre. On ouvre une fiche et on regarde. */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const c = await (await fetch(U + '/rest/v1/comptes?nom=eq.GEDIA&select=id,nom', { headers: H })).json()
  if (!c[0]) { console.log('GEDIA introuvable'); return }
  console.log('fiche ouverte :', c[0].nom)

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const j = await r.json()
    const lien = j.properties ? j.properties.action_link : j.action_link
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((x) => localStorage.getItem(x), cs)
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([x,v]) => localStorage.setItem(x,v), [cs,sess])

    await page.goto(BASE + '/comptes/' + c[0].id, { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(8000)
    fs.mkdirSync(SORTIE, { recursive:true })
    await page.screenshot({ path: path.join(SORTIE, 'fiche-fournisseur.png'), fullPage: true })

    const texte = await page.evaluate(() => {
      const blocs = [...document.querySelectorAll('div')].filter((d) => /DÉTAILS FOURNISSEUR/.test(d.innerText))
      return blocs.length ? blocs[blocs.length - 1].innerText : ''
    })
    console.log('')
    console.log('--- le bloc « Details fournisseur » ---')
    console.log(texte.split(String.fromCharCode(10)).filter(Boolean).map((l) => '   ' + l).join(String.fromCharCode(10)))
    console.log('')
    console.log('Ce que la fiche affiche des conditions du document :')
    for (const [quoi, attendu] of [['Limite Ellipro', '7'], ['minimum annuel', '70'], ['delai', '2']]) {
      const vu = new RegExp(attendu).test(texte)
      console.log('   ' + quoi.padEnd(18) + (vu ? 'valeur ' + attendu + ' presente a l ecran' : 'non visible'))
    }
    const i = texte.toLowerCase().indexOf('ellipro')
    if (i >= 0) console.log('   contexte : ' + texte.slice(Math.max(0,i-80), i+90).split(String.fromCharCode(10)).filter(Boolean).join(' | '))
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
