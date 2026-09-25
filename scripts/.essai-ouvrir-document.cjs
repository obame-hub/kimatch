/* Un document s ouvre-t-il encore depuis l ecran, maintenant que le seau est ferme ?
   La signature marche en API — ca ne dit pas que l ecran s en sert. On clique. */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  // Un compte qui a des documents dans son fil.
  const d = (await (await fetch(U + '/rest/v1/documents?select=entite_type,entite_id,nom&entite_type=eq.compte&limit=1', { headers: H })).json())[0]
  if (!d) { console.log('aucun document rattache a un compte'); return }
  console.log('compte porteur du document :', d.entite_id.slice(0, 8), '|', String(d.nom).slice(0, 40))

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  const reqs = []
  page.on('request', (q) => { if (q.url().includes('/storage/v1/object')) reqs.push(q.method() + ' ' + (q.url().includes('/sign/') ? 'SIGNATURE' : q.url().includes('/public/') ? '*** PUBLIC ***' : 'autre')) })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE : ' + e.message.slice(0, 90)))
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const j = await r.json()
    await page.goto(j.properties ? j.properties.action_link : j.action_link, { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((x) => localStorage.getItem(x), cs)
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([x,v]) => localStorage.setItem(x,v), [cs,sess])

    await page.goto(BASE + '/comptes/' + d.entite_id, { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(8000)
    fs.mkdirSync(SORTIE, { recursive:true })

    // L onglet Fichiers.
    const onglet = page.getByRole('button', { name: /Fichiers|Documents/ })
    if (await onglet.count()) { await onglet.first().click(); await page.waitForTimeout(5000) }
    await page.screenshot({ path: path.join(SORTIE, 'documents-apres-fermeture.png'), fullPage: false })

    const texte = await page.evaluate(() => document.body.innerText)
    const erreur = /Impossible de charger|Une erreur est survenue/i.test(texte)
    console.log('')
    console.log('1. la liste des documents :', erreur ? '*** message d erreur ***' : 'affichee')

    // On ouvre le premier document.
    const lien = page.locator('a[href*="/storage/v1/object"]').first()
    if (await lien.count()) {
      reqs.length = 0
      await lien.click({ timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(4000)
      console.log('2. au clic, requetes de stockage :', reqs.length ? reqs.join(' | ') : 'aucune')
      console.log('   ', reqs.some((x) => x.includes('SIGNATURE')) ? '-> le lien passe bien par la signature' : (reqs.some((x) => x.includes('PUBLIC')) ? '*** il tente encore l URL publique ***' : 'a verifier a la main'))
    } else {
      console.log('2. aucun lien de document sur cet ecran')
    }
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
