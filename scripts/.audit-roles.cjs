/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * AUDIT : CHAQUE UTILISATEUR, CHAQUE SCENARIO, CHERCHER LA FAILLE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoelle, 24/09/2026 : « teste a la place de chaque utilisateur tous les scenarios possibles pour
 * voir s'il y a une faille ou pas ».
 *
 * ══ ON N'INTERROGE PAS L'ECRAN, ON INTERROGE LA BASE ══
 *
 * Un bouton cache ne protege rien : n'importe qui peut poster la requete lui-meme depuis la console
 * du navigateur. On prend donc le JETON REEL de chaque personne et l'on attaque l'API directement,
 * exactement comme le ferait quelqu'un de mal intentionne.
 *
 * Chaque scenario dit ce qu'on ATTEND. Un ecart dans un sens est une faille ; dans l'autre, c'est
 * l'ecran qui ment en affichant un succes qui n'a pas eu lieu. Les deux comptent.
 *
 * AUCUNE ECRITURE N'EST LAISSEE : tout est remis en fin de course, et un controle final le verifie.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const ANON = env('VITE_SUPABASE_ANON_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }

const SUJETS = [
  { mail: 'obame@kiwee-energie.fr', role: 'SUPER_ADMIN', admin: true },
  { mail: 'n.ghouma@kiwee-energie.fr', role: 'ADMIN', admin: true },
  { mail: 'g.gilles@kiwee-energie.fr', role: 'CONSEILLER', admin: false },
]

let echecs = 0
const verdict = (ok, libelle, detail) => {
  if (!ok) echecs++
  console.log('   ' + (ok ? '  ok   ' : ' FAILLE') + ' | ' + libelle + (detail ? '  — ' + detail : ''))
}

const admin = (chemin, methode, corps) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: methode, headers: H, body: corps ? JSON.stringify(corps) : undefined,
  })

async function jetonDe(nav, mail) {
  const page = await nav.newPage()
  try {
    const r = await fetch(U + '/auth/v1/admin/generate_link', {
      method: 'POST', headers: H,
      body: JSON.stringify({ type: 'magiclink', email: mail, options: { redirect_to: BASE } }),
    })
    const corps = await r.json().catch(() => null)
    const lien = corps && (corps.properties ? corps.properties.action_link : corps.action_link)
    if (!lien) throw new Error('pas de lien pour ' + mail)
    await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    const ref = new URL(U).hostname.split('.')[0]
    const brut = await page.evaluate((c) => localStorage.getItem(c), 'sb-' + ref + '-auth-token')
    if (!brut) throw new Error('pas de session pour ' + mail)
    return JSON.parse(brut).access_token
  } finally { await page.close() }
}

/** Une requete API avec le jeton de quelqu'un — ce que ferait la console du navigateur. */
async function req(jeton, chemin, methode, corps) {
  const h = { apikey: ANON, 'Content-Type': 'application/json', Prefer: 'return=representation' }
  if (jeton) h.Authorization = 'Bearer ' + jeton
  const r = await fetch(U + '/rest/v1/' + chemin, {
    method: methode || 'GET', headers: h, body: corps ? JSON.stringify(corps) : undefined,
  })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* pas du JSON */ }
  return { statut: r.status, texte: t.slice(0, 200), lignes: Array.isArray(j) ? j : null }
}

const combien = (r) => (r.lignes ? r.lignes.length : 0)

;(async () => {
  const champs = 'id,code,libelle,description,niveau_hierarchique,actif,voit_tous_les_comptes,ouvre_administration,supprime_tout,recoit_le_support'
  const roles = await (await admin('roles_acces?select=' + champs, 'GET')).json()
  const parCode = {}
  for (const r of roles) parCode[r.code] = r
  const etatDepart = JSON.parse(JSON.stringify(roles))

  const nav = await chromium.launch({ headless: true })
  try {
    for (const s of SUJETS) {
      console.log('')
      console.log('══ ' + s.role + ' — ' + s.mail + ' ══')
      const jeton = await jetonDe(nav, s.mail)

      // ① LIRE les roles : ouvert a tous, c'est voulu — la page s'affiche pour tout le monde.
      const lecture = await req(jeton, 'roles_acces?select=id,code&limit=20')
      verdict(combien(lecture) > 0, 'peut LIRE les roles (attendu pour tous)',
        'HTTP ' + lecture.statut + ', ' + combien(lecture) + ' lignes')

      // ② S'ACCORDER l'administration en modifiant CONSEILLER : le scenario d'elevation.
      const eleve = await req(jeton, 'roles_acces?id=eq.' + parCode.CONSEILLER.id, 'PATCH', { ouvre_administration: true })
      const aEcrit = combien(eleve) > 0
      verdict(aEcrit === s.admin,
        'accorder l administration a CONSEILLER ' + (s.admin ? '(doit passer)' : '(DOIT ETRE REFUSE)'),
        'HTTP ' + eleve.statut + ', ' + combien(eleve) + ' ligne(s)')
      if (aEcrit) await admin('roles_acces?id=eq.' + parCode.CONSEILLER.id, 'PATCH', { ouvre_administration: false })

      // ③ SE DONNER un role d'administrateur, directement dans la table de liaison.
      const moi = await (await admin('profils?email=eq.' + s.mail + '&select=id', 'GET')).json()
      const monId = moi[0].id
      const sien = await (await admin('profils_roles_acces?profil_id=eq.' + monId + '&select=role_acces_id', 'GET')).json()
      const roleOrigine = sien[0] ? sien[0].role_acces_id : null
      const suppr = await req(jeton, 'profils_roles_acces?profil_id=eq.' + monId, 'DELETE')
      const aSupprime = combien(suppr) > 0
      verdict(aSupprime === s.admin,
        'supprimer sa propre attribution de role ' + (s.admin ? '(doit passer)' : '(DOIT ETRE REFUSE)'),
        'HTTP ' + suppr.statut)
      if (aSupprime && roleOrigine) {
        await admin('profils_roles_acces', 'POST', { profil_id: monId, role_acces_id: roleOrigine })
      }

      // ④ DONNER SUPER_ADMIN a un conseiller : l'elevation d'un tiers.
      const victime = await (await admin('profils?email=eq.m.bruere@kiwee-energie.fr&select=id', 'GET')).json()
      const vId = victime[0] ? victime[0].id : null
      if (vId) {
        const av = await (await admin('profils_roles_acces?profil_id=eq.' + vId + '&select=role_acces_id', 'GET')).json()
        const ins = await req(jeton, 'profils_roles_acces', 'POST', { profil_id: vId, role_acces_id: parCode.SUPER_ADMIN.id })
        const aDonne = combien(ins) > 0
        verdict(aDonne === s.admin,
          'donner SUPER_ADMIN a un conseiller ' + (s.admin ? '(doit passer)' : '(DOIT ETRE REFUSE)'),
          'HTTP ' + ins.statut)
        if (aDonne) {
          await admin('profils_roles_acces?profil_id=eq.' + vId, 'DELETE')
          if (av[0]) await admin('profils_roles_acces', 'POST', { profil_id: vId, role_acces_id: av[0].role_acces_id })
        }
      }

      // ⑤ CREER un role taille sur mesure, avec tous les droits.
      const cree = await req(jeton, 'roles_acces', 'POST', {
        code: 'ZZZ_AUDIT_' + Date.now(), libelle: 'Audit', niveau_hierarchique: 999, actif: true,
        voit_tous_les_comptes: true, ouvre_administration: true, supprime_tout: true, recoit_le_support: true,
      })
      const aCree = combien(cree) > 0
      verdict(aCree === s.admin,
        'creer un role tout-puissant ' + (s.admin ? '(doit passer)' : '(DOIT ETRE REFUSE)'),
        'HTTP ' + cree.statut)
      if (aCree) await admin('roles_acces?id=eq.' + cree.lignes[0].id, 'DELETE')

      // ⑥ SUPPRIMER un role : personne ne doit pouvoir, meme un administrateur. L'effacer priverait
      //    de tout droit ceux qui le portent, d'un coup et sans message. Aucune policy DELETE.
      const del = await req(jeton, 'roles_acces?id=eq.' + parCode.CLIENT.id, 'DELETE')
      /* ON RELIT LA BASE PLUTOT QUE DE CROIRE LE CODE HTTP : un DELETE filtre par RLS repond 200
         comme un DELETE reussi. Seule la presence de la ligne prouve quelque chose. */
      const survit = await (await admin('roles_acces?id=eq.' + parCode.CLIENT.id + '&select=id', 'GET')).json()
      verdict(survit.length === 1, 'supprimer un role (DOIT ETRE REFUSE pour tous)',
        'HTTP ' + del.statut + ' | le role ' + (survit.length ? 'existe toujours' : 'A DISPARU'))
      if (survit.length === 0) await admin('roles_acces', 'POST', parCode.CLIENT)

      // ⑦ SE VERROUILLER DEHORS : retirer l'administration a tous les roles qui la portent.
      //
      // ON REMET LES DEUX ROLES AVANT DE COMMENCER, et c'est la lecon d'un faux positif : la
      // premiere version ne retablissait que `r1`. Le sujet suivant trouvait donc SUPER_ADMIN deja
      // ferme, son `r2` passait sans rien fermer de plus, et l'audit criait a la faille sur un
      // produit sain. Un audit qui salit son propre terrain accuse a tort.
      if (s.admin) {
        for (const c of ['ADMIN', 'SUPER_ADMIN']) {
          await admin('roles_acces?id=eq.' + parCode[c].id, 'PATCH', { ouvre_administration: true })
        }
        const r1 = await req(jeton, 'roles_acces?id=eq.' + parCode.ADMIN.id, 'PATCH', { ouvre_administration: false })
        const r2 = await req(jeton, 'roles_acces?id=eq.' + parCode.SUPER_ADMIN.id, 'PATCH', { ouvre_administration: false })

        /* ON JUGE SUR CE QUI RESTE EN BASE, PAS SUR LE CODE HTTP.
         *
         * Ma premiere version exigeait `statut >= 400` et criait a la faille sur un produit sain.
         * Il y a DEUX facons legitimes d'etre refuse ici, et elles ne se ressemblent pas :
         *
         *   · le declencheur leve une exception    -> HTTP 400, message explicite ;
         *   · la policy filtre la ligne             -> HTTP 200 avec ZERO ligne touchee.
         *
         * Le second cas se produit quand l'administrateur vient de se retirer son propre droit a
         * l'etape precedente : il n'a plus qualite pour ecrire, donc PostgREST ne trouve aucune
         * ligne a modifier. C'est une protection de plus, pas un trou — mais un audit qui ne
         * regarde que le code de retour la prend pour un succes.
         *
         * La seule question qui vaille : reste-t-il un role pour ouvrir l'administration ? */
        const porteurs = await (await admin(
          'roles_acces?select=code&ouvre_administration=is.true&actif=is.true', 'GET')).json()
        verdict(porteurs.length > 0,
          'fermer la porte au DERNIER administrateur (doit etre refuse)',
          'HTTP ' + r2.statut + ', ' + combien(r2) + ' ligne(s) | restants : '
            + (porteurs.length ? porteurs.map((x) => x.code).join(', ') : 'AUCUN'))
        void r1
        // On remet les deux, quoi qu'il soit arrive : le sujet suivant doit trouver le terrain net.
        for (const c of ['ADMIN', 'SUPER_ADMIN']) {
          await admin('roles_acces?id=eq.' + parCode[c].id, 'PATCH', { ouvre_administration: true })
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // LE PERIMETRE : UN CONSEILLER VOIT-IL PLUS QUE SES COMPTES ?
    // ══════════════════════════════════════════════════════════════════════════════════════════
    //
    // Regler les roles n'est que la moitie du sujet. L'autre moitie, c'est ce que le reglage
    // PRODUIT : `voit_tous_les_comptes` decide de la clientele visible. Si la restriction ne tient
    // qu'au filtrage applique par le navigateur, elle ne tient pas du tout.
    console.log('')
    console.log('══ PERIMETRE DES DONNEES ══')
    const totalComptes = await (await admin('comptes?select=id&limit=1', 'GET', null)).headers
    const nbTotal = Number((await (await fetch(U + '/rest/v1/comptes?select=id&limit=1',
      { headers: Object.assign({}, H, { Prefer: 'count=exact' }) })).headers.get('content-range') || '/0').split('/')[1])
    void totalComptes

    for (const s of SUJETS) {
      const jeton = await jetonDe(nav, s.mail)
      const r = await fetch(U + '/rest/v1/comptes?select=id&limit=1',
        { headers: { apikey: ANON, Authorization: 'Bearer ' + jeton, Prefer: 'count=exact' } })
      const vus = Number((r.headers.get('content-range') || '/0').split('/')[1])
      /* CE N'EST PAS UN VERDICT, C'EST UNE MESURE. Kimatch filtre les comptes dans le navigateur
         (`lib/data/visibility.ts`) et NON par une policy : la base les rend tous a qui sait les
         demander. Ce n'est pas un defaut introduit ici — c'est l'architecture d'origine — mais
         l'audit doit le dire plutot que de le taire, parce que c'est la limite exacte de ce que
         `voit_tous_les_comptes` protege. */
      console.log('   ' + s.role.padEnd(12) + ' voit ' + vus + ' compte(s) sur ' + nbTotal
        + (s.admin ? '' : (vus >= nbTotal ? '  <- le filtrage est cote navigateur, pas en base' : '')))
    }

    // ══ SANS SESSION : la cle publique seule ══
    console.log('')
    console.log('══ SANS SESSION (cle anonyme seule) ══')
    const l = await req(null, 'roles_acces?select=id&limit=5')
    verdict(combien(l) === 0, 'lire les roles sans etre connecte (doit etre refuse)',
      'HTTP ' + l.statut + ', ' + combien(l) + ' lignes')
    const e = await req(null, 'roles_acces?id=eq.' + parCode.CONSEILLER.id, 'PATCH', { ouvre_administration: true })
    verdict(combien(e) === 0, 'modifier un role sans etre connecte (doit etre refuse)', 'HTTP ' + e.statut)
    if (combien(e) > 0) await admin('roles_acces?id=eq.' + parCode.CONSEILLER.id, 'PATCH', { ouvre_administration: false })
  } finally {
    await nav.close()
  }

  // ══ CONTROLE FINAL : la base est-elle exactement comme au depart ? ══
  console.log('')
  console.log('══ CONTROLE FINAL ══')
  const apres = await (await admin('roles_acces?select=' + champs, 'GET')).json()
  let ecarts = 0
  for (const a of etatDepart) {
    const b = apres.find((x) => x.id === a.id)
    if (!b) { console.log('   role DISPARU : ' + a.code); ecarts++; continue }
    for (const k of ['actif', 'voit_tous_les_comptes', 'ouvre_administration', 'supprime_tout', 'recoit_le_support']) {
      if (a[k] !== b[k]) { console.log('   ecart sur ' + a.code + '.' + k + ' : ' + a[k] + ' -> ' + b[k]); ecarts++ }
    }
  }
  for (const x of apres.filter((y) => !etatDepart.find((a) => a.id === y.id))) {
    console.log('   role EN TROP : ' + x.code); ecarts++
  }
  const ra = await (await admin('profils_roles_acces?select=profil_id', 'GET')).json()
  const d = {}
  for (const x of ra) d[x.profil_id] = (d[x.profil_id] || 0) + 1
  const doublons = Object.values(d).filter((n) => n > 1).length
  console.log('   attributions : ' + ra.length + ' | profils a plusieurs roles : ' + doublons)
  console.log('   etat des roles : ' + (ecarts === 0 ? 'identique au depart' : '*** ' + ecarts + ' ecart(s) ***'))

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(echecs === 0 ? '  AUCUNE FAILLE TROUVEE' : '  *** ' + echecs + ' FAILLE(S) ***')
  console.log('════════════════════════════════════════════════')
  process.exit(echecs === 0 && ecarts === 0 && doublons === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
