/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES FONCTIONS `SECURITY DEFINER`, APPELEES A LA PLACE D'UN PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Elles passent au-dessus des policies : c'est leur raison d'etre, et c'est aussi le contournement
 * le plus discret. Une fonction appelable par `authenticated` qui agit sans verifier QUI l'appelle
 * annule tout le cloisonnement, sans qu'aucune policy ne soit en cause.
 *
 * Vingt-six sont appelables depuis l'API. On les essaie donc pour de vrai, avec le jeton d'un
 * partenaire, et l'on regarde ce qui passe.
 *
 * TOUT EST EFFACE A LA FIN, y compris en cas d'echec.
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
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const MAIL = 'zzz.fonctions@kiwee-energie.invalid'
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
    // ── ON EFFACE D'ABORD LES RESTES D'UN ESSAI PRÉCÉDENT ──
    //
    // Un audit interrompu laisse l'utilisateur d'authentification derrière lui, et la création
    // suivante échoue sur `email_exists`. L'API `admin/users` pagine et ne le remontait pas :
    // on va donc le chercher par son adresse, ce qui marche quel que soit son rang.
    {
      const p = (await (await a('profils?email=eq.' + MAIL + '&select=id')).json())[0]
      const id = p && p.id
      if (id) {
        await a('profils_roles_acces?profil_id=eq.' + id, 'DELETE')
        await a('historiques_entites?auteur_profil_id=eq.' + id, 'DELETE')
        await a('profils?id=eq.' + id, 'DELETE')
        await fetch(U + '/auth/v1/admin/users/' + id, {
          method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
        })
        console.log('   (restes d un essai precedent effaces)')
      }
      await a('profils_autorises?email=eq.' + MAIL, 'DELETE')
      await a('contacts?email=eq.' + MAIL, 'DELETE')
      await a('compteurs?numero_point=eq.99999999999999', 'DELETE')
      await a('sites?nom=like.ZZZ FN*', 'DELETE')
      await a('comptes?nom=like.ZZZ FN*', 'DELETE')
    }

    cree.part = (await (await a('comptes', 'POST', { nom: 'ZZZ FN PARTENAIRE', type_compte_id: TP })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'FN', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id
    const rp = (await (await a('roles_acces?code=eq.PARTENAIRE&select=id')).json())[0].id
    // L'ADRESSE DOIT ÊTRE LA MÊME QUE CELLE DE LA CONNEXION.
    //
    // `rattache_partenaire_a_la_connexion` rapproche `profils_autorises.email` de `profils.email`
    // par `lower(...) = lower(...)`. Une adresse d'autorisation différente de celle du magic link
    // ne rattache donc RIEN, `est_partenaire()` rend faux, et tout le reste de ce fichier teste un
    // utilisateur ordinaire en croyant tester un partenaire. C'est ce qui s'est produit le
    // 25/09/2026 : deux lignes « FAILLE » qui ne prouvaient rien.
    cree.acc = (await (await a('profils_autorises', 'POST', {
      email: MAIL, prenom: 'Z', nom: 'FN', contact_id: cree.ct, role_acces_id: rp,
    })).json())[0].id
    const u = await (await fetch(U + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MAIL, email_confirm: true }),
    })).json()
    // Sans ce contrôle, un échec ici (adresse déjà prise par un essai précédent, par exemple)
    // laisse `cree.user` indéfini et le script s'effondre vingt lignes plus loin sur un message
    // qui ne dit pas la cause.
    if (!u.id) throw new Error('création de l utilisateur refusée : ' + JSON.stringify(u).slice(0, 200))
    cree.user = u.id

    const page = await nav.newPage()
    const lr = await (await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: MAIL, options: { redirect_to: BASE } }),
    })).json()
    await page.goto(lr.properties ? lr.properties.action_link : lr.action_link, { waitUntil: 'domcontentloaded', timeout: 60000 })
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
      return { statut: r.status, texte: (await r.text()).slice(0, 120) }
    }

    // On verifie d abord que la base le reconnait comme partenaire : sans cela, tout le reste
    // teste un utilisateur ordinaire et ne prouve rien.
    // Le profil naît d'un déclencheur sur `auth.users` (`handle_new_user`), et le rattachement
    // d'un second (`rattache_partenaire_a_la_connexion`). Le lire dans la foulée peut tomber
    // avant. On lui laisse quelques essais plutôt que de conclure trop tôt.
    let prof = null
    for (let i = 0; i < 10 && !prof; i++) {
      prof = (await (await a('profils?id=eq.' + cree.user + '&select=compte_partenaire_id,email')).json())[0]
      if (!prof) await new Promise((r) => setTimeout(r, 500))
    }
    if (!prof) throw new Error('aucun profil créé pour ' + MAIL + ' : le déclencheur handle_new_user n a pas joué.')
    console.log('')
    console.log('   profil : ' + prof.email + ' | rattache a ' + (prof.compte_partenaire_id ? prof.compte_partenaire_id.slice(0,8) : '*** RIEN ***'))
    const ep = await rpc('est_partenaire')
    const pa = await rpc('peut_administrer')
    console.log('')
    console.log('   est_partenaire() : ' + ep.texte.trim() + '   peut_administrer() : ' + pa.texte.trim())

    // ON REFUSE DE CONTINUER SI LA BASE NE LE VOIT PAS COMME UN PARTENAIRE.
    //
    // Sans ce contrôle, un rattachement raté transforme tout l'audit en mesure d'un utilisateur
    // ordinaire : les refus qu'on observe ne sont plus ceux qu'on croit tester, et les passages
    // non plus. Mieux vaut un échec bruyant qu'un rapport rassurant qui ne prouve rien.
    if (ep.texte.trim() !== 'true') {
      throw new Error(
        'est_partenaire() rend ' + ep.texte.trim() + ' : le compte d essai n est pas rattache, ' +
        'l audit ne testerait pas un partenaire. Rien n a ete mesure.')
    }
    if (pa.texte.trim() !== 'false') {
      throw new Error('peut_administrer() rend vrai : ce compte d essai est administrateur, l audit ne prouverait rien.')
    }

    console.log('')
    console.log('══ CE QU IL PEUT APPELER ══')

    // LA CIBLE DU VOL EST UN LEURRE, PAS UN VRAI CLIENT.
    //
    // Le 25/09/2026, cet audit visait `sites?limit=1` — un site réel. Le garde n'existait pas
    // encore : deux sites et un compteur de vrais clients ont donc été DÉPLACÉS pour de bon vers
    // le compte d'essai, et il a fallu les retrouver par leurs mandats pour les remettre.
    //
    // Un test de sécurité doit pouvoir échouer sans abîmer la production. On fabrique donc un
    // compte « victime » avec son site et son compteur : si le garde cède, c'est le leurre qui
    // part, et il est effacé à la fin comme le reste.
    // Un compte CLIENT : c'est bien le patrimoine d'un client de KiWee qu'on essaie de voler.
    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    cree.victime = (await (await a('comptes', 'POST', { nom: 'ZZZ FN VICTIME', type_compte_id: TC })).json())[0].id
    cree.site = (await (await a('sites', 'POST', {
      nom: 'ZZZ FN SITE', compte_id: cree.victime,
    })).json())[0].id
    const TE = (await (await a('types_energies?select=id&limit=1')).json())[0].id
    const compteurCree = (await (await a('compteurs', 'POST', {
      numero_point: '99999999999999', compte_id: cree.victime, site_id: cree.site,
      type_energie_id: TE,
    })).json())[0]
    // On refuse de passer sous silence un leurre manquant : sans compteur, la ligne
    // `fn_rattacher_compteur` disparaît du rapport et son absence se lirait comme un succès.
    if (!compteurCree) throw new Error('le compteur leurre n a pas pu être créé : fn_rattacher_compteur ne serait pas testée.')
    cree.compteur = compteurCree.id

    const site = { id: cree.site }
    const compteur = cree.compteur ? { id: cree.compteur } : null
    const contact = (await (await a('contacts?email=not.eq.' + MAIL + '&select=id&limit=1')).json())[0]

    // ① LE SCHEMA. Une suppression de colonne ferait perdre des donnees a tout le monde.
    for (const [f, args] of [
      ['fn_champ_supprimer', { p_table: 'comptes', p_colonne: 'nom' }],
      ['fn_champ_renommer', { p_table: 'comptes', p_colonne: 'nom', p_nouveau: 'zzz' }],
      ['fn_champ_ajouter', { p_table: 'comptes', p_colonne: 'zzz_test', p_type: 'text', p_defaut: null }],
    ]) {
      const r = await rpc(f, args)
      dire(r.statut >= 400, f + ' est refuse', 'HTTP ' + r.statut + (r.statut < 400 ? ' ' + r.texte : ''))
    }

    // ② LA CORBEILLE.
    let r = await rpc('fn_vider_corbeille', { p_correlation_id: null, p_avant: new Date().toISOString() })
    dire(r.statut >= 400, 'fn_vider_corbeille est refuse', 'HTTP ' + r.statut)
    r = await rpc('fn_restaurer_suppression', { p_correlation_id: '00000000-0000-0000-0000-000000000000' })
    dire(r.statut >= 400, 'fn_restaurer_suppression est refuse', 'HTTP ' + r.statut)

    // ③ DEPLACER UN OBJET DE KIWEE VERS SON COMPTE : le vol le plus direct.
    if (site) {
      r = await rpc('fn_deplacer_site', { p_site_id: site.id, p_compte_destination_id: cree.part, p_motif: 'zzz' })
      dire(r.statut >= 400, 'fn_deplacer_site vers son compte est refuse', 'HTTP ' + r.statut + (r.statut < 400 ? ' ' + r.texte : ''))
    }
    if (compteur) {
      r = await rpc('fn_rattacher_compteur', { p_compteur_id: compteur.id, p_compte_destination_id: cree.part })
      dire(r.statut >= 400, 'fn_rattacher_compteur vers son compte est refuse', 'HTTP ' + r.statut + (r.statut < 400 ? ' ' + r.texte : ''))
    }

    // ④ LIRE PAR UNE FONCTION CE QUE LES POLICIES CACHENT.
    if (contact) {
      r = await rpc('fn_roles_contact', { p_contact_id: contact.id })
      dire(r.statut >= 400 || r.texte === '[]' || r.texte === 'null',
        'fn_roles_contact sur un contact de KiWee ne rend rien', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 40))
    }
    r = await rpc('fn_est_administrateur')
    dire(r.texte.trim() === 'false', 'fn_est_administrateur rend faux', r.texte.trim())

    // ⑤ AGIR AU NOM D UN COMMERCIAL.
    r = await rpc('ouvrir_appel_kimatch', { p_numero: '+33600000000', p_email_allo: 'w.goupil@kiwee-energie.fr' })
    const aCree = r.statut < 400 && r.texte !== '[]' && r.texte !== 'null'
    dire(!aCree, 'ouvrir_appel_kimatch au nom d un commercial ne cree rien', 'HTTP ' + r.statut + ' ' + r.texte.slice(0, 50))
    if (aCree) {
      // On efface ce que l essai aurait cree.
      await a('appels_en_cours?numero=eq.%2B33600000000', 'DELETE')
      await a('interactions?numero_correspondant=eq.%2B33600000000', 'DELETE')
    }
  } finally {
    await nav.close()
    if (cree.acc) await a('profils_autorises?id=eq.' + cree.acc, 'DELETE')
    if (cree.ct) await a('contacts?id=eq.' + cree.ct, 'DELETE')
    if (cree.user) {
      await a('profils_roles_acces?profil_id=eq.' + cree.user, 'DELETE')
      await a('profils_organisations?profil_id=eq.' + cree.user, 'DELETE')
      // `historiques_entites.auteur_profil_id` retient le profil : agir laisse des traces, et une
      // clé étrangère refuse la suppression tant qu'elles sont là (mesuré le 25/09/2026).
      await a('historiques_entites?auteur_profil_id=eq.' + cree.user, 'DELETE')
      await a('profils?id=eq.' + cree.user, 'DELETE')
      await fetch(U + '/auth/v1/admin/users/' + cree.user, {
        method: 'DELETE', headers: { apikey: K, Authorization: 'Bearer ' + K },
      })
    }
    // Le leurre s'efface du plus dépendant au moins dépendant. S'il a été volé, il porte
    // maintenant le compte partenaire : on l'efface quand même, c'est un objet à nous.
    if (cree.compteur) await a('compteurs?id=eq.' + cree.compteur, 'DELETE')
    if (cree.site) await a('sites?id=eq.' + cree.site, 'DELETE')
    if (cree.victime) await a('comptes?id=eq.' + cree.victime, 'DELETE')
    if (cree.part) await a('comptes?id=eq.' + cree.part, 'DELETE')
    const reste = (await (await a('comptes?nom=like.ZZZ FN*&select=id')).json()).length
      + (await (await a('sites?nom=like.ZZZ FN*&select=id')).json()).length
      + (await (await a('compteurs?numero_point=eq.99999999999999&select=id')).json()).length
      + (await (await a('profils?email=eq.' + MAIL + '&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' objet(s) restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(failles === 0 ? '  AUCUNE FAILLE PAR LES FONCTIONS' : '  *** ' + failles + ' FAILLE(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(failles === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
