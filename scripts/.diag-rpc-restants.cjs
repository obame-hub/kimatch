/**
 * LES TROIS FONCTIONS `security definer` QUE L'AUDIT DU 25/09 N'AVAIT PAS COUVERTES.
 *
 * `qui_appelle`, `fn_rattacher_appels`, `fn_ecarter_appels` : appelables depuis le front, elles
 * passent au-dessus des policies. On les appelle réellement, avec un jeton de partenaire, et l'on
 * regarde ce qui revient.
 *
 * AUCUNE ÉCRITURE SUR DE VRAIES DONNÉES : les deux qui modifient sont appelées avec des
 * identifiants inexistants. Si elles passent, c'est déjà la preuve qu'elles ne contrôlent rien —
 * sans qu'un client de KiWee en fasse les frais.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = 'http://localhost:5184'
const MAIL = 'zzz.rpc@kiwee-energie.invalid'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

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
      await a('comptes?nom=like.ZZZ RPC*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ RPC', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'R', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'R', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id
    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    if (!u.id) throw new Error('utilisateur refusé : ' + JSON.stringify(u).slice(0, 160))
    cree.user = u.id

    const page = await nav.newPage()
    const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: MAIL, options: { redirect_to: BASE } }),
    })).json()
    await page.goto(lr.properties ? lr.properties.action_link : lr.action_link,
      { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    const ref = new URL(U).hostname.split('.')[0]
    const jeton = JSON.parse(await page.evaluate((x) => localStorage.getItem(x), 'sb-' + ref + '-auth-token')).access_token
    await page.close()

    const rpc = async (nom, corps) => {
      const r = await fetch(U + '/rest/v1/rpc/' + nom, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
        body: JSON.stringify(corps || {}),
      })
      return { statut: r.status, texte: (await r.text()).slice(0, 200) }
    }

    const ep = await rpc('est_partenaire')
    console.log('')
    console.log('   est_partenaire() : ' + ep.texte.trim())
    if (ep.texte.trim() !== 'true') throw new Error('non rattaché : rien ne serait prouvé.')

    console.log('')
    console.log('══ LES TROIS FONCTIONS NON COUVERTES ══')
    console.log('')

    // ① `qui_appelle` : annuaire inversé sur tous les contacts de KiWee.
    const ct = (await (await a('contacts?telephone=not.is.null&select=telephone&limit=1')).json())[0]
    if (ct) {
      const r = await rpc('qui_appelle', { p_numero: ct.telephone })
      const rend = r.statut < 400 && r.texte !== '[]' && r.texte !== 'null' && r.texte.length > 6
      console.log('   ' + (rend ? ' FUITE ' : '  ok   ') + ' | qui_appelle sur un numero de KiWee' +
        '  — HTTP ' + r.statut + ' ' + r.texte.slice(0, 90))
    } else {
      console.log('     ?     | qui_appelle : aucun contact avec telephone pour l essayer')
    }

    // ② `fn_rattacher_appels` : sur un identifiant INEXISTANT, pour ne rien abimer.
    let r = await rpc('fn_rattacher_appels', {
      p_numero: '+33699999999',
      p_contact_id: '00000000-0000-0000-0000-000000000000',
    })
    console.log('   ' + (r.statut < 400 ? ' A VOIR ' : '  ok   ') + ' | fn_rattacher_appels' +
      '  — HTTP ' + r.statut + ' ' + r.texte.slice(0, 90))

    // ③ `fn_ecarter_appels` : sur un numero qui n'existe pas.
    r = await rpc('fn_ecarter_appels', { p_numero: '+33699999999' })
    console.log('   ' + (r.statut < 400 ? ' A VOIR ' : '  ok   ') + ' | fn_ecarter_appels' +
      '  — HTTP ' + r.statut + ' ' + r.texte.slice(0, 90))
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
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    console.log('')
    console.log('   nettoyage : fait')
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
