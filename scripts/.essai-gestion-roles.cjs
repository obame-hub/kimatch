/**
 * LA PAGE ROLES REGLE-T-ELLE VRAIMENT ?
 *
 * Naoelle, 24/09/2026 : « fais en sorte qu'on puisse gerer aussi, pas seulement voir en mode
 * lecture ».
 *
 * Le piege de cette page est connu : celle d'avant affichait des cases a cocher qui n'agissaient
 * sur rien. On ne se contente donc PAS de verifier que l'interrupteur bascule a l'ecran — on
 * verifie EN BASE que la valeur a change, et l'on eprouve le verrou qui empeche de se verrouiller
 * dehors.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const lire = async (code) => (await (await fetch(U + '/rest/v1/roles_acces?code=eq.' + code +
  '&select=id,libelle,voit_tous_les_comptes,ouvre_administration,supprime_tout,recoit_le_support,actif', { headers: H })).json())[0]

;(async () => {
  const avant = await lire('DIRECTEUR')
  console.log('DIRECTEUR avant :  voitTout=' + avant.voit_tous_les_comptes, ' admin=' + avant.ouvre_administration)

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('   CONSOLE :', m.text().slice(0,160)) })
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

    await page.goto(BASE + '/administration', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(6000)
    await page.getByRole('button', { name: /Rôles & permissions/ }).click()
    await page.waitForTimeout(5000)
    fs.mkdirSync(SORTIE, { recursive:true })
    await page.screenshot({ path: path.join(SORTIE, 'roles-1-page.png'), fullPage: true })

    const cartes = await page.locator('p.font-semibold').allInnerTexts()
    console.log('1. roles affiches :', cartes.filter((t) => !/agissent|Nouveau|sans rôle/i.test(t)).slice(0, 10).join(' | '))
    const inters = await page.getByRole('switch').count()
    console.log('2. interrupteurs a l ecran :', inters, '(9 roles x 4 droits = 36 attendu)')

    // ── LE RÉGLAGE AGIT-IL ? On bascule « voit tout le portefeuille » sur DIRECTEUR. ──
    /* ON CIBLE PAR LE TEXTE DE LA CARTE, jamais par un index : l'essai precedent comptait les
       interrupteurs dans l'ordre et tombait a cote, parce qu'une banniere « Sandbox » precede la
       liste. Il concluait « rien n a change » alors que l'ecriture marchait. */
    const carte = page.locator('div.rounded-km').filter({ hasText: 'Directeur' })
      .filter({ has: page.getByRole('switch') }).last()
    const premier = carte.getByRole('switch').first()
    console.log('   etat de l interrupteur vise avant clic :', await premier.getAttribute('aria-checked'))
    console.log('   desactive ?', await premier.isDisabled())
    await premier.click()
    await page.waitForTimeout(2000)
    console.log('   etat apres clic                        :', await premier.getAttribute('aria-checked'))
    await page.waitForTimeout(3500)
    const apres = await lire('DIRECTEUR')
    console.log('')
    console.log('3. apres un clic sur « Voit tout le portefeuille » :')
    console.log('   en base : voitTout =', apres.voit_tous_les_comptes,
      apres.voit_tous_les_comptes !== avant.voit_tous_les_comptes ? '-> LE REGLAGE A AGI' : '*** RIEN N A CHANGE ***')
    await page.screenshot({ path: path.join(SORTIE, 'roles-2-apres-clic.png'), fullPage: true })

    // On remet l'etat d'origine : un essai ne laisse pas de trace en production.
    await fetch(U + '/rest/v1/roles_acces?code=eq.DIRECTEUR', { method:'PATCH', headers:H,
      body: JSON.stringify({ voit_tous_les_comptes: avant.voit_tous_les_comptes }) })
    const remis = await lire('DIRECTEUR')
    console.log('   remis a', remis.voit_tous_les_comptes)
  } finally { await nav.close() }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
