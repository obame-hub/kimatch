/**
 * LE FIL D'ACTIVITE D'UNE FICHE CONTIENT-IL VRAIMENT LES APPELS ?
 *
 * Naoelle, 23/09/2026 : « je comprends pas pourquoi les appels n'apparaissent pas dans le fil
 * d'activite des contacts ? je me suis appelee plusieurs fois ».
 *
 * La base dit que neuf interactions d'appel existent sur sa fiche aujourd'hui. Ça ne prouve pas
 * qu'on les VOIT : une requete d'ecran peut filtrer, paginer, ou echouer en silence. On ouvre donc
 * la fiche et on lit ce qui s'affiche.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const CONTACT = '4c59b72e-7a69-42af-bf1d-dc2512ce32e4'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
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

    // LA FICHE DU CONTACT QU'ELLE A APPELE — c'est-a-dire la sienne.
    await page.goto(BASE + '/contacts/' + CONTACT, { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(9000)
    fs.mkdirSync(SORTIE, { recursive:true })
    await page.screenshot({ path: path.join(SORTIE,'fiche-contact.png'), fullPage:true })

    const texte = await page.evaluate(() => document.body.innerText)
    console.log('   titre de la page :', await page.title())
    console.log('   la page parle-t-elle d activite ?', /activit/i.test(texte) ? 'OUI' : 'non')
    // On compte les heures d appel visibles a l ecran, telles que la base les annonce.
    for (const h of ['09:12','12:14','12:31','12:57','14:36','14:42','15:14','15:20','15:45']) {
      if (texte.includes(h)) console.log('   vu a l ecran :', h)
    }
    const app = (texte.match(/Appel/gi) || []).length
    console.log('   occurrences du mot « Appel » :', app)
    console.log('')
    console.log('   --- ce que la page montre (2500 premiers caracteres) ---')
    console.log(texte.slice(0, 2500))
  } finally { await nav.close() }
})().catch((e) => { console.error('ECHEC :', e.message); process.exit(1) })
