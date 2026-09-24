/**
 * DEPUIS « APPELS A RATTACHER », LE CLIC PERMET-IL VRAIMENT DE RATTACHER ?
 *
 * Naoelle, 24/09/2026 : « une fois sur la liste appels a rattacher, quand je vais cliquer sur
 * l'appel, est-ce que j'ai une option pour rattacher ? »
 *
 * On ne se contente pas d'ouvrir la fenetre : on VA JUSQU'AU BOUT. On choisit un objet, et l'on
 * verifie EN BASE que le lien est ecrit — puis que l'appel disparait de la liste, ce qui est la
 * seule preuve qu'il est traite.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const CONTACT = '4c59b72e-7a69-42af-bf1d-dc2512ce32e4', COMPTE = 'a05fa38d-8de9-4643-b8b4-c3a7cb4ac01b'

;(async () => {
  // Un appel D'HIER : assez vieux pour que la modale automatique ne s'en saisisse pas, donc on
  // eprouve bien le chemin par la LISTE et non celui de la fin d'appel.
  const t = await (await fetch(U + '/rest/v1/types_interactions?select=id&code=eq.APPEL', { headers: H })).json()
  const hier = new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  const r = await fetch(U + '/rest/v1/interactions', { method:'POST', headers:{...H, Prefer:'return=representation'},
    body: JSON.stringify({ type_interaction_id: t[0].id, date_interaction: hier,
      objet: 'zzz essai liste rattacher', sens: 'SORTANT',
      auteur_profil_id: '14483439-27d3-4e48-b0db-b074b4fe2f4a', contact_id: CONTACT, compte_id: COMPTE }) })
  const cree = (await r.json())[0]
  console.log('appel fabrique (date d hier) :', cree.id.slice(0,8))

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
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
    await page.goto(BASE + '/', { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(14000)
    fs.mkdirSync(SORTIE, { recursive:true })

    // Une modale automatique traine ? On la ferme : elle masquerait la liste.
    if (await page.locator('[role="dialog"][aria-modal="true"]').count()) {
      await page.getByRole('button', { name: 'Plus tard', exact: true }).click().catch(() => {})
      await page.waitForTimeout(5000)
    }

    const bloc = page.locator('h3', { hasText: 'Appels à rattacher' })
    console.log('1. bloc « Appels a rattacher » :', (await bloc.count()) ? 'present' : '*** absent ***')
    if (!(await bloc.count())) return
    await bloc.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SORTIE, 'liste-1-bloc.png') })

    // ON CLIQUE SUR UNE LIGNE de la liste.
    // La liste est le <ul> qui suit le titre, dans la meme carte. On remonte au parent commun.
    const carte = bloc.locator('xpath=ancestor::div[.//ul][1]')
    const lignes0 = carte.locator('ul li button')
    console.log('   lignes dans la liste :', await lignes0.count())
    await lignes0.first().click({ timeout: 15000 })
    await page.waitForTimeout(3000)
    const ouverte = await page.locator('[role="dialog"][aria-modal="true"]').count()
    console.log('2. clic sur un appel -> fenetre de rattachement :', ouverte ? 'OUVERTE' : '*** rien ***')
    if (!ouverte) return
    await page.screenshot({ path: path.join(SORTIE, 'liste-2-modale.png') })

    // ON VA JUSQU AU BOUT : deplier une categorie, choisir un objet.
    const sections = await page.locator('[role="dialog"] button[aria-expanded]').all()
    console.log('3. categories depliantes :', sections.length)
    if (!sections.length) return
    const nom = (await sections[0].innerText()).split(String.fromCharCode(10))[0].trim()
    await sections[0].click()
    await page.waitForTimeout(900)
    const lignes = page.locator('[role="dialog"] button[aria-expanded="true"] + div button')
    const n = await lignes.count()
    console.log('   « ' + nom + ' » deplie ->', n, 'enregistrement(s)')
    if (!n) return
    const choisi = (await lignes.first().innerText()).split(String.fromCharCode(10))[0].trim()
    await lignes.first().click()
    await page.waitForTimeout(4000)
    console.log('4. objet choisi :', choisi)

    // ── LA PREUVE EST EN BASE ──
    const apres = await (await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id +
      '&select=opportunite_id,recommandation_id,requete_id,piste_id', { headers: H })).json()
    const a = apres[0]
    const lien2 = ['opportunite_id','recommandation_id','requete_id','piste_id'].find((k) => a[k])
    console.log('')
    console.log('   rattache en base ?', lien2 ? 'OUI -> ' + lien2 : '*** NON — le clic n a rien ecrit ***')

    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(SORTIE, 'liste-3-apres.png'), fullPage: true })
    const restant = await page.evaluate(() => {
      const h = [...document.querySelectorAll('h3')].find((x) => /Appels à rattacher/.test(x.innerText))
      return h ? (h.parentElement?.innerText || '').split(String.fromCharCode(10))[1] : null
    })
    console.log('   compteur de la liste apres rattachement :', restant)
  } finally {
    await nav.close()
    await fetch(U + '/rest/v1/interactions?id=eq.' + cree.id, { method:'DELETE', headers:H })
    console.log('appel fabrique : efface.')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
