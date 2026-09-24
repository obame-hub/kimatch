/* L'UPDATE d'un role passe-t-il sous la session de Naoelle, policies comprises ?
   L'ecran affiche le nouvel etat mais la base ne bouge pas : on reproduit l'ecriture exacte,
   avec son jeton, et l'on regarde ce que PostgREST repond vraiment. */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const role = (await (await fetch(U + '/rest/v1/roles_acces?code=eq.DIRECTEUR&select=id,voit_tous_les_comptes', { headers: H })).json())[0]
  console.log('DIRECTEUR en base avant :', role.voit_tous_les_comptes)

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()
  try {
    const lr = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const corps = await lr.json().catch(()=>null)
    const lien = corps?.properties?.action_link ?? corps?.action_link
    if (!lien) throw new Error('pas de lien')
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(3000)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((c) => localStorage.getItem(c), cs)
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([c,v]) => localStorage.setItem(c,v), [cs,sess])
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await page.waitForTimeout(4000)

    const out = await page.evaluate(async ({ u, anon, cs, id, valeur }) => {
      const jeton = JSON.parse(localStorage.getItem(cs)).access_token
      const charge = JSON.parse(atob(jeton.split('.')[1]))
      const h = { apikey: anon, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json', Prefer: 'return=representation' }
      const r = await fetch(u + '/rest/v1/roles_acces?id=eq.' + id, {
        method: 'PATCH', headers: h, body: JSON.stringify({ voit_tous_les_comptes: valeur }),
      })
      // La fonction qui decide, vue depuis cette session.
      const f = await fetch(u + '/rest/v1/rpc/peut_administrer', { method: 'POST', headers: h, body: '{}' })
      return { sub: charge.sub, statut: r.status, corps: (await r.text()).slice(0, 220),
               peutAdministrer: await f.text(), statutF: f.status }
    }, { u: U, anon: env('VITE_SUPABASE_ANON_KEY'), cs, id: role.id, valeur: !role.voit_tous_les_comptes })

    console.log('')
    console.log('   utilisateur du jeton (sub) :', out.sub)
    console.log('   peut_administrer()         : HTTP', out.statutF, '->', out.peutAdministrer)
    console.log('   PATCH roles_acces          : HTTP', out.statut)
    console.log('   reponse                    :', out.corps || '(vide)')
    const apres = (await (await fetch(U + '/rest/v1/roles_acces?id=eq.' + role.id + '&select=voit_tous_les_comptes', { headers: H })).json())[0]
    console.log('')
    console.log('   en base apres :', apres.voit_tous_les_comptes,
      apres.voit_tous_les_comptes !== role.voit_tous_les_comptes ? '-> ECRIT' : '*** TOUJOURS PAS ***')
    if (apres.voit_tous_les_comptes !== role.voit_tous_les_comptes) {
      await fetch(U + '/rest/v1/roles_acces?id=eq.' + role.id, { method:'PATCH', headers:H,
        body: JSON.stringify({ voit_tous_les_comptes: role.voit_tous_les_comptes }) })
      console.log('   (remis a l etat d origine)')
    }
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
