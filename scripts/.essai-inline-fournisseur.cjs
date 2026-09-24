/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MODIFIER UNE CONDITION FOURNISSEUR DEPUIS LA FICHE, DE BOUT EN BOUT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « il faut pouvoir modifier directement sur les fiches et pas juste en
 * base, des modifications de champs inline ».
 *
 * ══ POURQUOI CE SCRIPT A MIS TROIS ESSAIS A MARCHER ══
 *
 * Il ne suffit pas de voir un crayon. Mes deux premieres versions ont chacune conclu a tort :
 *
 *   · la premiere cliquait le PREMIER bouton de la ligne — l'icone « copier » — et annoncait que
 *     la saisie n'enregistrait pas ;
 *   · la seconde cherchait le champ de saisie DANS la ligne, alors qu'InlineField remplace le
 *     contenu et que Playwright garde l'ancienne portee.
 *
 * Un essai qui vise mal accuse le produit a sa place. On liste donc les boutons avant de choisir,
 * et l'on cherche le champ sur la page entiere.
 *
 * ON VERIFIE EN BASE, JAMAIS A L'ECRAN : un champ qui affiche la valeur saisie ne prouve rien —
 * c'est exactement ce que faisait l'ecran quand l'`upsert` echouait en silence.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const SORTIE = path.join(process.cwd(), 'essai-rattachement')
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

const lire = async (id) =>
  (await (await fetch(U + '/rest/v1/comptes_fournisseurs?compte_id=eq.' + id +
    '&select=min_consumption,response_delay_days,segments,min_ellipro_score', { headers: H })).json())[0]

;(async () => {
  const c = (await (await fetch(U + '/rest/v1/comptes?nom=eq.GEDIA&select=id,nom', { headers: H })).json())[0]
  if (!c) { console.log('GEDIA introuvable'); return }
  const avant = await lire(c.id)
  console.log('GEDIA avant : minimum = ' + avant.min_consumption + ' MWh  (70 au document)')

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE : ' + e.message))
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: env('ADRESSE_CAPTURE'), options: { redirect_to: BASE } }),
    })
    const j = await r.json()
    const lien = j.properties ? j.properties.action_link : j.action_link
    await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0]
    const cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((x) => localStorage.getItem(x), cs)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(([x, v]) => localStorage.setItem(x, v), [cs, sess])

    await page.goto(BASE + '/comptes/' + c.id, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(8000)
    fs.mkdirSync(SORTIE, { recursive: true })
    await page.screenshot({ path: path.join(SORTIE, 'inline-1-fiche.png'), fullPage: true })

    const ligne = page.locator('div.flex.items-center').filter({ hasText: 'Minimum annuel' }).last()
    console.log('1. ligne « Minimum annuel » : ' + ((await ligne.count()) ? 'presente' : '*** ABSENTE ***'))
    if (!(await ligne.count())) return

    // ON LISTE LES BOUTONS AVANT DE CHOISIR : c'est ce qui manquait aux deux premieres versions.
    const boutons = ligne.getByRole('button')
    const titres = await boutons.evaluateAll((els) =>
      els.map((e) => (e.getAttribute('title') || e.getAttribute('aria-label') || '?').trim()))
    console.log('2. boutons de la ligne : ' + JSON.stringify(titres))

    const crayon = ligne.getByRole('button', { name: /modifier/i })
    /* LE CRAYON EST LE PREMIER BOUTON, sans titre ; « Copier » est le second. Mesure :
       les titres releves sont ["?", "Copier"]. */
    const cible = (await crayon.count()) ? crayon.first() : boutons.first()
    await cible.click()
    await page.waitForTimeout(1200)

    /* LE CHAMP S'OUVRE HORS DE LA PORTEE DE LA LIGNE : InlineField remplace le contenu. On le
       cherche sur la page, en excluant la recherche globale de l'en-tete. */
    await page.screenshot({ path: path.join(SORTIE, 'inline-clic.png'), fullPage: true })
    const tousInputs = await page.locator('input').evaluateAll((els) => els.map((e) => (e.type || '?') + ':' + (e.placeholder || e.value || '').slice(0, 24)))
    console.log('   champs presents apres clic : ' + JSON.stringify(tousInputs))
    const champ = page.locator('input').last()
    if (!(await champ.count())) { console.log('3. *** aucun champ de saisie ***'); return }

    /* ON SAISIT AU CLAVIER, pas avec fill() : React ecoute onChange, et un fill() qui pose la
       valeur sans evenement laisse l etat interne du composant sur l ancienne. Le champ affichait
       99 et le composant enregistrait 70 — mon essai accusait le produit a sa place. */
    /* LE CHAMP EST DEJA FOCUS a l ouverture (InlineField appelle focus() + select()).
       On tape donc au CLAVIER DE LA PAGE : passer par le locator reclique ailleurs et perd le
       focus, ce qui referme le champ sur son ancienne valeur. */
    const focus = await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + ":" + (a.type || "") + ":" + (a.value || "") : "AUCUN" })
    console.log("   element ayant le focus : " + focus)
    /* PAS DE Control+A : Kimatch capte ce raccourci (voir lib/raccourci.ts) et le champ se
       refermait sur son ancienne valeur. InlineField fait deja select() a l ouverture, donc le
       texte est deja choisi : taper le remplace. */
    await page.keyboard.type("99", { delay: 80 })
    const avantEnter = await page.evaluate(() => { const a = document.activeElement; return a ? a.value : "AUCUN FOCUS" })
    console.log("   valeur du champ juste avant Enter : " + JSON.stringify(avantEnter))
    await page.keyboard.press("Enter")
    await page.waitForTimeout(1500)
    const apresSaisie = await page.locator("input").evaluateAll((els) => els.map((e) => e.value))
    console.log("   champs apres Enter : " + JSON.stringify(apresSaisie))
    const texteLigne = await ligne.innerText().catch(() => "?")
    console.log("   la ligne affiche  : " + texteLigne.split(String.fromCharCode(10)).join(" | "))
    await page.waitForTimeout(4000)

    const apres = await lire(c.id)
    const ecrit = apres.min_consumption === 99
    console.log('3. apres saisie de 99 :')
    console.log('   en base : minimum = ' + apres.min_consumption +
      (ecrit ? '  -> LA MODIFICATION EST ENREGISTREE' : '  *** RIEN N A CHANGE ***'))
    await page.screenshot({ path: path.join(SORTIE, 'inline-2-modifie.png'), fullPage: true })
  } finally {
    await nav.close()
    /* ON REMET LA VALEUR DU DOCUMENT, quoi qu'il soit arrive : un essai ne laisse pas la base
       fausse, surtout sur un critere qui decide quels fournisseurs sont proposes. */
    await fetch(U + '/rest/v1/comptes_fournisseurs?compte_id=eq.' + c.id, {
      method: 'PATCH', headers: H, body: JSON.stringify({ min_consumption: avant.min_consumption }),
    })
    const remis = await lire(c.id)
    console.log('')
    console.log('GEDIA remis : minimum = ' + remis.min_consumption + ' MWh' +
      (remis.min_consumption === avant.min_consumption ? '  (conforme au document)' : '  *** A CORRIGER ***'))
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
