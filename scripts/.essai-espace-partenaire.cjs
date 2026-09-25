/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'UN PARTENAIRE VOIT EN SE CONNECTANT À KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 24/09/2026 : « il n'est pas censé voir ni cockpit ni piste […] affiche seulement ce dont
 * il a besoin et spécifie quelque part qu'on est sur l'espace partenaire ».
 *
 * On se connecte avec un vrai compte partenaire et l'on regarde :
 *
 *   ① le rail ne montre que ce qui le concerne
 *   ② l'écran DIT qu'on est dans l'espace partenaire
 *   ③ taper une URL interdite à la main ne mène nulle part
 *   ④ son patrimoine lui est bien montré
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
const MAIL = 'zzz.espace@kiwee-energie.invalid'
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
    {
      const p = (await (await a('profils?email=eq.' + MAIL + '&select=id')).json())[0]
      if (p && p.id) {
        await a('profils_roles_acces?profil_id=eq.' + p.id, 'DELETE')
        await a('historiques_entites?auteur_profil_id=eq.' + p.id, 'DELETE')
        await a('profils?id=eq.' + p.id, 'DELETE')
        await fetch(U + '/auth/v1/admin/users/' + p.id, {
          method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
        })
      }
      await a('profils_autorises?email=eq.' + MAIL, 'DELETE')
      await a('contacts?email=eq.' + MAIL, 'DELETE')
      await a('sites?nom=like.ZZZ ESPACE*', 'DELETE')
      await a('comptes?nom=like.ZZZ ESPACE*', 'DELETE')
    }

    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ ESPACE PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id
    cree.client = (await (await a('comptes', 'POST', {
      nom: 'ZZZ ESPACE SON CLIENT', type_compte_id: TC, type_compte: 'client', actif: true,
      apporteur_partenaire_id: cree.part,
    })).json())[0].id
    cree.site = (await (await a('sites', 'POST', {
      nom: 'ZZZ ESPACE SITE', compte_id: cree.client,
    })).json())[0].id

    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'ESPACE', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'ESPACE', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id
    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: H, body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    if (!u.id) throw new Error('utilisateur refusé : ' + JSON.stringify(u).slice(0, 160))
    cree.user = u.id

    const page = await nav.newPage()
    await connecter(page, MAIL, BASE)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(4500)

    console.log('')
    console.log('   connecte : ' + MAIL)
    console.log('   arrive sur : ' + page.url().replace(BASE, ''))
    console.log('')
    console.log('══ ① CE QUE LE RAIL MONTRE ══')

    const rail = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav a, aside a'))
        .map((e) => e.textContent.trim())
        .filter((t) => t && t.length < 40))

    console.log('   ' + JSON.stringify(rail))

    for (const interdit of ['Cockpit', 'Pistes', 'Opportunités', 'Pricing', 'Requêtes', 'Suivis de contrats']) {
      dire(!rail.some((r) => r.includes(interdit)), interdit + ' n est pas dans le rail',
        rail.some((r) => r.includes(interdit)) ? '*** PRESENT ***' : 'absent')
    }
    dire(rail.some((r) => r.includes('recommandation') || r.includes('Recommandation')),
      'ses recommandations sont dans le rail')
    dire(rail.some((r) => r.includes('atrimoine')), 'son patrimoine est dans le rail')

    console.log('')
    console.log('══ ② L ECRAN DIT OU L ON EST ══')
    const texte = await page.evaluate(() => document.body.innerText)
    dire(/espace partenaire/i.test(texte), 'la mention « espace partenaire » est visible',
      /espace partenaire/i.test(texte) ? 'oui' : '*** absente ***')

    console.log('')
    console.log('══ ③ LES URL INTERDITES, TAPEES A LA MAIN ══')
    /* `/comptes`, `/contacts`, `/compteurs`, `/mandats` et `/contrats` sont VOLONTAIREMENT
       ouverts (`AppLayout.tsx`) : c'est ainsi qu'un partenaire ouvre la fiche d'un compte qu'il
       a apporte. Les policies bornent ce qu'il y voit. Ne sont interdits que les ecrans qui ne
       parlent que de KiWee. */
    for (const chemin of ['/cockpit', '/pistes', '/opportunites', '/administration', '/pricing']) {
      await page.goto(BASE + chemin, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(2500)
      const ou = page.url().replace(BASE, '')
      const reste = ou.startsWith(chemin)
      dire(!reste, chemin + ' ne s ouvre pas', reste ? '*** IL Y RESTE ***' : 'renvoye vers ' + ou)
    }

    console.log('')
    console.log('══ ④ SON PATRIMOINE ══')
    await page.goto(BASE + '/patrimoine', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(4000)
    /* LA PAGE S'OUVRE SUR « Synthese », pas sur la liste : c'est l'onglet Comptes qui porte les
       noms. Mon premier essai lisait la synthese et concluait a tort que l'ecran etait vide. */
    await page.getByRole('button', { name: 'Comptes', exact: true }).first().click({ timeout: 20000 })
    await page.waitForTimeout(4000)
    const pat = await page.evaluate(() => document.body.innerText)
    dire(pat.includes('ZZZ ESPACE SON CLIENT'), 'il voit le compte qu il a apporte',
      pat.includes('ZZZ ESPACE SON CLIENT') ? 'oui' : '*** absent de l ecran ***')
    dire(!pat.includes('CABINET') && !pat.includes('SDC '), 'il ne voit pas les comptes de KiWee',
      'aucun compte de KiWee a l ecran')
  } finally {
    await nav.close()
    if (cree.acc) await a('profils_autorises?id=eq.' + cree.acc, 'DELETE')
    if (cree.ct) await a('contacts?id=eq.' + cree.ct, 'DELETE')
    if (cree.user) {
      await a('profils_roles_acces?profil_id=eq.' + cree.user, 'DELETE')
      await a('historiques_entites?auteur_profil_id=eq.' + cree.user, 'DELETE')
      await a('profils?id=eq.' + cree.user, 'DELETE')
      await fetch(U + '/auth/v1/admin/users/' + cree.user, {
        method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
      })
    }
    if (cree.site) await a('sites?id=eq.' + cree.site, 'DELETE')
    if (cree.client) await a('comptes?id=eq.' + cree.client, 'DELETE')
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    const reste = (await (await a('comptes?nom=like.ZZZ ESPACE*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  L ESPACE PARTENAIRE NE MONTRE QUE CE QU IL DOIT'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
