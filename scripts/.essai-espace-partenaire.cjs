/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE VOIT UN PARTENAIRE, A L'ECRAN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « il n'est pas cense voir ni cockpit ni piste, affiche seulement ce dont il
 * a besoin et specifie quelque part qu'on est sur l'espace partenaire ».
 *
 * ══ ON REGARDE LE RAIL, PAS LE CODE ══
 *
 * Lire `partenaireNavItems` et conclure « il ne verra que deux entrees » ne prouve rien : le rail
 * peut ne pas savoir qui est partenaire, le hook peut rendre faux, la session peut ne pas porter le
 * rattachement. On se connecte donc a sa place et l'on releve ce qui est REELLEMENT affiche.
 *
 * ══ ON EMPRUNTE UN PROFIL, ET ON LE REND ══
 *
 * Pas de compte fabrique : `profils.id` reference `auth.users`, il faudrait creer un vrai compte
 * d'authentification en production. On rattache donc TEMPORAIREMENT un profil existant a un compte
 * partenaire, et on le detache dans le `finally` — quoi qu'il arrive, y compris en cas d'echec.
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

let echecs = 0
const dire = (ok, texte) => { if (!ok) echecs++; console.log('   ' + (ok ? '  ok   ' : ' ECART ') + ' | ' + texte) }

;(async () => {
  const moi = (await (await fetch(U + '/rest/v1/profils?email=eq.' + env('ADRESSE_CAPTURE') +
    '&select=id,compte_partenaire_id', { headers: H })).json())[0]
  if (!moi) { console.log('profil introuvable'); return }
  const rattachementOrigine = moi.compte_partenaire_id

  const partenaire = (await (await fetch(U + '/rest/v1/comptes?type_compte_id=eq.' +
    '8e746506-fd52-4ec0-bb54-2ad5a461626b&select=id,nom&limit=1', { headers: H })).json())[0]
  if (!partenaire) { console.log('aucun compte partenaire en base'); return }
  console.log('on emprunte l identite d un utilisateur de : ' + partenaire.nom)

  const nav = await chromium.launch({ headless: true })
  try {
    // ── ① D'ABORD L'EQUIPE : c'est le temoin. Sans lui, on ne saurait pas si le rail est reduit
    //    pour le partenaire ou cassé pour tout le monde.
    const relever = async (etiquette) => {
      const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
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
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(7000)
        fs.mkdirSync(SORTIE, { recursive: true })
        await page.screenshot({ path: path.join(SORTIE, 'espace-' + etiquette + '.png'), fullPage: false })
        const rail = await page.evaluate(() => {
          const n = document.querySelector('aside nav')
          return n ? n.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : []
        })
        const sousTitre = await page.evaluate(() => {
          const p = document.querySelectorAll('aside p')
          return p.length > 1 ? p[1].innerText.trim() : '?'
        })
        return { rail, sousTitre }
      } finally { await page.close() }
    }

    const equipe = await relever('equipe')
    console.log('')
    console.log('══ CE QUE VOIT L EQUIPE (temoin) ══')
    console.log('   sous-titre : ' + equipe.sousTitre)
    console.log('   rail       : ' + equipe.rail.join(' · '))

    // ── ② PUIS LE PARTENAIRE ──
    await fetch(U + '/rest/v1/profils?id=eq.' + moi.id, {
      method: 'PATCH', headers: H, body: JSON.stringify({ compte_partenaire_id: partenaire.id }),
    })
    const part = await relever('partenaire')

    console.log('')
    console.log('══ CE QUE VOIT LE PARTENAIRE ══')
    console.log('   sous-titre : ' + part.sousTitre)
    console.log('   rail       : ' + part.rail.join(' · '))
    console.log('')

    dire(/espace partenaire/i.test(part.sousTitre), 'le rail annonce « Espace partenaire »')
    for (const interdit of ['Cockpit', 'Pistes', 'Opportunités', 'Pricing', 'Requêtes', 'Vue d’ensemble', 'Suivis de contrats']) {
      dire(!part.rail.some((e) => e === interdit), interdit + ' n apparait pas')
    }
    for (const attendu of ['Mes recommandations', 'Mon patrimoine']) {
      dire(part.rail.some((e) => e === attendu), attendu + ' apparait')
    }
    dire(!part.rail.includes('Administration'), 'Administration n apparait pas')

    // ── OU ATTERRIT-IL, ET QUE SE PASSE-T-IL S IL TAPE UNE ADRESSE INTERNE ? ──
    const page2 = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
    try {
      const ref2 = new URL(U).hostname.split('.')[0]
      const cs2 = 'sb-' + ref2 + '-auth-token'
      const r2 = await fetch(U + '/auth/v1/admin/generate_link', { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email: env('ADRESSE_CAPTURE'), options: { redirect_to: BASE } }) })
      const j2 = await r2.json()
      await page2.goto(j2.properties ? j2.properties.action_link : j2.action_link, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page2.waitForTimeout(2500)
      const sess2 = await page2.evaluate((x) => localStorage.getItem(x), cs2)
      await page2.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
      await page2.evaluate(([x, v]) => localStorage.setItem(x, v), [cs2, sess2])
      for (const [depart, attendu] of [['/', '/recommandations'], ['/pistes', '/recommandations'], ['/cockpit', '/recommandations'], ['/administration', '/recommandations'], ['/recommandations', '/recommandations']]) {
        await page2.goto(BASE + depart, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page2.waitForTimeout(4500)
        const arrivee = new URL(page2.url()).pathname
        dire(arrivee === attendu, 'depuis ' + depart.padEnd(16) + '-> ' + arrivee)
      }
      await page2.screenshot({ path: path.join(SORTIE, 'espace-partenaire-accueil.png'), fullPage: false })
    } finally { await page2.close() }
  } finally {
    await nav.close()
    /* ON REND SON IDENTITE, quoi qu il soit arrive : laisser un membre de l equipe rattache a un
       partenaire lui fermerait tout Kimatch sans qu il comprenne pourquoi. */
    await fetch(U + '/rest/v1/profils?id=eq.' + moi.id, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ compte_partenaire_id: rattachementOrigine }),
    })
    const remis = (await (await fetch(U + '/rest/v1/profils?id=eq.' + moi.id +
      '&select=compte_partenaire_id', { headers: H })).json())[0]
    console.log('')
    console.log('rattachement remis : ' + (remis.compte_partenaire_id === rattachementOrigine
      ? 'oui (' + (rattachementOrigine ?? 'aucun') + ')'
      : '*** A CORRIGER ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(echecs === 0 ? '  L ESPACE PARTENAIRE EST CONFORME' : '  *** ' + echecs + ' ECART(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(echecs === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
