/**
 * LE PARCOURS COMPLET : UN APPEL VIENT DE FINIR, LA MODALE S'OUVRE, ON L'ECARTE, ELLE NE REVIENT PAS
 *
 * Naoelle, 23/09/2026 : « quand je refresh j'ai la modale qui s'affiche en permanence ».
 *
 * L'essai precedent ne prouvait rien : sans appel recent, la modale ne s'ouvre pas, et « elle ne
 * revient pas » ne veut alors rien dire. On FABRIQUE donc un appel qui vient de finir — exactement
 * ce que le webhook ecrirait — puis on eprouve le parcours, et on efface derriere soi.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const WILLIAM = '14483439-27d3-4e48-b0db-b074b4fe2f4a'
const CONTACT = '4c59b72e-7a69-42af-bf1d-dc2512ce32e4'
const COMPTE = 'a05fa38d-8de9-4643-b8b4-c3a7cb4ac01b'

const voir = (page) => page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')))

;(async () => {
  // ── On fabrique l'appel qui vient de finir ──
  const t = await (await fetch(U + '/rest/v1/types_interactions?select=id&code=eq.APPEL', { headers: H })).json()
  const r = await fetch(U + '/rest/v1/interactions', {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({
      type_interaction_id: t[0].id, date_interaction: new Date().toISOString(),
      objet: 'zzz essai parcours modale', sens: 'SORTANT',
      auteur_profil_id: WILLIAM, contact_id: CONTACT, compte_id: COMPTE,
    }),
  })
  const cree = (await r.json())[0]
  if (!cree?.id) throw new Error('creation impossible : ' + JSON.stringify(cree).slice(0,200))
  console.log('appel fabrique :', cree.id.slice(0,8), '— date', new Date(cree.date_interaction).toLocaleTimeString('fr-FR'))

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 900 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  try {
    const cle = K
    const lienR = await fetch(U + '/auth/v1/admin/generate_link', { method:'POST', headers:H,
      body: JSON.stringify({ type:'magiclink', email: env('ADRESSE_CAPTURE'), options:{ redirect_to: BASE } }) })
    const corps = await lienR.json().catch(()=>null)
    const lien = corps?.properties?.action_link ?? corps?.action_link
    if (!lien) throw new Error('pas de lien : ' + JSON.stringify(corps).slice(0,200))
    void cle
    await page.goto(lien, { waitUntil:'domcontentloaded', timeout:60000 }); await page.waitForTimeout(3000)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((c) => localStorage.getItem(c), cs)
    if (!sess) throw new Error('pas de session')
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded' })
    await page.evaluate(([c,v]) => localStorage.setItem(c,v), [cs,sess])

    await page.goto(BASE + '/', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(15000)
    fs.mkdirSync(SORTIE, { recursive:true })

    const ouverte = await voir(page)
    console.log('1. appel qui vient de finir -> modale', ouverte ? 'OUI' : '*** non — elle devrait s ouvrir ***')
    await page.screenshot({ path: path.join(SORTIE,'parcours-1.png') })
    if (!ouverte) return

    await page.getByRole('button', { name: 'Plus tard', exact: true }).click()
    await page.waitForTimeout(6000)
    console.log('2. apres « Plus tard »      : modale', await voir(page) ? '*** ENCORE LA ***' : 'fermee')

    await page.reload({ waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(15000)
    console.log('3. APRES RECHARGEMENT       : modale', await voir(page) ? '*** REVENUE — DEFAUT ***' : 'ABSENTE — corrige')
    await page.screenshot({ path: path.join(SORTIE,'parcours-2-apres-f5.png') })

    await page.reload({ waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(13000)
    console.log('4. second rechargement      : modale', await voir(page) ? '*** REVENUE ***' : 'toujours absente')
  } finally {
    await nav.close()
    // ON EFFACE DERRIERE SOI : un essai qui laisse des traces en production est une dette.
    await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id, { method:'DELETE', headers:H })
    console.log('appel fabrique : efface.')
  }
})().catch((e) => { console.error('ECHEC :', e.message); process.exit(1) })
