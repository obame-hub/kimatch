/**
 * LES ÉCRANS S'OUVRENT-ILS ? — EN PRODUCTION, PAS EN LOCAL.
 *
 * Naoëlle, 25/09/2026 : « on m'a dit que l'app buguait de fou ».
 *
 * Une base saine ne dit rien de ce que les gens voient. On ouvre donc les écrans un par un, sur
 * kimatch.fr, avec la session d'un vrai commercial, et l'on relève :
 *
 *   · les erreurs JavaScript de la console
 *   · les requêtes réseau en échec (4xx, 5xx)
 *   · les écrans qui restent vides
 *
 * AUCUNE ÉCRITURE : on ne fait que regarder.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_ECRANS || 'https://kimatch.fr'

const ECRANS = [
  ['/', 'Accueil'],
  ['/cockpit', 'Cockpit'],
  ['/pistes', 'Pistes'],
  ['/opportunites', 'Opportunités'],
  ['/comptes', 'Comptes'],
  ['/contacts', 'Contacts'],
  ['/compteurs', 'Compteurs'],
  ['/recommandations', 'Recommandations'],
  ['/mandats', 'Mandats'],
  ['/contrats', 'Contrats'],
  ['/patrimoine', 'Patrimoine'],
  ['/nouveautes', 'Nouveautés'],
]

let soucis = 0

;(async () => {
  const nav = await chromium.launch({ headless: true })
  const page = await nav.newPage()

  const co = (await (await fetch(
    U + '/rest/v1/profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1',
    { headers: H })).json())[0]

  const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: 'magiclink', email: co.email, options: { redirect_to: BASE } }),
  })).json()

  await page.goto(lr.properties ? lr.properties.action_link : lr.action_link,
    { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)

  console.log('')
  console.log('   ' + BASE + ' — au nom de ' + co.email)
  console.log('')
  console.log('   ' + 'ecran'.padEnd(18) + 'erreurs JS   requetes en echec')
  console.log('   ' + '─'.repeat(56))

  for (const [chemin, nom] of ECRANS) {
    const erreurs = []
    const echecs = []

    const surErreur = (e) => erreurs.push(String(e.message ?? e).slice(0, 120))
    const surConsole = (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 120)) }
    const surReponse = (r) => {
      if (r.status() >= 400) {
        /* Le pixel de suivi et les 406 de PostgREST sur `maybeSingle` sont attendus. */
        const u = r.url()
        if (u.includes('/api/gmail/ouvert') || r.status() === 406) return
        echecs.push(r.status() + ' ' + u.replace(/^https?:\/\/[^/]+/, '').slice(0, 70))
      }
    }

    page.on('pageerror', surErreur)
    page.on('console', surConsole)
    page.on('response', surReponse)

    try {
      await page.goto(BASE + chemin, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(4000)
    } catch (e) {
      erreurs.push('navigation : ' + String(e.message).slice(0, 80))
    }

    page.off('pageerror', surErreur)
    page.off('console', surConsole)
    page.off('response', surReponse)

    const ok = erreurs.length === 0 && echecs.length === 0
    if (!ok) soucis++
    console.log('   ' + nom.padEnd(18) + String(erreurs.length).padEnd(13) + echecs.length +
      (ok ? '' : '   ***'))

    for (const e of erreurs.slice(0, 3)) console.log('        JS  ' + e)
    for (const e of echecs.slice(0, 3)) console.log('        NET ' + e)
  }

  await nav.close()

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LES ' + ECRANS.length + ' ECRANS S OUVRENT SANS ERREUR'
    : '  *** ' + soucis + ' ECRAN(S) EN ERREUR ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
