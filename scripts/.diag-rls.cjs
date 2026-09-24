/* Que voit REELLEMENT un utilisateur ordinaire, table par table ?
   La cle de service passe au-dessus des RLS : elle ne prouve rien. On prend le jeton d'un
   conseiller et l'on compte ce que la base lui rend. C'est le point de depart du cloisonnement
   partenaire : tout ce qui est visible ici le serait aussi pour un partenaire. */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const TABLES = ['comptes','contacts','compteurs','mandats','contrats','recommandations','sites','interactions','pistes','opportunites','profils','roles_acces']

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email:'g.gilles@kiwee-energie.fr', options:{ redirect_to: BASE } }) })
    const c = await r.json()
    const lien = c.properties ? c.properties.action_link : c.action_link
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0]
    const jeton = JSON.parse(await page.evaluate((x) => localStorage.getItem(x), 'sb-' + ref + '-auth-token')).access_token

    console.log('Ce que la BASE rend a un CONSEILLER (Guillaume), sans filtrage navigateur :')
    console.log('')
    for (const t of TABLES) {
      const tot = await fetch(U + '/rest/v1/' + t + '?select=id&limit=1', { headers: Object.assign({}, H, { Prefer: 'count=exact' }) })
      const lui = await fetch(U + '/rest/v1/' + t + '?select=id&limit=1', { headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, Prefer: 'count=exact' } })
      const n = (s) => Number((s.headers.get('content-range') || '/0').split('/')[1] || 0)
      const a = n(tot), b = n(lui)
      console.log('  ' + t.padEnd(17) + String(b).padStart(6) + ' / ' + String(a).padEnd(7) + (b >= a && a > 0 ? '  <- TOUT' : (b === 0 ? '  <- rien' : '  <- partiel')))
    }
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
