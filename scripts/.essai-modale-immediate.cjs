/**
 * COMBIEN DE TEMPS ENTRE LE CLIC « APPELER » ET LA MODALE ?
 *
 * Naoelle, 23/09/2026 : « je veux que la modale apparaisse au moment de l'appel, pas 10 secondes
 * apres ».
 *
 * On CHRONOMETRE. « Elle s'ouvre » ne suffit pas : c'est le delai qui est en cause, et un delai se
 * mesure. On clique sur le vrai bouton telephone d'une fiche, et l'on compte jusqu'a la modale.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5183'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const CONTACT = '4c59b72e-7a69-42af-bf1d-dc2512ce32e4'
const env = (c) => { const l = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'=')); return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null }
const U = env('VITE_SUPABASE_URL'), K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 950 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE :', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('   CONSOLE :', m.text().slice(0,160)) })
  let cree = null
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

    await page.goto(BASE + '/contacts/' + CONTACT, { waitUntil:'domcontentloaded', timeout:60000 })
    await page.waitForTimeout(8000)

    // Si une modale traine d'un essai precedent, on la ferme : elle fausserait le chrono.
    if (await page.locator('[role="dialog"][aria-modal="true"]').count()) {
      await page.getByRole('button', { name: 'Plus tard', exact: true }).click().catch(() => {})
      await page.waitForTimeout(4000)
    }

    // LE VRAI BOUTON TELEPHONE de la fiche, celui que Naoelle clique.
    const cible = page.getByRole('button', { name: /^Appeler le/ }).first()


    fs.mkdirSync(SORTIE, { recursive:true })
    const t0 = Date.now()
    await cible.click({ timeout: 10000 })
    console.log('clic « Appeler » emis.')

    // On attend la modale, au plus 12 s — au-dela, le sondage l'aurait deja ouverte.
    let vue = false
    while (Date.now() - t0 < 12000) {
      if (await page.locator('[role="dialog"][aria-modal="true"]').count()) { vue = true; break }
      await page.waitForTimeout(100)
    }
    const delai = ((Date.now() - t0) / 1000).toFixed(2)
    console.log('')
    console.log(vue ? '   MODALE OUVERTE apres ' + delai + ' s' : '   AUCUNE MODALE en 12 s');
    if (vue) console.log(Number(delai) < 3 ? '   -> immediate (moins de 3 s)' : '   -> *** trop lente : c est encore le sondage ***')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(SORTIE, 'modale-immediate.png') })

    const contenu = await page.evaluate(() => {
      const m = document.querySelector('[role="dialog"][aria-modal="true"]')
      return m ? m.innerText.split(String.fromCharCode(10)).filter(Boolean).join(' | ').slice(0, 180) : null
    })
    console.log('   dans la modale :', contenu)
    const fil = await page.evaluate(() => {
      const t = document.body.innerText
      const i = t.indexOf('Appel sortant')
      return i < 0 ? null : t.slice(i, i + 120).split(String.fromCharCode(10)).filter(Boolean).join(' | ')
    })
    console.log('   en tete du fil :', fil)

    const a = await (await fetch(U + '/rest/v1/appels_en_cours?ouvert_par_kimatch=is.true&select=id&order=demarre_le.desc&limit=1', { headers: H })).json()
    const i = await (await fetch(U + '/rest/v1/interactions?ouverte_par_kimatch=is.true&select=id&order=date_interaction.desc&limit=1', { headers: H })).json()
    cree = { appel: a[0]?.id, inter: i[0]?.id }
  } finally {
    await nav.close()
    if (cree?.inter) await fetch(U + '/rest/v1/interactions?id=eq.' + cree.inter, { method:'DELETE', headers:H })
    if (cree?.appel) await fetch(U + '/rest/v1/appels_en_cours?id=eq.' + cree.appel, { method:'DELETE', headers:H })
    console.log('fabrications : effacees.')
  }
})().catch(e => { console.error('ECHEC :', e.message); process.exit(1) })
