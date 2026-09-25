/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES POINTS D'ENTRÉE `api/`, APPELÉS AVEC UN JETON DE PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `exigerSession` vérifie qu'une session est valide. Un partenaire EN A UNE : elle le laisse donc
 * passer, exactement comme un commercial. Ce qui protège ensuite, c'est ce que la fonction fait de
 * son jeton — si elle lit la base AU NOM de l'appelant, les policies s'appliquent ; si elle prend
 * la clé de service, plus rien ne le retient.
 *
 * On ne lit donc pas le code : on APPELLE, avec le jeton d'un vrai partenaire, et on regarde ce qui
 * revient. Les services facturés à l'usage comptent autant que les données : Ellisphere et l'OCR
 * sont payés par KiWee.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
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
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const MAIL = 'zzz.api@kiwee-energie.invalid'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

let failles = 0
const dire = (ok, texte, detail) => {
  if (!ok) failles++
  console.log('   ' + (ok ? '  ok   ' : ' FAILLE') + ' | ' + texte + (detail ? '  — ' + detail : ''))
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
    // ── LES RESTES D'UN ESSAI PRÉCÉDENT ──
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
      await a('comptes?nom=like.ZZZ API*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ API PARTENAIRE', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'API', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    // L'ADRESSE DOIT ÊTRE CELLE DE LA CONNEXION, sinon aucun rattachement (cf. audit des fonctions).
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'API', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id

    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    if (!u.id) throw new Error('création de l utilisateur refusée : ' + JSON.stringify(u).slice(0, 200))
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

    // ON REFUSE DE CONTINUER SI LA BASE NE LE VOIT PAS COMME UN PARTENAIRE.
    const ep = await (await fetch(U + '/rest/v1/rpc/est_partenaire', {
      method: 'POST',
      headers: { apikey: env('VITE_SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: '{}',
    })).text()
    console.log('')
    console.log('   est_partenaire() : ' + ep.trim())
    if (ep.trim() !== 'true') {
      throw new Error('le compte d essai n est pas rattache : l audit ne testerait pas un partenaire.')
    }
    console.log('')
    console.log('══ CE QUE LES POINTS D ENTREE LUI RENDENT ══')

    const appel = async (chemin, methode, corps) => {
      const r = await fetch(BASE + chemin, {
        method: methode || 'GET',
        headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
        body: corps ? JSON.stringify(corps) : undefined,
      })
      return { statut: r.status, texte: (await r.text()).slice(0, 160) }
    }

    // ── ① LES SERVICES FACTURÉS À L'USAGE ──
    //
    // Ellisphere et l'OCR sont payés par KiWee à chaque appel. Un externe qui les atteint consomme
    // le budget, et Ellisphere rend en plus des données d'entreprise que KiWee achète.
    let r = await appel('/api/ellisphere/search?q=carrefour')
    dire(r.statut >= 400, 'ellisphere/search est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

    r = await appel('/api/ellisphere/score?siren=652014051')
    dire(r.statut >= 400, 'ellisphere/score est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

    // ── ② LES DONNÉES DE COMPTAGE D'UN TIERS ──
    //
    // Enedis et le GRD répondent avec le certificat de KiWee : le PDL demandé n'a aucun besoin
    // d'appartenir à l'appelant. C'est la fuite de données la plus large du lot.
    const pdl = (await (await a('compteurs?select=numero_point&limit=1')).json())[0]
    if (pdl) {
      r = await appel('/api/enedis/fetch-elec', 'POST', { pdl: pdl.numero_point })
      dire(r.statut >= 400, 'enedis/fetch-elec sur un PDL de KiWee est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

      r = await appel('/api/grd/fetch-gaz', 'POST', { pce: pdl.numero_point })
      dire(r.statut >= 400, 'grd/fetch-gaz sur un point de KiWee est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))
    }

    // ── ③ L'INTÉRIEUR DE KIWEE ──
    r = await appel('/api/slack/channels')
    dire(r.statut >= 400, 'slack/channels est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

    r = await appel('/api/cockpit/conseil', 'POST', {})
    dire(r.statut >= 400, 'cockpit/conseil est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

    // ── ④ L'ADMINISTRATION ──
    r = await appel('/api/admin/impersonate', 'POST', { email: 'w.goupil@kiwee-energie.fr' })
    dire(r.statut >= 400, 'admin/impersonate est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

    r = await appel('/api/admin/refresh-sandbox', 'POST', {})
    dire(r.statut >= 400, 'admin/refresh-sandbox est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))

    // ── ⑤ LES TÂCHES PLANIFIÉES : elles doivent tenir par leur secret, pas par l'obscurité ──
    for (const t of ['/api/mandats/expirer', '/api/signaux/echeances', '/api/gmail/rapatrier',
      '/api/comptes/photographier-qualite', '/api/contrats/reevaluer-statuts']) {
      r = await appel(t, 'POST', {})
      dire(r.statut >= 400, t.replace('/api/', '') + ' est refuse', 'HTTP ' + r.statut)
    }

    // ── ⑥ L'OCR : facturé à l'usage, et il lit ce qu'on lui donne ──
    r = await appel('/api/ocr/extract-document', 'POST', { mediaType: 'application/pdf', contenuBase64: 'JVBERi0=' })
    dire(r.statut >= 400, 'ocr/extract-document est refuse', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 60))
  } finally {
    await nav.close()
    if (cree.acc) await a('profils_autorises?id=eq.' + cree.acc, 'DELETE')
    if (cree.ct) await a('contacts?id=eq.' + cree.ct, 'DELETE')
    if (cree.user) {
      await a('profils_roles_acces?profil_id=eq.' + cree.user, 'DELETE')
      await a('profils_organisations?profil_id=eq.' + cree.user, 'DELETE')
      await a('historiques_entites?auteur_profil_id=eq.' + cree.user, 'DELETE')
      await a('profils?id=eq.' + cree.user, 'DELETE')
      await fetch(U + '/auth/v1/admin/users/' + cree.user, {
        method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
      })
    }
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    const reste = (await (await a('comptes?nom=like.ZZZ API*&select=id')).json()).length
      + (await (await a('profils?email=eq.' + MAIL + '&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' objet(s) restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(failles === 0 ? '  AUCUNE FAILLE PAR LES POINTS D ENTREE' : '  *** ' + failles + ' FAILLE(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(failles === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
