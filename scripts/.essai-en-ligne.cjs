/* LE CAS QUI DOIT ECHOUER : pendant qu'on PARLE, la modale ne doit pas recouvrir l'ecran.
   Le garde exige desormais `decroche_le`. On fabrique donc un appel DECROCHE vers le meme
   contact, et l'on verifie que la modale se tait — sinon elle s'ouvrirait en pleine
   conversation, au moment ou l'on prend des notes. */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const CONTACT = '4c59b72e-7a69-42af-bf1d-dc2512ce32e4', COMPTE = 'a05fa38d-8de9-4643-b8b4-c3a7cb4ac01b'

;(async () => {
  const t = await (await fetch(U + '/rest/v1/types_interactions?select=id&code=eq.APPEL', { headers: H })).json()
  const ri = await fetch(U + '/rest/v1/interactions', { method:'POST', headers:{...H, Prefer:'return=representation'},
    body: JSON.stringify({ type_interaction_id: t[0].id, date_interaction: new Date().toISOString(),
      objet: 'zzz essai en ligne', sens: 'SORTANT',
      auteur_profil_id: '14483439-27d3-4e48-b0db-b074b4fe2f4a', contact_id: CONTACT, compte_id: COMPTE }) })
  const inter = (await ri.json())[0]

  // L'APPEL DECROCHE : on est en train de parler.
  const ra = await fetch(U + '/rest/v1/appels_en_cours', { method:'POST', headers:{...H, Prefer:'return=representation'},
    body: JSON.stringify({ user_email: 'w.goupil@kiwee-energie.fr', numero: '+33782455786',
      numero_normalise: '782455786', sens: 'SORTANT',
      demarre_le: new Date(Date.now() - 60000).toISOString(),
      decroche_le: new Date(Date.now() - 50000).toISOString(),
      contact_id: CONTACT, compte_id: COMPTE }) })
  const appel = (await ra.json())[0]
  console.log('appel DECROCHE fabrique — on est cense etre en conversation')

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 900 } })
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
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' }); await page.waitForTimeout(16000)

    const vue = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')))
    console.log('')
    console.log('pendant la conversation -> modale', vue ? '*** OUVERTE — elle recouvre l ecran ***' : 'silencieuse (correct)')
  } finally {
    await nav.close()
    await fetch(U + '/rest/v1/interactions?id=eq.' + inter.id, { method:'DELETE', headers:H })
    await fetch(U + '/rest/v1/appels_en_cours?id=eq.' + appel.id, { method:'DELETE', headers:H })
    console.log('fabrications : effacees.')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
