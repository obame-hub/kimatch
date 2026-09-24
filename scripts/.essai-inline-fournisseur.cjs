/**
 * MODIFIER UNE CONDITION FOURNISSEUR DEPUIS LA FICHE, DE BOUT EN BOUT.
 *
 * Naoelle : « il faut pouvoir modifier directement sur les fiches et pas juste en base ».
 *
 * On ne se contente pas de voir un crayon : on clique, on saisit, et l'on verifie EN BASE que la
 * valeur a change — puis on remet l'etat d'origine, quoi qu'il arrive.
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')
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
  console.log('GEDIA avant : minimum = ' + avant.min_consumption + ' MWh  (70 attendu, du document)')

  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
  page.on('pageerror', (e) => console.log('   ERREUR PAGE : ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('   CONSOLE : ' + m.text().slice(0, 140)) })
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: env('ADRESSE_CAPTURE'), options: { redirect_to: BASE } }),
    })
    const j = await r.json()
    const lien = j.properties ? j.properties.action_link : j.action_link
    await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0], cs = 'sb-' + ref + '-auth-token'
    const sess = await page.evaluate((x) => localStorage.getItem(x), cs)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(([x, v]) => localStorage.setItem(x, v), [cs, sess])

    await page.goto(BASE + '/comptes/' + c.id, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(8000)
    fs.mkdirSync(SORTIE, { recursive: true })
    await page.screenshot({ path: path.join(SORTIE, 'inline-1-fiche.png'), fullPage: true })

    // Le champ « Minimum annuel » : on remonte du libelle a son voisin editable.
    const ligne = page.locator('div.flex.items-center').filter({ hasText: 'Minimum annuel' }).last()
    console.log('1. ligne « Minimum annuel » :', (await ligne.count()) ? 'presente' : '*** ABSENTE ***')
    if (!(await ligne.count())) return

    /* LA LIGNE PORTE DEUX BOUTONS : une icone « copier » et le crayon. Ma premiere version prenait
       le premier venu — donc « copier » — et concluait que la saisie n enregistrait pas. */
    /* LA LIGNE PORTE DEUX BOUTONS : « copier » puis le crayon. Ma premiere version prenait le
       premier venu — donc « copier » — et concluait que la saisie n enregistrait pas. */
    const crayon = ligne.getByRole('button').last()
    console.log('2. bouton d edition :', (await crayon.count()) ? 'present (' + (await crayon.count()) + ')' : '*** ABSENT — pas modifiable ***')
    if (!(await crayon.count())) return

    await crayon.click()
    await page.waitForTimeout(1200)
    const champ = ligne.locator('input')
    if (!(await champ.count())) { console.log('3. *** le clic n ouvre aucun champ de saisie ***'); return }

    await champ.first().fill('99')
    await champ.first().press('Enter')
    await page.waitForTimeout(3500)

    const apres = await lire(c.id)
    console.log('3. apres saisie de 99 :')
    console.log('   en base : minimum = ' + apres.min_consumption +
      (apres.min_consumption === 99 ? '  -> LA MODIFICATION EST ENREGISTREE' : '  *** RIEN N A CHANGE ***'))
    await page.screenshot({ path: path.join(SORTIE, 'inline-2-modifie.png'), fullPage: true })
  } finally {
    await nav.close()
    // ON REMET LA VALEUR DU DOCUMENT, quoi qu il soit arrive : un essai ne laisse pas la base fausse.
    await fetch(U + '/rest/v1/comptes_fournisseurs?compte_id=eq.' + c.id, {
      method: 'PATCH', headers: H, body: JSON.stringify({ min_consumption: avant.min_consumption }),
    })
    const remis = await lire(c.id)
    console.log('')
    console.log('GEDIA remis : minimum = ' + remis.min_consumption + ' MWh' +
      (remis.min_consumption === avant.min_consumption ? '  (conforme au document)' : '  *** A CORRIGER ***'))
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
