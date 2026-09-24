const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=representation' }

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email:'n.ghouma@kiwee-energie.fr', options:{ redirect_to: BASE } }) })
    const corps = await r.json()
    const lien = corps.properties ? corps.properties.action_link : corps.action_link
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0]
    const jeton = JSON.parse(await page.evaluate((c) => localStorage.getItem(c), 'sb-' + ref + '-auth-token')).access_token

    const rq = async (chemin, methode, corps) => {
      const h = { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json', Prefer: 'return=representation' }
      const x = await fetch(U + '/rest/v1/' + chemin, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined })
      const t = await x.text()
      let j = null; try { j = JSON.parse(t) } catch {}
      return { statut: x.status, texte: t.slice(0,160), n: Array.isArray(j) ? j.length : null }
    }

    // On part d'un etat propre.
    for (const c of ['ADMIN','SUPER_ADMIN'])
      await fetch(U + '/rest/v1/roles_acces?code=eq.' + c, { method:'PATCH', headers:H, body: JSON.stringify({ ouvre_administration: true }) })

    const ids = {}
    for (const c of ['ADMIN','SUPER_ADMIN'])
      ids[c] = (await (await fetch(U + '/rest/v1/roles_acces?code=eq.' + c + '&select=id', { headers: H })).json())[0].id

    console.log('AVEC LE JETON DE NAOELLE (ADMIN) :')
    let a = await rq('roles_acces?id=eq.' + ids.ADMIN, 'PATCH', { ouvre_administration: false })
    console.log('  1. retirer a ADMIN       : HTTP', a.statut, '|', a.n, 'ligne(s)')
    let b = await rq('roles_acces?id=eq.' + ids.SUPER_ADMIN, 'PATCH', { ouvre_administration: false })
    console.log('  2. retirer a SUPER_ADMIN : HTTP', b.statut, '|', b.n, 'ligne(s)')
    console.log('     reponse :', b.texte)

    const reste = await (await fetch(U + '/rest/v1/roles_acces?select=code&ouvre_administration=is.true', { headers: H })).json()
    console.log('')
    console.log('  roles ouvrant l administration :', reste.length ? reste.map(x=>x.code).join(', ') : '*** AUCUN — VERROUILLE DEHORS ***')
    console.log('')
    console.log('  => si 2. rend HTTP 200 avec 0 ligne, ce n est PAS une faille :')
    console.log('     la policy filtre la ligne car Naoelle a DEJA perdu son droit a l etape 1.')
    for (const c of ['ADMIN','SUPER_ADMIN'])
      await fetch(U + '/rest/v1/roles_acces?code=eq.' + c, { method:'PATCH', headers:H, body: JSON.stringify({ ouvre_administration: true }) })
    console.log('  (remis)')
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
