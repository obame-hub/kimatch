/**
 * LE RESTE DE LA PAGE ROLES : CREER, RENOMMER, DESACTIVER.
 *
 * Les interrupteurs ont ete eprouves ; le reste ne l'avait pas ete. Dire « c'est bon » sans
 * avoir clique ces trois boutons serait supposer, pas verifier.
 *
 * On travaille sur un role FABRIQUE et on l'efface a la fin : aucun role reel n'est touche.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const NOM = 'Essai temporaire'
const CODE = 'ESSAI_TEMPORAIRE'
const lire = async () => (await (await fetch(U + '/rest/v1/roles_acces?code=eq.' + CODE +
  '&select=id,libelle,description,actif,ouvre_administration', { headers: H })).json())[0]

;(async () => {
  // On part propre : un essai precedent a pu laisser la ligne.
  await fetch(U + '/rest/v1/roles_acces?code=eq.' + CODE, { method: 'DELETE', headers: H })

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
    await page.waitForTimeout(5000)
    await page.getByRole('button', { name: /Rôles & permissions/ }).click()
    await page.waitForTimeout(4000)
    fs.mkdirSync(SORTIE, { recursive:true })

    // ── ① CREER ──
    await page.getByRole('button', { name: /Créer un rôle/ }).click()
    await page.waitForTimeout(800)
    await page.getByPlaceholder(/Nom du rôle/).fill(NOM)
    await page.getByPlaceholder(/À quoi sert-il/).fill('Cree par un essai automatique')
    await page.getByRole('button', { name: 'Créer', exact: true }).click()
    await page.waitForTimeout(3500)
    let r = await lire()
    console.log('1. CREER      :', r ? 'role cree, code = ' + CODE : '*** rien en base ***')
    if (!r) return
    console.log('   ses droits  :', r.ouvre_administration ? '*** il naît administrateur ***' : 'aucun (correct)')

    // ── ② RENOMMER ──
    await page.screenshot({ path: path.join(SORTIE, 'roles-apres-creation.png'), fullPage: true })
    const cartes = await page.locator('div.rounded-km').filter({ has: page.getByRole('switch') }).count()
    console.log('   cartes de role a l ecran :', cartes)
    const avecNom = await page.locator('div.rounded-km').filter({ hasText: NOM }).filter({ has: page.getByRole('switch') }).count()
    console.log('   cartes contenant « ' + NOM + '  » :', avecNom)
    if (avecNom === 0) {
      const textes = await page.locator('div.rounded-km p.font-semibold').allInnerTexts()
      console.log('   noms visibles :', textes.join(' | '))
      console.log('   -> la carte du nouveau role n est pas affichee : la liste ne s est pas relue.')
      return
    }
    const carte = page.locator('div.rounded-km').filter({ hasText: NOM }).filter({ has: page.getByRole('switch') }).last()
    const boutons = await carte.getByRole('button').count()
    console.log('   boutons dans la carte :', boutons)
    const noms = await carte.getByRole('button').evaluateAll((els) =>
      els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)))
    console.log('   leurs libelles :', JSON.stringify(noms))
    console.log('   texte de la carte :', (await carte.innerText()).split(String.fromCharCode(10)).filter(Boolean).slice(0,6).join(' | '))
    /* ON REMONTE DEPUIS LE BOUTON, pas depuis une classe : `.rounded-km` attrape aussi des
       conteneurs internes, et le champ de saisie se retrouve alors hors de la portee. */
    await carte.getByRole('button', { name: /Renommer/ }).click()
    await page.waitForTimeout(900)
    const champ = page.locator('input').filter({ hasNot: page.locator('[placeholder]') }).first()
    const combien = await page.locator('input').count()
    console.log('   champs de saisie ouverts :', combien)
    await champ.fill('Essai renomme')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForTimeout(3000)
    r = await lire()
    console.log('2. RENOMMER   :', r.libelle === 'Essai renomme' ? 'libelle change en base' : '*** toujours « ' + r.libelle + ' » ***')
    console.log('   le code     :', r.code === undefined ? '(non lu)' : 'inchange — correct, il sert de cle')

    // ── ③ DESACTIVER ──
    const carte2 = page.locator('div.rounded-km').filter({ hasText: 'Essai renomme' }).filter({ has: page.getByRole('switch') }).last()
    await carte2.getByRole('button', { name: 'Désactiver' }).click()
    await page.waitForTimeout(3000)
    r = await lire()
    console.log('3. DESACTIVER :', r.actif === false ? 'role desactive en base' : '*** toujours actif ***')

    await page.screenshot({ path: path.join(SORTIE, 'roles-complet.png'), fullPage: true })
  } finally {
    await nav.close()
    await fetch(U + '/rest/v1/roles_acces?code=eq.' + CODE, { method: 'DELETE', headers: H })
    const reste = await lire()
    console.log('')
    console.log('role d essai :', reste ? '*** SUBSISTE ***' : 'efface.')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
