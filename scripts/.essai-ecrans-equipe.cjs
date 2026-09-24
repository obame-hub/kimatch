/* Fermer 107 tables d un coup peut casser un ecran de l equipe sans qu on le sache.
   On ouvre les principales pages avec une session normale et l on releve les erreurs. */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const PAGES = ['/', '/patrimoine', '/pistes', '/opportunites', '/recommandations', '/pricing',
  '/requetes', '/suivis-contrats', '/cockpit', '/comptes', '/administration', '/nouveautes']

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push('ERREUR ' + e.message.slice(0, 90)))
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push('CONSOLE ' + m.text().slice(0, 90)) })
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

    console.log('')
    console.log('══ LES ECRANS DE L EQUIPE APRES LA FERMETURE DE 107 TABLES ══')
    let casses = 0
    for (const p of PAGES) {
      erreurs.length = 0
      await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(5000)
      const texte = await page.evaluate(() => document.body.innerText)
      const vide = texte.trim().length < 120
      /* ON CHERCHE UN MESSAGE D ERREUR DE L APPLICATION, pas le mot « impossible » dans un contenu :
       la page Nouveautes affiche mes propres publications, dont une qui parle d un droit
       « impossible a retirer ». Mon premier essai la declarait cassee. */
    const plante = /Une erreur est survenue|Quelque chose s.est mal|Impossible de charger|Impossible de lire/i.test(texte)
      const ok = !vide && !plante && erreurs.length === 0
      if (!ok) casses++
      console.log('   ' + (ok ? '  ok   ' : ' CASSE ') + ' | ' + p.padEnd(20) +
        (vide ? 'page vide' : plante ? 'message : ' + (texte.match(/Une erreur[^.]*|Impossible de[^.]*/i) || [''])[0].slice(0,70) : erreurs.length ? erreurs[0] : 'affichee'))
    }
    console.log('')
    console.log(casses === 0 ? '  AUCUN ECRAN CASSE' : '  *** ' + casses + ' ECRAN(S) A REGARDER ***')
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
