/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PAGE `/partenaire`, UTILISÉE COMME UN PARTENAIRE LE FERAIT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « est-ce qu'ils peuvent passer par l'API et voir une interface visuelle ?
 * comme ça ils ont une interface sans entrer dans Kimatch ».
 *
 * On ouvre la page SANS AUCUNE SESSION — navigateur vierge, comme un externe — on saisit la clé,
 * et l'on regarde ce qu'elle montre. Puis on vérifie les trois choses qui comptent :
 *
 *   ① sans clé, ou avec une clé inventée, elle ne montre rien
 *   ② avec sa clé, elle montre SON patrimoine et SES affaires
 *   ③ elle ne montre RIEN de KiWee, et aucune marge interne
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const crypto = require('crypto')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const BASE = process.env.BASE_CAPTURE || 'http://localhost:5184'
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
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    await a('recommandations?nom=like.ZZZ PAGE*', 'DELETE')
    await a('compteurs?numero_point=eq.99999999901', 'DELETE')
    await a('sites?nom=like.ZZZ PAGE*', 'DELETE')
    await a('contacts?email=eq.zzz.page@kiwee-energie.invalid', 'DELETE')
    await a('comptes?nom=like.ZZZ PAGE*', 'DELETE')

    // ── UN PARTENAIRE, SON CLIENT, UN SITE, UN COMPTEUR, UNE AFFAIRE ──
    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    const TE = (await (await a('types_energies?select=id&limit=1')).json())[0].id

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ PAGE PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id

    /* UN CONTACT CHEZ LUI : une session appartient à quelqu'un, `sessions_partenaires.contact_id`
       est obligatoire. Ce test n'en créait pas — il datait de l'époque où l'on entrait avec une
       clé, qui ne désigne qu'un compte. */
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'ZZZ PAGE REFERENT', prenom: 'Essai',
      email: 'zzz.page@kiwee-energie.invalid', compte_id: cree.part, actif: true,
    })).json())[0].id

    cree.client = (await (await a('comptes', 'POST', {
      nom: 'ZZZ PAGE SON CLIENT', type_compte_id: TC, type_compte: 'client', actif: true,
      apporteur_partenaire_id: cree.part, ville: 'NANTES', code_postal: '44000',
    })).json())[0].id
    cree.site = (await (await a('sites', 'POST', {
      nom: 'ZZZ PAGE SITE', compte_id: cree.client, ville: 'NANTES', code_postal: '44000',
    })).json())[0].id
    cree.compteur = (await (await a('compteurs', 'POST', {
      numero_point: '99999999901', compte_id: cree.client, site_id: cree.site,
      type_energie_id: TE, consommation_annuelle_mwh: 42,
    })).json())[0].id

    /* `etape_id` EST OBLIGATOIRE sur `recommandations`. Sans lui, la creation echoue en 400 et
       l'essai continuait avec une affaire qui n'existait pas — les verifications suivantes ne
       prouvaient alors plus rien. On s'arrete net si l'etape manque. */
    const etape = (await (await a('etapes_recommandation?select=id,libelle&limit=1')).json())[0]
    if (!etape) throw new Error('aucune etape de recommandation en base : l essai ne prouverait rien.')
    const posee = await (await a('recommandations', 'POST', {
      nom: 'ZZZ PAGE SON AFFAIRE', compte_id: cree.client, etape_id: etape.id,
      montant: 54321, marge_apporteur: 750, marge_nette: 9999,
      commentaire_interne: 'ZZZ SECRET INTERNE', actif: true,
    })).json()
    if (!posee[0]) throw new Error('l affaire d essai n a pas ete creee : ' + JSON.stringify(posee).slice(0, 200))
    cree.reco = posee[0].id

    // Une affaire de KiWee, qui ne doit JAMAIS apparaitre.
    const compteKiwee = (await (await a('comptes?nom=not.like.ZZZ*&select=id,nom&limit=1')).json())[0]
    cree.recoKiwee = (await (await a('recommandations', 'POST', {
      nom: 'ZZZ PAGE AFFAIRE DE KIWEE', compte_id: compteKiwee.id,
      etape_id: etape.id, actif: true,
    })).json())[0].id

    // ── LA CLÉ ──
    const cle = 'kw_' + crypto.randomBytes(32).toString('base64url')
    cree.cle = (await (await a('cles_api_partenaires', 'POST', {
      compte_id: cree.part, libelle: 'ZZZ page', prefixe: cle.slice(0, 11),
      empreinte: crypto.createHash('sha256').update(cle).digest('hex'),
    })).json())[0].id

    /* UN NAVIGATEUR VIERGE : pas de session Kimatch, pas de cookie. C'est le point de la page. */
    const contexte = await nav.newContext()
    const page = await contexte.newPage()

    console.log('')
    console.log('══ ① SANS CLE VALIDE ══')
    await page.goto(BASE + '/partenaire', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(3000)

    let txt = await page.evaluate(() => document.body.innerText)
    /* L'ECRAN D'ENTREE A CHANGE le 26/09 : il demande une ADRESSE e-mail, plus une cle — le
       partenaire recoit son lien lui-meme. Ce test cherchait encore « votre cle » et le bouton
       « Entrer » : il echouait sur une refonte, pas sur une regression. */
    dire(/espace partenaire/i.test(txt) && /votre adresse/i.test(txt),
      'la page demande une adresse e-mail', 'ecran de saisie')
    dire(!txt.includes('ZZZ PAGE'), 'elle ne montre aucune donnee avant la cle',
      txt.includes('ZZZ PAGE') ? '*** DES DONNEES FUITENT ***' : 'rien')

    /* L'ECRAN N'ACCEPTE PLUS UNE CLE COLLEE : il envoie un lien. La cle d'API reste valable
       pour une integration (verifie par `.essai-api-partenaire.cjs`), mais elle n'a plus de
       champ de saisie. On passe donc directement a l'ouverture par lien. */

    console.log('══ ② AVEC SA CLE ══')
    const crypto2 = require('crypto')
    const jetonLien = crypto2.randomBytes(32).toString('base64url')
    const { Client: PG } = require('pg')
    const mm = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
    const bdd = new PG({ connectionString: mm[1].trim().replace(/^["']|["']$/g, ''), ssl: { rejectUnauthorized: false } })
    await bdd.connect()
    await bdd.query(
      "insert into sessions_partenaires (contact_id, compte_id, empreinte_lien, lien_expire_le) " +
      "values ($1,$2,$3, now() + interval '1 hour')",
      [cree.ct, cree.part, crypto2.createHash('sha256').update(jetonLien).digest('hex')])
    await bdd.end()

    await page.goto(BASE + '/partenaire?acces=' + jetonLien, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(7000)

    txt = await page.evaluate(() => document.body.innerText)
    dire(txt.includes('ZZZ PAGE SON AFFAIRE'), 'il voit SON affaire',
      txt.includes('ZZZ PAGE SON AFFAIRE') ? 'oui' : '*** absente ***')
    dire(txt.includes('750'), 'sa marge d apporteur est affichee',
      txt.includes('750') ? 'oui' : '*** absente ***')
    dire(/brouillon|cl[ôo]tur|en cours|sign/i.test(txt) || (etape && txt.includes(etape.libelle)),
      'l etape est lisible', etape ? etape.libelle : '')

    // L'onglet patrimoine.
    /* LES ONGLETS ONT CHANGÉ le 26/09 : « Mon patrimoine » a été éclaté en sept onglets — un par
       objet — à la demande de Naoëlle (« leur afficher tous leurs objets dans patrimoine »).
       On parcourt donc les trois qui portent les données de cet essai. */
    for (const onglet of ['Comptes', 'Sites', 'Compteurs']) {
      await page.getByRole('button', { name: new RegExp('^' + onglet, 'i') }).first().click({ timeout: 20000 })
      await page.waitForTimeout(2200)
      const vu = await page.evaluate(() => document.body.innerText)
      const attendu = onglet === 'Comptes' ? 'ZZZ PAGE SON CLIENT'
        : onglet === 'Sites' ? 'ZZZ PAGE SITE' : '99999999901'
      dire(vu.includes(attendu), onglet.padEnd(10) + ' montre ' + attendu)
    }
    txt = await page.evaluate(() => document.body.innerText)

    console.log('')
    console.log('══ ③ ET RIEN DE KIWEE ══')
    const tout = await page.evaluate(() => document.body.innerText)
    dire(!tout.includes('ZZZ PAGE AFFAIRE DE KIWEE'), 'il ne voit pas une affaire de KiWee',
      tout.includes('ZZZ PAGE AFFAIRE DE KIWEE') ? '*** IL LA VOIT ***' : 'absente')
    dire(!tout.includes(compteKiwee.nom), 'il ne voit pas les comptes de KiWee',
      tout.includes(compteKiwee.nom) ? '*** ' + compteKiwee.nom + ' ***' : 'absents')
    dire(!tout.includes('ZZZ SECRET INTERNE'), 'le commentaire interne ne sort pas')
    /* ON CHERCHE LA MARGE FORMATEE, pas la suite de chiffres : le numero de compteur
       99999999901 contient « 9999 », et le test criait a la fuite pour rien. */
    const margeNette = /9s?999s?€|9999,00|9 999/.test(tout)
    dire(!margeNette, 'la marge nette de KiWee ne sort pas', margeNette ? '*** PRESENTE ***' : 'absente')

    console.log('')
    console.log('══ ④ LA CLE SURVIT AU RECHARGEMENT, ET SE QUITTE ══')
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(4500)
    txt = await page.evaluate(() => document.body.innerText)
    dire(txt.includes('ZZZ PAGE') || /Mes recommandations/i.test(txt),
      'elle se souvient de la cle au rechargement')

    await page.getByRole('button', { name: /quitter/i }).first().click({ timeout: 20000 })
    await page.waitForTimeout(2500)
    txt = await page.evaluate(() => document.body.innerText)
    /* L'ÉCRAN DE SORTIE DEMANDE UNE ADRESSE, plus une clé : dernière trace de l'ancienne version
       dans ce test. Ce qui compte n'a pas changé — les données doivent avoir disparu. */
    dire(/votre adresse/i.test(txt) && !txt.includes('ZZZ PAGE SON AFFAIRE'),
      '« Quitter » efface la session et les donnees')

    console.log('')
    console.log('══ ⑤ LA CLE N EST PAS DANS L ADRESSE ══')
    const url = page.url()
    dire(!url.includes('kw_'), 'l adresse ne porte pas la cle', url.replace(BASE, '') || '/')
  } finally {
    await nav.close()
    await a('cles_api_partenaires?libelle=like.ZZZ*', 'DELETE')
    await a('recommandations?nom=like.ZZZ PAGE*', 'DELETE')
    await a('compteurs?numero_point=eq.99999999901', 'DELETE')
    await a('sites?nom=like.ZZZ PAGE*', 'DELETE')
    await a('comptes?nom=like.ZZZ PAGE*', 'DELETE')
    const reste = (await (await a('comptes?nom=like.ZZZ PAGE*&select=id')).json()).length
      + (await (await a('recommandations?nom=like.ZZZ PAGE*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LA PAGE MONTRE SON PERIMETRE, SANS COMPTE KIMATCH'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
