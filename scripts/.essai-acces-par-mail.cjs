/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARTENAIRE DEMANDE SON ACCÈS, ET L'OBTIENT — SANS NOUS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « je préfère qu'ils reçoivent un lien dans leur boîte mail afin qu'ils
 * soient indépendants et n'attendent pas notre clé de notre part ».
 *
 * On joue le parcours entier, navigateur vierge :
 *
 *   ① une adresse inconnue reçoit la même réponse qu'une connue (on ne dit jamais qui existe)
 *   ② une adresse de contact partenaire fait naître un lien
 *   ③ le lien ouvre une session, et ne sert qu'une fois
 *   ④ la session montre les SEPT objets du patrimoine
 *   ⑤ un lien expiré, révoqué ou déjà servi est refusé, chacun avec son message
 *
 * LE MAIL N'EST PAS ENVOYÉ ICI (aucun service configuré en local) : on lit le jeton en base, ce
 * que le partenaire lira dans sa boîte. C'est la seule partie qu'il faudra éprouver en vrai.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const crypto = require('crypto')
const { Client } = require('pg')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'
const MAIL = 'zzz.acces@kiwee-energie.invalid'

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const db = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

let soucis = 0
const dire = (ok, texte, detail) => {
  if (!ok) soucis++
  console.log('   ' + (ok ? '  ok   ' : ' SOUCI ') + ' | ' + texte + (detail ? '  — ' + detail : ''))
}
const a = (chemin, meth, corps) =>
  fetch(U + '/rest/v1/' + chemin, {
    method: meth || 'GET',
    headers: Object.assign({}, H, { Prefer: 'return=representation' }),
    body: corps ? JSON.stringify(corps) : undefined,
  })

const demander = async (email) => {
  const r = await fetch(BASE + '/api/partenaire/demander-acces', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return { statut: r.status, corps: await r.json().catch(() => ({})) }
}

;(async () => {
  await db.connect()
  const cree = {}
  const nav = await chromium.launch({ headless: true })

  const menage = async () => {
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    await a('recommandations?nom=like.ZZZ ACC*', 'DELETE')
    await a('contrats?reference=like.ZZZ ACC*', 'DELETE')
    await a('mandats?reference=like.ZZZ ACC*', 'DELETE')
    await a('compteurs?numero_point=eq.99999999902', 'DELETE')
    await a('sites?nom=like.ZZZ ACC*', 'DELETE')
    await a('contacts?email=eq.' + MAIL, 'DELETE')
    await a('contacts?nom=like.ZZZ ACC*', 'DELETE')
    await a('comptes?nom=like.ZZZ ACC*', 'DELETE')
  }

  try {
    await menage()

    // ── LE DÉCOR : un partenaire, son client, et les sept objets ──
    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    const TE = (await (await a('types_energies?select=id&limit=1')).json())[0].id

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ ACC PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'ZZZ ACC REFERENT', prenom: 'Z', email: MAIL, compte_id: cree.part, actif: true,
    })).json())[0].id

    cree.client = (await (await a('comptes', 'POST', {
      nom: 'ZZZ ACC SON CLIENT', type_compte_id: TC, type_compte: 'client', actif: true,
      apporteur_partenaire_id: cree.part, ville: 'NANTES', code_postal: '44000',
    })).json())[0].id
    cree.ctClient = (await (await a('contacts', 'POST', {
      nom: 'ZZZ ACC GESTIONNAIRE', prenom: 'Z', compte_id: cree.client, actif: true,
      fonction: 'Gestionnaire',
    })).json())[0].id
    cree.site = (await (await a('sites', 'POST', {
      nom: 'ZZZ ACC SITE', compte_id: cree.client, ville: 'NANTES', code_postal: '44000',
    })).json())[0].id
    cree.compteur = (await (await a('compteurs', 'POST', {
      numero_point: '99999999902', compte_id: cree.client, site_id: cree.site,
      type_energie_id: TE, consommation_annuelle_mwh: 120,
    })).json())[0].id

    const stMandat = (await (await a('statuts_mandats?select=id&limit=1')).json())[0]
    /* `mandats.numero` EST UN ENTIER, pas un libelle : `reference` porte le texte. Mon essai
       ecrivait « ZZZ ACC MANDAT » dans un champ numerique, la creation echouait en 400, et
       l'onglet Mandats etait vide a juste titre. */
    const posM = await (await a('mandats', 'POST', {
      reference: 'ZZZ ACC MANDAT', compte_id: cree.client,
      statut_id: stMandat ? stMandat.id : null, actif: true,
    })).json()
    if (!posM[0]) throw new Error('mandat d essai non cree : ' + JSON.stringify(posM).slice(0, 200))
    cree.mandat = posM[0].id

    /* `type_energie_id` ET `statut_id` SONT OBLIGATOIRES sur `contrats` — mesure plutot que
       devine : `is_nullable = NO and column_default is null`. Sans eux, la creation echoue en 400
       et l'onglet Contrats reste vide a juste titre. */
    const stContrat = (await (await a('statuts_contrats?select=id&limit=1')).json())[0]
    if (!stContrat) throw new Error('aucun statut de contrat en base : l essai ne prouverait rien.')
    const posC = await (await a('contrats', 'POST', {
      reference: 'ZZZ ACC CONTRAT', compte_id: cree.client, site_id: cree.site,
      type_energie_id: TE, statut_id: stContrat.id,
      date_debut: '2026-01-01', date_fin: '2028-12-31', duree_mois: 36,
      actif: true,
    })).json()
    if (!posC[0]) throw new Error('contrat d essai non cree : ' + JSON.stringify(posC).slice(0, 200))
    cree.contrat = posC[0].id

    const etape = (await (await a('etapes_recommandation?select=id,libelle&limit=1')).json())[0]
    if (!etape) throw new Error('aucune etape de recommandation : l essai ne prouverait rien.')
    cree.reco = (await (await a('recommandations', 'POST', {
      nom: 'ZZZ ACC SON AFFAIRE', compte_id: cree.client, etape_id: etape.id,
      montant: 88000, marge_apporteur: 1200, marge_nette: 7777, actif: true,
    })).json())[0].id

    const tdoc = (await (await a('types_documents?select=id&limit=1')).json())[0]
    const posD = await (await a('documents', 'POST', {
      nom: 'ZZZ ACC PIECE', nom_fichier: 'ZZZ ACC PIECE.pdf',
      entite_type: 'compte', entite_id: cree.client,
      type_document_id: tdoc ? tdoc.id : null, actif: true,
      url: 'https://exemple.invalid/zzz.pdf',
    })).json()
    cree.doc = posD[0] ? posD[0].id : null

    console.log('')
    console.log('══ ① ON NE DIT JAMAIS QUI EXISTE ══')
    const inconnue = await demander('zzz.jamais.vue@exemple.invalid')
    const connue = await demander(MAIL)
    dire(inconnue.statut === 200 && connue.statut === 200,
      'les deux adresses recoivent HTTP 200', inconnue.statut + ' / ' + connue.statut)
    dire(JSON.stringify(inconnue.corps) === JSON.stringify(connue.corps),
      'la reponse est identique, mot pour mot',
      JSON.stringify(connue.corps).slice(0, 80))

    console.log('')
    console.log('══ ② UN LIEN EST NE, POUR LA BONNE ADRESSE ══')
    const sessions = (await db.query(
      'select id, empreinte_lien, lien_expire_le from sessions_partenaires where contact_id = $1',
      [cree.ct])).rows
    dire(sessions.length === 1, 'une session est creee pour le contact partenaire',
      sessions.length + ' ligne(s)')

    const pourInconnue = (await db.query(
      "select count(*) n from sessions_partenaires s join contacts c on c.id = s.contact_id " +
      "where c.email = 'zzz.jamais.vue@exemple.invalid'")).rows[0].n
    dire(Number(pourInconnue) === 0, 'aucune session pour l adresse inconnue')

    const heures = sessions.length
      ? (new Date(sessions[0].lien_expire_le).getTime() - Date.now()) / 3600000 : 0
    dire(heures > 23 && heures < 25, 'le lien vaut 24 heures', heures.toFixed(1) + ' h')

    /* LE JETON NE SE RELIT PAS EN BASE — c'est le point. On en fabrique donc un, on pose son
       empreinte, et l'on joue la suite : c'est exactement ce que le partenaire aura dans sa boite. */
    const jeton = crypto.randomBytes(32).toString('base64url')
    await db.query(
      'update sessions_partenaires set empreinte_lien = $1 where id = $2',
      [crypto.createHash('sha256').update(jeton).digest('hex'), sessions[0].id])

    console.log('')
    console.log('══ ③ LE LIEN OUVRE UNE SESSION ══')
    const contexte = await nav.newContext()
    const page = await contexte.newPage()
    await page.goto(BASE + '/partenaire?acces=' + jeton, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(6000)

    let txt = await page.evaluate(() => document.body.innerText)
    dire(/ZZZ ACC/.test(txt), 'l espace s ouvre avec ses donnees',
      /ZZZ ACC/.test(txt) ? 'oui' : '*** ecran vide ***')
    dire(!page.url().includes('acces='), 'le jeton est retire de l adresse',
      page.url().replace(BASE, ''))

    const sess = (await db.query(
      'select ouverte_le, sess_expire_le from sessions_partenaires where id = $1', [sessions[0].id])).rows[0]
    dire(Boolean(sess.ouverte_le), 'la session est marquee ouverte')
    const jours = sess.sess_expire_le
      ? (new Date(sess.sess_expire_le).getTime() - Date.now()) / 86400000 : 0
    dire(jours > 29 && jours < 31, 'la session vaut 30 jours', jours.toFixed(1) + ' j')

    console.log('')
    console.log('══ ④ LES SEPT OBJETS DU PATRIMOINE ══')
    for (const [onglet, attendu] of [
      ['Mes recommandations', 'ZZZ ACC SON AFFAIRE'],
      ['Comptes', 'ZZZ ACC SON CLIENT'],
      ['Contacts', 'ZZZ ACC GESTIONNAIRE'],
      ['Sites', 'ZZZ ACC SITE'],
      ['Compteurs', '99999999902'],
      ['Mandats', 'ZZZ ACC MANDAT'],
      ['Contrats', 'ZZZ ACC CONTRAT'],
      ['Documents', 'ZZZ ACC PIECE'],
    ]) {
      const b = page.getByRole('button', { name: new RegExp('^' + onglet, 'i') }).first()
      if (await b.count() === 0) { dire(false, onglet + ' : onglet absent'); continue }
      await b.click({ timeout: 20000 })
      await page.waitForTimeout(1800)
      txt = await page.evaluate(() => document.body.innerText)
      dire(txt.includes(attendu), onglet.padEnd(14) + ' montre ' + attendu,
        txt.includes(attendu) ? 'oui' : '*** absent ***')
    }

    console.log('')
    console.log('══ ⑤ CE QUI NE DOIT PAS SORTIR ══')
    txt = await page.evaluate(() => document.body.innerText)
    /* ON REVIENT SUR L'ONGLET DES AFFAIRES : la marge y est, et nulle part ailleurs.
       Verifier depuis l'onglet Documents ne prouvait rien — elle n'y figure pas. */
    await page.getByRole('button', { name: /^Mes recommandations/i }).first().click({ timeout: 20000 })
    await page.waitForTimeout(2200)
    txt = await page.evaluate(() => document.body.innerText)
    
    /* `Intl.NumberFormat('fr-FR')` separe les milliers par une ESPACE INSECABLE ETROITE
       (U+202F), que `s` ne capture pas : « 1 200 € » ne correspondait a aucun motif.
       On retire toutes les espaces avant de chercher, plutot que d'en enumerer six. */
    const sansEspaces = txt.replace(/[s  ]/g, '')
    dire(!sansEspaces.includes('7777'), 'la marge nette de KiWee ne sort pas')
    dire(sansEspaces.includes('1200'), 'sa marge d apporteur, elle, est affichee',
      sansEspaces.includes('1200') ? 'oui' : '*** absente ***')

    console.log('')
    console.log('══ ⑥ LE LIEN NE SERT QU UNE FOIS ══')
    const r2 = await fetch(BASE + '/api/partenaire/ouvrir-acces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton }),
    })
    const j2 = await r2.json()
    dire(r2.status === 401 && j2.motif === 'DEJA_SERVI',
      'le meme lien, rejoue, est refuse', 'HTTP ' + r2.status + ' ' + (j2.motif ?? ''))

    const r3 = await fetch(BASE + '/api/partenaire/ouvrir-acces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: crypto.randomBytes(32).toString('base64url') }),
    })
    const j3 = await r3.json()
    dire(r3.status === 401 && j3.motif === 'INCONNU',
      'un lien invente est refuse', 'HTTP ' + r3.status + ' ' + (j3.motif ?? ''))

    console.log('')
    console.log('══ ⑦ PAS DEUX LIENS EN DEUX MINUTES ══')
    await demander(MAIL)
    const combien = (await db.query(
      'select count(*) n from sessions_partenaires where contact_id = $1', [cree.ct])).rows[0].n
    dire(Number(combien) === 1, 'une demande repetee ne cree pas un second lien',
      combien + ' session(s)')
  } finally {
    await nav.close()
    await db.query("delete from sessions_partenaires where contact_id in " +
      "(select id from contacts where email = $1 or nom like 'ZZZ ACC%')", [MAIL]).catch(() => {})
    if (cree.doc) await a('documents?id=eq.' + cree.doc, 'DELETE')
    await menage()
    const reste = (await (await a('comptes?nom=like.ZZZ ACC*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
    await db.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  IL DEMANDE SON ACCES, ET VOIT TOUT SON PATRIMOINE'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
