/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ÉCRAN DES CLÉS D'API, À L'ÉCRAN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * On émet une clé depuis l'interface, on la copie, on s'en sert pour appeler l'API, puis on la
 * révoque et l'on vérifie qu'elle ne vaut plus.
 *
 * LE POINT LE PLUS IMPORTANT : la clé affichée doit RÉELLEMENT ouvrir l'API. Un écran qui montre
 * une clé que le serveur ne reconnaît pas serait la pire des pannes — on la transmettrait au
 * partenaire, et l'échec n'apparaîtrait que chez lui.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const { connecter } = require('./.session-locale.cjs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

let soucis = 0
const dire = (ok, texte, detail) => {
  if (!ok) soucis++
  console.log('   ' + (ok ? '  ok   ' : ' SOUCI ') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}
const a = (chemin, m, b) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: m || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: b ? JSON.stringify(b) : undefined,
  })

;(async () => {
  const cree = {}
  const nav = await chromium.launch({ headless: true })
  try {
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    await a('comptes?nom=like.ZZZ ECRAN*', 'DELETE')

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ ECRAN PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id

    // ── UN ADMINISTRATEUR : l'écran n'est ouvert qu'à eux ──
    const admin = (await (await a(
      'profils?select=email,profils_roles_acces(roles_acces(ouvre_administration))' +
      '&actif=eq.true&email=like.*@kiwee-energie.fr&limit=40')).json())
      .find((p) => (p.profils_roles_acces ?? []).some((r) => r.roles_acces?.ouvre_administration))

    if (!admin) throw new Error('aucun administrateur actif trouvé')

    const page = await nav.newPage()
    await connecter(page, admin.email, BASE)
    await page.goto(BASE + '/administration', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3500)

    console.log('')
    console.log('   connecte : ' + admin.email + ' (administrateur)')
    console.log('')
    console.log('══ L ECRAN ══')

    const onglet = page.getByRole('button', { name: /API partenaires/i }).first()
    dire(await onglet.count() > 0, 'l onglet « API partenaires » existe')
    await onglet.click({ timeout: 20000 })
    await page.waitForTimeout(2500)

    // ── ÉMETTRE ──
    const listes = page.locator('select')
    await listes.first().selectOption({ label: 'ZZZ ECRAN PARTENAIRE' })
    await page.waitForTimeout(600)
    dire(true, 'le partenaire se choisit dans la liste')

    const nomCle = page.getByPlaceholder(/export mensuel/i).first()
    dire(await nomCle.count() > 0, 'le champ « a quoi elle sert » est la')
    await nomCle.click()
    await page.keyboard.type('ZZZ essai ecran', { delay: 20 })
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /^[ÉE]mettre$/i }).first().click({ timeout: 20000 })
    await page.waitForTimeout(3500)

    // ── LA CLÉ S'AFFICHE, UNE FOIS ──
    const bloc = page.locator('code').first()
    const affichee = await bloc.count() > 0 ? (await bloc.innerText()).trim() : ''
    dire(affichee.startsWith('kw_') && affichee.length > 30,
      'la cle s affiche en clair', affichee ? affichee.slice(0, 14) + '…' : '*** rien ***')

    const avertissement = await page.getByText(/ne s.affichera plus jamais/i).count()
    dire(avertissement > 0, 'l ecran previent qu elle ne reviendra pas')

    // ── ELLE OUVRE VRAIMENT L'API ──
    console.log('')
    console.log('══ LA CLE OUVRE-T-ELLE L API ? ══')
    const r = await fetch(BASE + '/api/partenaire/patrimoine', {
      headers: { Authorization: 'Bearer ' + affichee },
    })
    const corps = r.ok ? await r.json() : null
    dire(r.status === 200, 'l API repond a cette cle', 'HTTP ' + r.status)
    dire(corps && Array.isArray(corps.comptes) && corps.comptes.length === 1,
      'elle rend le compte du partenaire, et lui seul',
      corps ? (corps.comptes ?? []).length + ' compte(s)' : 'aucune reponse')

    // ── LA LISTE LA MONTRE, SANS LA RÉVÉLER ──
    console.log('')
    console.log('══ CE QUE LA LISTE MONTRE ══')
    const prefixe = affichee.slice(0, 11)
    const vuDansListe = await page.getByText(prefixe, { exact: false }).count()
    dire(vuDansListe > 0, 'la cle apparait dans la liste par son prefixe', prefixe + '…')

    const enClairDeuxFois = await page.getByText(affichee, { exact: false }).count()
    dire(enClairDeuxFois <= 1, 'elle n est PAS reaffichee en entier dans la liste',
      enClairDeuxFois <= 1 ? 'seulement dans le bandeau' : '*** affichee ' + enClairDeuxFois + ' fois ***')

    // ── RÉVOQUER ──
    console.log('')
    console.log('══ LA REVOCATION ══')
    await page.getByRole('button', { name: /r[ée]voquer/i }).first().click({ timeout: 20000 })
    await page.waitForTimeout(3000)

    const apres = await fetch(BASE + '/api/partenaire/patrimoine', {
      headers: { Authorization: 'Bearer ' + affichee },
    })
    dire(apres.status === 401, 'la cle revoquee ne vaut plus', 'HTTP ' + apres.status)

    const trace = (await (await a(
      'cles_api_partenaires?libelle=like.ZZZ*&select=revoquee_le,actif')).json())[0]
    dire(Boolean(trace && trace.revoquee_le) && trace.actif === false,
      'la trace est gardee (on sait qu elle a existe, et depuis quand)',
      trace ? 'revoquee le ' + String(trace.revoquee_le).slice(0, 10) : '*** ligne supprimee ***')
  } finally {
    await nav.close()
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    const reste = (await (await a('comptes?nom=like.ZZZ ECRAN*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  L ECRAN EMET UNE CLE QUI MARCHE, ET LA REVOQUE'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
