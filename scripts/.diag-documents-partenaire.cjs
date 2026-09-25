/**
 * MA PROPRE POLICY DU 24/09 SUFFIT-ELLE ?
 *
 *     create policy documents_read on storage.objects
 *       for select to authenticated using (bucket_id = 'documents');
 *
 * Elle a fermé Internet — c'est vérifié, HTTP 400 sans session. Mais elle ouvre à TOUT compte
 * connecté, et depuis l'espace partenaire des externes le sont. Aucune condition sur le
 * propriétaire du fichier.
 *
 * On ne relit pas la policy : on prend un jeton de partenaire, on énumère `storage.objects`, et
 * l'on demande une URL signée pour un mandat de KiWee. Puis on le télécharge.
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
const MAIL = 'zzz.docs@kiwee-energie.invalid'
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
      await a('comptes?nom=like.ZZZ DOCS*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ DOCS', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'D', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'D', contact_id: cree.ct, role_acces_id: rp,
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
      headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: '{}',
    })).text()
    console.log('')
    console.log('   est_partenaire() : ' + ep.trim())
    if (ep.trim() !== 'true') throw new Error('non rattaché : rien ne serait prouvé.')

    console.log('')
    console.log('══ ① PEUT-IL ENUMERER LES FICHIERS DE KIWEE ? ══')
    const liste = await fetch(U + '/storage/v1/object/list/documents', {
      method: 'POST',
      headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: 'mandats', limit: 5, sortBy: { column: 'name', order: 'asc' } }),
    })
    const fichiers = liste.ok ? await liste.json() : []
    console.log('   HTTP ' + liste.status + ' — ' + (Array.isArray(fichiers) ? fichiers.length : 0) + ' fichier(s) listé(s)')
    for (const f of (Array.isArray(fichiers) ? fichiers : []).slice(0, 3)) {
      console.log('      ' + String(f.name).slice(0, 70))
    }

    console.log('')
    console.log('══ ② PEUT-IL SIGNER ET TELECHARGER UN MANDAT DE KIWEE ? ══')
    // On prend un vrai document, par la clé de service, et on essaie de l'obtenir AVEC SON JETON.
    const doc = (await (await a(
      'documents?select=url,nom_fichier&url=not.is.null&limit=1')).json())[0]
    const MARQ = '/storage/v1/object/public/documents/'
    const chemin = decodeURIComponent(doc.url.slice(doc.url.indexOf(MARQ) + MARQ.length))
    console.log('   cible : ' + (doc.nom_fichier || '?').slice(0, 60))

    const sign = await fetch(U + '/storage/v1/object/sign/documents/' + encodeURI(chemin), {
      method: 'POST',
      headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    console.log('   signature : HTTP ' + sign.status)
    if (sign.ok) {
      const { signedURL } = await sign.json()
      const dl = await fetch(U + '/storage/v1' + signedURL)
      const taille = dl.ok ? (await dl.arrayBuffer()).byteLength : 0
      console.log('   telechargement : HTTP ' + dl.status + '  ' + (taille / 1024).toFixed(0) + ' Ko')
      console.log('')
      console.log(taille > 0
        ? '   *** FAILLE CONFIRMEE : un partenaire telecharge un document de KiWee ***'
        : '   la signature passe mais le fichier ne vient pas.')
    } else {
      console.log('')
      console.log('   refuse : la policy ne suffit pas a un partenaire.')
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
