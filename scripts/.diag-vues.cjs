/* Pourquoi la vue rend tout par l'API alors qu'elle est cloisonnee en base ? */
const { chromium } = require('playwright')
const fs = require('fs')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const MAIL = 'zzz.diag@kiwee-energie.invalid'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

;(async () => {
  const a = (chemin, m, b) => fetch(U + '/rest/v1/' + chemin, { method: m || 'GET', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: b ? JSON.stringify(b) : undefined })
  const part = (await (await a('comptes', 'POST', { nom: 'ZZZ DIAG P', type_compte_id: TP })).json())[0].id
  const ct = (await (await a('contacts', 'POST', { nom: 'DIAG', prenom: 'Z', email: MAIL, compte_id: part, actif: true })).json())[0].id
  const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
  const acc = (await (await a('profils_autorises', 'POST', { email: 'x@y.invalid', prenom: 'Z', nom: 'DIAG', contact_id: ct, role_acces_id: rp })).json())[0].id
  const u = await (await fetch(U + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: MAIL, email_confirm: true }) })).json()

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()
  const lr = await (await fetch(U + '/auth/v1/admin/generate_link', { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email: MAIL, options: { redirect_to: 'http://localhost:5184' } }) })).json()
  const lien = lr.properties ? lr.properties.action_link : lr.action_link
  await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const ref = new URL(U).hostname.split('.')[0]
  const brut = await page.evaluate((x) => localStorage.getItem(x), 'sb-' + ref + '-auth-token')
  const jeton = brut ? JSON.parse(brut).access_token : null
  await nav.close()
  console.log('session obtenue :', jeton ? 'oui' : 'NON')

  const q = async (chemin) => {
    const r = await fetch(U + '/rest/v1/' + chemin, { headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, Prefer: 'count=exact' } })
    return { statut: r.status, n: Number((r.headers.get('content-range') || '/0').split('/')[1] || 0) }
  }
  console.log('')
  console.log('avec SON jeton :')
  console.log('  table comptes        :', JSON.stringify(await q('comptes?select=id&limit=1')))
  console.log('  vue v_comptes_liste  :', JSON.stringify(await q('v_comptes_liste?select=id&limit=1')))
  console.log('  vue v_patrimoine_syn :', JSON.stringify(await q('v_patrimoine_synthese?select=*&limit=1')))

  // Que dit la base de son identite ?
  const who = await (await fetch(U + '/rest/v1/rpc/est_partenaire', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' }, body: '{}' })).text()
  console.log('  est_partenaire()     :', who.trim())

  // nettoyage
  await a('comptes?id=eq.' + part, 'DELETE')
  await a('profils_autorises?id=eq.' + acc, 'DELETE')
  await a('contacts?id=eq.' + ct, 'DELETE')
  if (u.id) {
    await a('profils_roles_acces?profil_id=eq.' + u.id, 'DELETE')
    await a('profils_organisations?profil_id=eq.' + u.id, 'DELETE')
    await a('profils?id=eq.' + u.id, 'DELETE')
    await fetch(U + '/auth/v1/admin/users/' + u.id, { method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K } })
  }
  console.log('')
  console.log('(nettoye)')
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
