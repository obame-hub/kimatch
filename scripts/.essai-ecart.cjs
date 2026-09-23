/* L'UPDATE du refus passe-t-il sous la session de Naoelle, RLS comprises ?
   L'interaction porte auteur_profil_id = WILLIAM (compte Allo). Si la policy exige d'etre
   l'auteur, l'ecriture est refusee EN SILENCE et la modale revient a chaque rechargement. */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const t = await (await fetch(U + '/rest/v1/types_interactions?select=id&code=eq.APPEL', { headers: H })).json()
  const r = await fetch(U + '/rest/v1/interactions', { method:'POST', headers:{...H, Prefer:'return=representation'},
    body: JSON.stringify({ type_interaction_id: t[0].id, date_interaction: new Date().toISOString(),
      objet: 'zzz essai ecart RLS', sens: 'SORTANT',
      auteur_profil_id: '14483439-27d3-4e48-b0db-b074b4fe2f4a',
      contact_id: '4c59b72e-7a69-42af-bf1d-dc2512ce32e4', compte_id: 'a05fa38d-8de9-4643-b8b4-c3a7cb4ac01b' }) })
  const cree = (await r.json())[0]
  console.log('interaction fabriquee :', cree.id.slice(0,8), '(auteur = William)')

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

    const out = await page.evaluate(async ({ u, anon, cs, id }) => {
      const jeton = JSON.parse(localStorage.getItem(cs)).access_token
      const r = await fetch(u + '/rest/v1/interactions?id=eq.' + id, {
        method: 'PATCH',
        headers: { apikey: anon, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ rattachement_ecarte_le: new Date().toISOString() }),
      })
      return { statut: r.status, corps: (await r.text()).slice(0, 300) }
    }, { u: U, anon: env('VITE_SUPABASE_ANON_KEY'), cs, id: cree.id })

    console.log('')
    console.log('UPDATE sous la session de Naoelle -> HTTP', out.statut)
    console.log('reponse :', out.corps || '(vide)')
    console.log('')
    const apres = await (await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id + '&select=rattachement_ecarte_le', { headers: H })).json()
    console.log('en base, rattachement_ecarte_le =', apres[0]?.rattachement_ecarte_le ?? 'TOUJOURS NULL -> ecriture refusee')
  } finally {
    await nav.close()
    await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id, { method:'DELETE', headers:H })
    console.log('interaction fabriquee : effacee.')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
