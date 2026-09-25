/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE GARDE `refuserLesPartenaires`, ÉPROUVÉ DES DEUX CÔTÉS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le risque est des deux côtés, et le second se verrait dans l'heure : fermer trop, et un
 * commercial ne peut plus relever un compteur Enedis ni chercher une entreprise chez Ellisphere.
 *
 * On appelle donc le garde AVEC DEUX JETONS — un partenaire, un commercial — et l'on exige qu'il
 * réponde différemment. Un garde qui refuse tout le monde passerait un test qui ne regarde que les
 * partenaires.
 *
 * Le serveur local ne peut pas servir ces points d'entrée (le client Supabase v2 exige Node 22, et
 * cette machine est en 20 — panne d'outil, sans rapport avec la sécurité). On reproduit donc ce que
 * le garde fait, par le même chemin HTTP : `POST /rest/v1/rpc/est_partenaire` avec le jeton.
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
const MAIL = 'zzz.garde@kiwee-energie.invalid'
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

/** Exactement ce que fait `refuserLesPartenaires` dans `api/_auth.ts`. */
const refuse = async (jeton) => {
  const r = await fetch(U + '/rest/v1/rpc/est_partenaire', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!r.ok) return { refuse: true, code: 503, note: 'verification indisponible' }
  if ((await r.text()).trim() === 'true') return { refuse: true, code: 403, note: 'espace partenaire' }
  return { refuse: false, code: 200, note: 'laisse passer' }
}

const jetonDe = async (nav, mail) => {
  const page = await nav.newPage()
  const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: 'magiclink', email: mail, options: { redirect_to: BASE } }),
  })).json()
  await page.goto(lr.properties ? lr.properties.action_link : lr.action_link,
    { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const ref = new URL(U).hostname.split('.')[0]
  const brut = await page.evaluate((x) => localStorage.getItem(x), 'sb-' + ref + '-auth-token')
  await page.close()
  if (!brut) throw new Error('aucune session obtenue pour ' + mail)
  return JSON.parse(brut).access_token
}

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
      await a('comptes?nom=like.ZZZ GARDE*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ GARDE', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'G', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'G', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id
    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    if (!u.id) throw new Error('utilisateur refusé : ' + JSON.stringify(u).slice(0, 160))
    cree.user = u.id

    console.log('')
    console.log('══ LE GARDE, AVEC DEUX JETONS ══')
    console.log('')

    // ① LE PARTENAIRE DOIT ÊTRE REFUSÉ.
    const jp = await jetonDe(nav, MAIL)
    const rp2 = await refuse(jp)
    dire(rp2.refuse && rp2.code === 403, 'un partenaire est refuse', 'HTTP ' + rp2.code + ' (' + rp2.note + ')')

    // ② UN COMMERCIAL DOIT PASSER. Sans cela, on aurait coupe Enedis et Ellisphere a l equipe.
    const co = (await (await a("profils?email=like.*@kiwee-energie.fr&actif=eq.true&select=email&limit=1")).json())[0]
    const jc = await jetonDe(nav, co.email)
    const rc = await refuse(jc)
    dire(!rc.refuse, 'un commercial passe (' + co.email + ')', 'HTTP ' + rc.code + ' (' + rc.note + ')')

    // ③ LE GARDE DOIT DISTINGUER. Un garde qui refuse tout le monde passerait le test ①.
    dire(rp2.refuse !== rc.refuse, 'le garde distingue les deux',
      'partenaire ' + rp2.code + ' / commercial ' + rc.code)
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
    const reste = (await (await a('comptes?nom=like.ZZZ GARDE*&select=id')).json()).length
      + (await (await a('profils?email=eq.' + MAIL + '&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LE GARDE FERME AUX PARTENAIRES, ET LAISSE TRAVAILLER L EQUIPE'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
