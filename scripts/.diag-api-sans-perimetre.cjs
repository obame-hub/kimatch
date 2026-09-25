/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE `exigerSession` NE VÉRIFIE PAS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `exigerSession` répond à UNE question : « la session est-elle valide ? ». Un partenaire en a une.
 * Elle ne répond pas à la seconde : « cet utilisateur a-t-il le droit de demander CET objet ? ».
 *
 * Quand la fonction lit ensuite la base AU NOM de l'appelant, les policies répondent à sa place.
 * Quand elle appelle directement un service externe avec les identifiants de KiWee, rien ne répond.
 *
 * On ne conclut pas sur la lecture du code : on APPELLE le handler avec un jeton de partenaire, en
 * court-circuitant le serveur local (panne Node 20 / WebSocket sans rapport avec la sécurité).
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
const BASE = 'http://localhost:5184'
const MAIL = 'zzz.perimetre@kiwee-energie.invalid'
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
      await a('comptes?nom=like.ZZZ PERIMETRE*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ PERIMETRE', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'P', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'P', contact_id: cree.ct, role_acces_id: rp,
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

    const ep = await (await fetch(U + '/rest/v1/rpc/est_partenaire', {
      method: 'POST',
      headers: { apikey: env('VITE_SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: '{}',
    })).text()
    console.log('')
    console.log('   est_partenaire() : ' + ep.trim())
    if (ep.trim() !== 'true') throw new Error('non rattaché : rien ne serait prouvé.')

    // ── ON REFAIT CE QUE FAIT `exigerSession`, SANS LE CLIENT SUPABASE ──
    //
    // Le client v2 exige Node 22 et tombe ici sur « native WebSocket not found ». C'est une panne
    // d'outil, pas une barrière de sécurité : `auth.getUser()` interroge `GET /auth/v1/user` avec
    // la clé anonyme et le jeton. On pose donc la même question par le même chemin.
    const rep = await fetch(U + '/auth/v1/user', {
      headers: { apikey: env('VITE_SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + jeton },
    })
    const corps = await rep.json()
    const data = { user: rep.ok ? corps : null }
    const error = rep.ok ? null : { message: 'HTTP ' + rep.status + ' ' + JSON.stringify(corps).slice(0, 80) }

    console.log('')
    console.log('══ CE QUE `exigerSession` REPOND A CE PARTENAIRE ══')
    console.log('')
    if (error || !data.user) {
      console.log('   REFUSE : ' + (error ? error.message : 'pas d utilisateur'))
      console.log('')
      console.log('   -> les points d entree qui n appellent QUE `exigerSession` sont hors de portee.')
    } else {
      console.log('   ACCEPTE : ' + data.user.email + '  (id ' + data.user.id.slice(0, 8) + ')')
      console.log('')
      console.log('   -> `exigerSession` laisse donc passer un partenaire externe, comme un commercial.')
      console.log('      Ce qui protege ensuite depend de CHAQUE point d entree :')
      console.log('')
      console.log('        · lit la base au nom de l appelant  -> les policies repondent, il ne voit rien')
      console.log('        · appelle un service externe avec les identifiants de KiWee -> RIEN ne repond')
      console.log('')
      console.log('══ LES POINTS D ENTREE QUI N APPELLENT QUE `exigerSession` ══')
      console.log('')
      for (const f of ['api/ellisphere/search.ts', 'api/ellisphere/score.ts', 'api/enedis/fetch-elec.ts',
        'api/grd/fetch-gaz.ts', 'api/slack/channels.ts', 'api/ocr/extract-document.ts',
        'api/cockpit/conseil.ts']) {
        const src = fs.readFileSync(f, 'utf8')
        // Consulte-t-il la base, d'une façon ou d'une autre, après la session ?
        const lit = /\.from\(|\.rpc\(|createClient/.test(src.slice(src.indexOf('exigerSession')))
        console.log('   ' + (lit ? '  lit la base  ' : ' NE LIT RIEN   ') + ' | ' + f)
      }
    }
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
