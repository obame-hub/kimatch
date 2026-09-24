/* Le filtre par type de compte existe-t-il vraiment a l'ecran, et rend-il les 7 partenaires ?
   Naoelle ne le voit pas : soit il est absent, soit il est la mais peu visible. On regarde. */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const c = await r.json()
    const lien = c.properties ? c.properties.action_link : c.action_link
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((x) => localStorage.getItem(x), cs)
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([x,v]) => localStorage.setItem(x,v), [cs,sess])

    await page.goto(BASE + '/comptes', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(7000)
    fs.mkdirSync(SORTIE, { recursive:true })
    await page.screenshot({ path: path.join(SORTIE, 'comptes-filtre.png'), fullPage: false })

    // « Mes comptes » est actif par defaut et se combine au filtre : on prend d abord tout.
    await page.getByText('Tous les comptes', { exact: true }).click()
    await page.waitForTimeout(3000)
    const filtre = page.getByLabel('Filtrer par type de compte')
    const present = await filtre.count()
    console.log('1. filtre « type de compte » :', present ? 'present' : '*** ABSENT ***')
    if (!present) return

    await filtre.click()
    await page.waitForTimeout(800)
    const options = await page.locator('[role="option"], li, button').filter({ hasText: /Tous les types|Partenaire|Fournisseur|Consommateur|KiWee/ }).allInnerTexts()
    console.log('2. choix proposes :', [...new Set(options.map(t=>t.trim()))].filter(Boolean).join(' | '))

    const avant = await filtre.innerText().catch(()=>'?')
    console.log('   libelle du filtre avant clic :', avant.replace(String.fromCharCode(10),' '))
    await page.getByText('Partenaire', { exact: true }).first().click()
    await page.waitForTimeout(1500)
    const apres = await filtre.innerText().catch(()=>'?')
    console.log('   libelle du filtre apres clic :', apres.replace(String.fromCharCode(10),' '))
    await page.waitForTimeout(4000)
    const lignes = await page.locator('tbody tr').count()
    console.log('3. apres filtre « Partenaire » :', lignes, 'ligne(s) (7 attendues)')
    const noms = await page.locator('tbody tr td:first-child').allInnerTexts()
    console.log('   ', noms.map(t=>t.split(String.fromCharCode(10))[0].trim()).filter(Boolean).slice(0,8).join(' | '))
    await page.screenshot({ path: path.join(SORTIE, 'comptes-partenaires.png'), fullPage: false })
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
