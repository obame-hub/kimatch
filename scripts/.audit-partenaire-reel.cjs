/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UN VRAI PARTENAIRE, UNE VRAIE SESSION, ET ON CHERCHE LA FAILLE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « cree toi un compte et contact de test que tu supprimeras plus tard,
 * essaie de te connecter et teste en boucle jusqu'a que tu ne trouves plus aucune faille ».
 *
 * ══ POURQUOI LES ESSAIS PRECEDENTS NE SUFFISAIENT PAS ══
 *
 * Ils empruntaient MON profil en lui posant `compte_partenaire_id` le temps du test. C'est proche,
 * mais ce n'est pas la meme chose : mon profil porte le role ADMIN, mes consultations recentes, et
 * il a ete cree par un autre chemin. Un vrai utilisateur partenaire naît par `handle_new_user`,
 * avec le role PARTENAIRE, un historique vide, et le rattachement pose par le declencheur.
 *
 * Ici on cree donc le parcours ENTIER : compte partenaire, contact, acces autorise, utilisateur
 * d'authentification, premiere connexion. Puis on attaque avec SON jeton.
 *
 * ══ CE QU'ON CHERCHE ══
 *
 * Pas « est-ce que l'ecran est joli » : est-ce qu'il peut LIRE ou ECRIRE quelque chose de KiWee.
 * On interroge l'API directement — un ecran cache ne protege rien, la requete se poste depuis la
 * console du navigateur.
 *
 * ══ TOUT EST EFFACE A LA FIN ══
 *
 * Y compris en cas d'echec : le `finally` demonte le compte d'authentification, le profil, l'acces,
 * le contact et les comptes. Un controle final le verifie et le dit.
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
const ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const MAIL = 'zzz.essai.partenaire@kiwee-energie.invalid'
const TYPE_PARTENAIRE = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

let failles = 0
const dire = (ok, texte, detail) => {
  if (!ok) failles++
  console.log('   ' + (ok ? '  ok   ' : ' FAILLE') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}

const admin = (chemin, methode, corps) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: methode || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: corps ? JSON.stringify(corps) : undefined,
  })

/** Une requete avec le jeton du partenaire : ce que ferait sa console. */
async function sien(jeton, chemin, methode, corps) {
  const r = await fetch(U + '/rest/v1/' + chemin, {
    method: methode || 'GET',
    headers: {
      apikey: ANON, Authorization: 'Bearer ' + jeton,
      'Content-Type': 'application/json', Prefer: 'return=representation,count=exact',
    },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* pas du JSON */ }
  const cr = r.headers.get('content-range')
  return {
    statut: r.status,
    texte: t.slice(0, 160),
    lignes: Array.isArray(j) ? j.length : null,
    total: cr ? Number((cr.split('/')[1] || '0')) : null,
  }
}

;(async () => {
  const cree = { user: null, profil: null, autorise: null, contact: null, partenaire: null, client: null }
  const nav = await chromium.launch({ headless: true })

  try {
    console.log('')
    console.log('══ ON MONTE LE PARCOURS ENTIER ══')

    // ① Le compte partenaire
    cree.partenaire = (await (await admin('comptes', 'POST', {
      nom: 'ZZZ ESSAI PARTENAIRE', type_compte_id: TYPE_PARTENAIRE,
    })).json())[0].id
    console.log('   1. compte partenaire cree')

    // ② Son contact, avec l'adresse
    cree.contact = (await (await admin('contacts', 'POST', {
      nom: 'ESSAI', prenom: 'Partenaire', email: MAIL, compte_id: cree.partenaire, actif: true,
    })).json())[0].id
    console.log('   2. contact cree')

    // ③ L'acces, par le chemin de l'ecran : on passe le contact, la base recopie l'adresse
    const rolePartenaire = (await (await admin('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    const acc = await admin('profils_autorises', 'POST', {
      email: 'peu-importe@exemple.invalid', prenom: 'Partenaire', nom: 'ESSAI',
      contact_id: cree.contact, role_acces_id: rolePartenaire,
    })
    const accJson = await acc.json()
    if (!accJson[0]) throw new Error('acces refuse : ' + JSON.stringify(accJson).slice(0, 200))
    cree.autorise = accJson[0].id
    dire(accJson[0].email === MAIL, 'l adresse autorisee est recopiee du contact', accJson[0].email)

    // ④ L'utilisateur d'authentification — c'est `handle_new_user` qui cree le profil
    const u = await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })
    const uj = await u.json()
    if (!uj.id) throw new Error('utilisateur non cree : ' + JSON.stringify(uj).slice(0, 200))
    cree.user = uj.id
    cree.profil = uj.id
    console.log('   3. utilisateur cree, profil pose par le declencheur')

    // ⑤ Son rattachement a-t-il ete pose automatiquement ?
    const prof = (await (await admin('profils?id=eq.' + cree.profil +
      '&select=compte_partenaire_id,role:profils_roles_acces(role_acces:roles_acces(code))')).json())[0]
    dire(prof.compte_partenaire_id === cree.partenaire,
      'le rattachement au partenaire est pose a la creation du profil',
      prof.compte_partenaire_id ? 'oui' : 'NON — il verrait toute la base')

    // ⑥ Un compte client a lui, pour qu'il ait quelque chose a voir
    const typeClient = (await (await admin('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    cree.client = (await (await admin('comptes', 'POST', {
      nom: 'ZZZ CLIENT DU PARTENAIRE', type_compte_id: typeClient,
      apporteur_partenaire_id: cree.partenaire,
    })).json())[0].id
    console.log('   4. un compte client lui est rattache')

    // ⑦ Sa session, par le vrai chemin
    const page = await nav.newPage({ viewport: { width: 1400, height: 1000 } })
    const lr = await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: MAIL, options: { redirect_to: BASE } }),
    })
    const lj = await lr.json()
    const lien = lj.properties ? lj.properties.action_link : lj.action_link
    if (!lien) throw new Error('pas de lien de connexion')
    await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)
    const ref = new URL(U).hostname.split('.')[0]
    const cs = 'sb-' + ref + '-auth-token'
    const brut = await page.evaluate((x) => localStorage.getItem(x), cs)
    if (!brut) throw new Error('pas de session : la connexion a echoue')
    const jeton = JSON.parse(brut).access_token
    console.log('   5. connecte')

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ CE QU IL PEUT LIRE ══')

    const totaux = {}
    for (const t of ['comptes', 'contacts', 'sites', 'compteurs', 'mandats', 'contrats',
      'recommandations', 'interactions', 'pistes', 'opportunites', 'profils']) {
      const tot = await admin(t + '?select=id&limit=1')
      totaux[t] = Number(((await tot.headers.get('content-range')) || '/0').split('/')[1] || 0)
    }
    // Le total exact demande l'en-tete count : on le relit proprement.
    for (const t of Object.keys(totaux)) {
      const r = await fetch(U + '/rest/v1/' + t + '?select=id&limit=1',
        { headers: Object.assign({}, H, { Prefer: 'count=exact' }) })
      totaux[t] = Number(((r.headers.get('content-range') || '/0').split('/')[1]) || 0)
    }

    // Ce qu'il DOIT voir : son compte partenaire + son client = 2 comptes, 1 contact (le sien).
    const attendus = {
      comptes: 2, contacts: 1, pistes: 0, opportunites: 0, profils: 1,
    }
    for (const [t, total] of Object.entries(totaux)) {
      const r = await sien(jeton, t + '?select=id&limit=1')
      const vu = r.total ?? 0
      if (t in attendus) {
        dire(vu === attendus[t], t.padEnd(16) + 'voit ' + vu + ' sur ' + total + ' (attendu ' + attendus[t] + ')')
      } else {
        // Les tables filles : il ne doit voir que ce qui pend de SES comptes, donc 0 pour l'instant.
        dire(vu === 0, t.padEnd(16) + 'voit ' + vu + ' sur ' + total + ' (attendu 0 : il n a rien cree)')
      }
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ CE QU IL POURRAIT TENTER ══')

    // Voler un compte : se designer apporteur d'un compte qui ne l'est pas.
    const autreCompte = (await (await admin('comptes?select=id&apporteur_partenaire_id=is.null&limit=1')).json())[0]
    const vol = await sien(jeton, 'comptes?id=eq.' + autreCompte.id, 'PATCH',
      { apporteur_partenaire_id: cree.partenaire })
    dire((vol.lignes ?? 0) === 0, 's approprier un compte de KiWee est refuse', 'HTTP ' + vol.statut)

    // Se donner l'administration.
    const roleAdmin = (await (await admin('roles_acces?code=eq.ADMIN&select=id')).json())[0].id
    const elev = await sien(jeton, 'profils_roles_acces', 'POST',
      { profil_id: cree.profil, role_acces_id: roleAdmin })
    dire((elev.lignes ?? 0) === 0, 's accorder le role ADMIN est refuse', 'HTTP ' + elev.statut)


    // Lire les roles et les acces autorises.
    const roles = await sien(jeton, 'roles_acces?select=id&limit=1')
    dire((roles.total ?? 0) === 0 || roles.statut >= 400,
      'lire la table des roles est refuse', 'HTTP ' + roles.statut + ', ' + (roles.total ?? 0) + ' lignes')
    const accesAutorises = await sien(jeton, 'profils_autorises?select=id&limit=1')
    dire((accesAutorises.total ?? 0) === 0 || accesAutorises.statut >= 400,
      'lire les acces autorises est refuse', 'HTTP ' + accesAutorises.statut + ', ' + (accesAutorises.total ?? 0) + ' lignes')

    // Les vues — la faille trouvee cet apres-midi.
    for (const v of ['v_comptes_liste', 'v_recommandations_liste', 'v_contacts_liste',
      'v_compteurs_liste', 'v_contrats_liste', 'v_mandats_liste', 'v_patrimoine_synthese',
      'v_vivier_cockpit', 'v_echeances_a_traiter', 'v_suivis_contrats_liste']) {
      const r = await sien(jeton, v + '?select=*&limit=1')
      const vu = r.total ?? (r.lignes ?? 0)
      const ok = r.statut >= 400 || vu <= 2
      dire(ok, ('la vue ' + v).padEnd(40) + 'rend ' + vu, r.statut >= 400 ? 'refusee' : '')
    }

    /* ON TESTE LE DETACHEMENT EN DERNIER, et c est la lecon du premier passage : place avant les
       vues, un detachement REUSSI faisait tout tomber apres lui — l audit annoncait douze failles
       la ou il n y en avait qu une. Un essai qui salit son propre terrain accuse a tort. */
    // Se detacher de son partenaire pour tout voir.
    const detache = await sien(jeton, 'profils?id=eq.' + cree.profil, 'PATCH',
      { compte_partenaire_id: null })
    const apresDetache = (await (await admin('profils?id=eq.' + cree.profil +
      '&select=compte_partenaire_id')).json())[0]
    dire(apresDetache.compte_partenaire_id === cree.partenaire,
      'se detacher de son partenaire est refuse', 'HTTP ' + detache.statut)

    // Les fonctions.
    const rpc = await fetch(U + '/rest/v1/rpc/peut_administrer', {
      method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const rpcT = await rpc.text()
    dire(rpcT.trim() === 'false', 'peut_administrer() rend faux pour lui', rpcT.slice(0, 40))

    await page.screenshot({ path: path.join(SORTIE, 'audit-partenaire.png'), fullPage: false })
    await page.close()
  } finally {
    await nav.close()
    console.log('')
    console.log('══ NETTOYAGE ══')
    if (cree.client) await admin('comptes?id=eq.' + cree.client, 'DELETE')
    if (cree.autorise) await admin('profils_autorises?id=eq.' + cree.autorise, 'DELETE')
    if (cree.contact) await admin('contacts?id=eq.' + cree.contact, 'DELETE')
    if (cree.profil) {
      await admin('profils_roles_acces?profil_id=eq.' + cree.profil, 'DELETE')
      await admin('profils_organisations?profil_id=eq.' + cree.profil, 'DELETE')
      await admin('profils?id=eq.' + cree.profil, 'DELETE')
    }
    if (cree.partenaire) await admin('comptes?id=eq.' + cree.partenaire, 'DELETE')
    if (cree.user) {
      await fetch(U + '/auth/v1/admin/users/' + cree.user, {
        method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
      })
    }
    // On verifie que rien ne subsiste, plutot que de l'affirmer.
    const reste = []
    for (const [quoi, chemin] of [
      ['compte partenaire', 'comptes?nom=like.ZZZ ESSAI*&select=id'],
      ['compte client', 'comptes?nom=like.ZZZ CLIENT*&select=id'],
      ['contact', 'contacts?email=eq.' + MAIL + '&select=id'],
      ['acces autorise', 'profils_autorises?email=eq.' + MAIL + '&select=id'],
      ['profil', 'profils?email=eq.' + MAIL + '&select=id'],
    ]) {
      const n = (await (await admin(chemin)).json()).length
      if (n > 0) reste.push(quoi + ' (' + n + ')')
    }
    console.log('   ' + (reste.length === 0 ? 'tout est efface.' : '*** SUBSISTE : ' + reste.join(', ') + ' ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(failles === 0 ? '  AUCUNE FAILLE TROUVEE' : '  *** ' + failles + ' FAILLE(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(failles === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
