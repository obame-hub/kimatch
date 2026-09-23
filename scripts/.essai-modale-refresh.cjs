/**
 * LA MODALE ÉCARTÉE REVIENT-ELLE APRÈS UN RECHARGEMENT ?
 *
 * Naoelle, 23/09/2026, capture a l'appui : « quand je refresh j'ai la modale qui s'affiche en
 * permanence ». Le drapeau etait un useRef, il mourait au rechargement.
 *
 * On eprouve le parcours REEL : ouvrir, fermer par « Plus tard », recharger, regarder. C'est le
 * seul essai qui vaille — verifier que la colonne existe ne prouve rien sur ce que voit l'ecran.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }

const voir = (page) => page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')))

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('   CONSOLE :', m.text().slice(0,160)) })
  try {
    const url = env('VITE_SUPABASE_URL'), cle = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
    const r = await fetch(url + '/auth/v1/admin/generate_link', { method:'POST',
      headers:{apikey:cle,Authorization:'Bearer '+cle,'Content-Type':'application/json'},
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const corps = await r.json().catch(()=>null)
    const lien = corps?.properties?.action_link ?? corps?.action_link
    if (!lien) throw new Error('pas de lien : ' + JSON.stringify(corps).slice(0,200))
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(3000)
    const ref = new URL(url).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((c) => localStorage.getItem(c), cs)
    if (!sess) throw new Error('pas de session')
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([c,v]) => localStorage.setItem(c,v), [cs,sess])

    await page.goto(BASE + '/', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(16000)
    fs.mkdirSync(SORTIE, { recursive:true })

    console.log('1. premiere ouverture      : modale', await voir(page) ? 'OUI' : 'non')
    await page.screenshot({ path: path.join(SORTIE,'refresh-1-ouverte.png') })

    if (!(await voir(page))) { console.log('   (rien a ecarter : essai sans objet)'); return }

    // ON FERME PAR « Plus tard », le geste de Naoelle.
    await page.locator('[role="dialog"] button', { hasText: 'Plus tard' }).first().click()
    await page.waitForTimeout(2500)
    console.log('2. apres « Plus tard »     : modale', await voir(page) ? 'ENCORE LA' : 'fermee')

    // LE RECHARGEMENT — c'est precisement ce qui la faisait revenir.
    await page.reload({ waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(16000)
    const revenue = await voir(page)
    console.log('3. APRES RECHARGEMENT      : modale', revenue ? '*** REVENUE — DEFAUT NON CORRIGE ***' : 'ABSENTE — corrige')
    await page.screenshot({ path: path.join(SORTIE,'refresh-2-apres-f5.png') })

    // Second rechargement : Naoelle en a fait plus d'un.
    await page.reload({ waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(13000)
    console.log('4. second rechargement     : modale', await voir(page) ? '*** REVENUE ***' : 'toujours absente')
  } finally { await nav.close() }
})().catch((e) => { console.error('ECHEC :', e.message); process.exit(1) })
