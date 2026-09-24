/**
 * OUVRIR UN ACCES PARTENAIRE DEPUIS L'ECRAN, DE BOUT EN BOUT.
 *
 * On ne se contente pas de voir le bloc : on clique « Ouvrir l acces » sur un contact, et l'on
 * verifie EN BASE que la ligne porte le bon contact, la bonne adresse et le role PARTENAIRE.
 * Puis on efface.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const avant = await (await fetch(U + '/rest/v1/profils_autorises?select=id&limit=1', { headers: Object.assign({}, H, { Prefer: 'count=exact' }) })).headers.get('content-range')
  console.log('acces autorises avant :', avant)

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('   CONSOLE :', m.text().slice(0,140)) })
  let cree = null
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

    await page.goto(BASE + '/administration', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(5000)
    await page.getByRole('button', { name: /Accès autorisés/ }).click()
    await page.waitForTimeout(5000)
    fs.mkdirSync(SORTIE, { recursive:true })

    const bloc = page.getByRole('button', { name: /Ouvrir un accès à un partenaire/ })
    console.log('1. bloc partenaires :', (await bloc.count()) ? 'present' : '*** ABSENT ***')
    if (!(await bloc.count())) { await page.screenshot({ path: path.join(SORTIE,'acces-absent.png'), fullPage:true }); return }

    await bloc.click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SORTIE, 'acces-partenaires.png'), fullPage: true })

    const boutons = page.getByRole('button', { name: /Ouvrir l.accès/ })
    const n = await boutons.count()
    console.log('2. contacts proposes :', n)
    if (!n) return

    // Le contact vise : on lit son adresse juste au-dessus du bouton.
    const ligne = boutons.first().locator('xpath=ancestor::li[1]')
    const texte = (await ligne.innerText()).split(String.fromCharCode(10)).filter(Boolean)
    console.log('3. on ouvre l acces a :', texte.slice(0,2).join(' — '))
    const mail = texte.find((t) => t.includes('@'))

    await boutons.first().click()
    await page.waitForTimeout(4000)

    const apres = await (await fetch(U + '/rest/v1/profils_autorises?email=eq.' + encodeURIComponent(mail) +
      '&select=id,email,contact_id,role_acces_id,prenom,nom', { headers: H })).json()
    console.log('')
    if (!apres.length) { console.log('4. *** RIEN EN BASE : l ecran a menti ***'); return }
    cree = apres[0].id
    const role = await (await fetch(U + '/rest/v1/roles_acces?id=eq.' + apres[0].role_acces_id + '&select=code', { headers: H })).json()
    console.log('4. EN BASE :', apres[0].email)
    console.log('   contact rattache :', apres[0].contact_id ? 'oui' : '*** NON — le cloisonnement ne marchera pas ***')
    console.log('   role             :', role[0] ? role[0].code : '?', role[0] && role[0].code === 'PARTENAIRE' ? '(correct)' : '*** attendu PARTENAIRE ***')
    await page.screenshot({ path: path.join(SORTIE, 'acces-apres.png'), fullPage: true })
  } finally {
    await nav.close()
    if (cree) { await fetch(U + '/rest/v1/profils_autorises?id=eq.' + cree, { method:'DELETE', headers:H }); console.log(''); console.log('acces d essai : efface.') }
  }
})().catch(e => { console.error('ECHEC : ' + e.message); process.exit(1) })
