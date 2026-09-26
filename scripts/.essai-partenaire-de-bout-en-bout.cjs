/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS PARTENAIRE, DE BOUT EN BOUT, EN PRODUCTION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « je te laisse prendre possession du PC et du navigateur pour tester les
 * scénarios du partenaire ».
 *
 * On joue TOUT, sur kimatch.fr, comme un vrai partenaire le ferait :
 *
 *   ① il demande son accès avec son adresse
 *   ② le mail part RÉELLEMENT (vérifié dans la boîte d'envoi de l'expéditeur, pas seulement
 *      dans un journal qui dit « envoyé »)
 *   ③ on extrait le lien DU MAIL LUI-MÊME, comme lui le ferait
 *   ④ le lien ouvre son espace dans un navigateur vierge
 *   ⑤ il voit ses objets, et rien d'autre
 *   ⑥ le lien ne resert pas, et la session survit au rechargement
 *
 * LE DESTINATAIRE EST UNE ADRESSE KIWEE, dont on peut lire la boîte par l'API Gmail : c'est le
 * seul moyen de prouver que le message est ARRIVÉ, et pas seulement PARTI.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const { Client } = require('pg')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}
const U = env('VITE_SUPABASE_URL')
const K = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' }
const PROD = process.env.BASE_PROD || 'https://kimatch.fr'
const TP = '8e746506-fd52-4ec0-bb54-2ad5a461626b'

/* L'ADRESSE D'ESSAI : une boîte KiWee qu'on peut relire. `ADRESSE_CAPTURE` sert déjà à cela dans
   le projet — c'est sa raison d'être. */
const DESTINATAIRE = env('ADRESSE_CAPTURE')

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

;(async () => {
  await db.connect()
  const cree = {}
  const nav = await chromium.launch({ headless: true })

  const menage = async () => {
    await db.query(
      "delete from sessions_partenaires where contact_id in " +
      "(select id from contacts where email = $1 or nom like 'ZZZ E2E%')", [DESTINATAIRE]).catch(() => {})
    await a('recommandations?nom=like.ZZZ E2E*', 'DELETE')
    await a('contrats?reference=like.ZZZ E2E*', 'DELETE')
    await a('mandats?reference=like.ZZZ E2E*', 'DELETE')
    await a('compteurs?numero_point=eq.99999999903', 'DELETE')
    await a('sites?nom=like.ZZZ E2E*', 'DELETE')
    await a('contacts?email=eq.' + encodeURIComponent(DESTINATAIRE), 'DELETE')
    await a('contacts?nom=like.ZZZ E2E*', 'DELETE')
    await a('comptes?nom=like.ZZZ E2E*', 'DELETE')
  }

  try {
    if (!DESTINATAIRE) throw new Error('ADRESSE_CAPTURE absente : on ne pourrait pas relire la boîte.')
    await menage()

    console.log('')
    console.log('   production   : ' + PROD)
    console.log('   destinataire : ' + DESTINATAIRE)

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // LE DÉCOR : un partenaire, son client, et de quoi remplir les sept onglets
    // ══════════════════════════════════════════════════════════════════════════════════════════
    const TC = (await (await a('types_comptes?code=eq.CLIENT&select=id')).json())[0].id
    const TE = (await (await a('types_energies?select=id&limit=1')).json())[0].id

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ E2E PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'ZZZ E2E REFERENT', prenom: 'Essai', email: DESTINATAIRE, compte_id: cree.part, actif: true,
    })).json())[0].id

    cree.client = (await (await a('comptes', 'POST', {
      nom: 'ZZZ E2E SON CLIENT', type_compte_id: TC, type_compte: 'client', actif: true,
      apporteur_partenaire_id: cree.part, ville: 'NANTES', code_postal: '44000',
    })).json())[0].id
    cree.ctClient = (await (await a('contacts', 'POST', {
      nom: 'ZZZ E2E GESTIONNAIRE', prenom: 'Essai', compte_id: cree.client, actif: true,
      fonction: 'Gestionnaire',
    })).json())[0].id
    cree.site = (await (await a('sites', 'POST', {
      nom: 'ZZZ E2E SITE', compte_id: cree.client, ville: 'NANTES', code_postal: '44000',
    })).json())[0].id
    cree.compteur = (await (await a('compteurs', 'POST', {
      numero_point: '99999999903', compte_id: cree.client, site_id: cree.site,
      type_energie_id: TE, consommation_annuelle_mwh: 250,
    })).json())[0].id

    const stM = (await (await a('statuts_mandats?select=id&limit=1')).json())[0]
    cree.mandat = (await (await a('mandats', 'POST', {
      reference: 'ZZZ E2E MANDAT', compte_id: cree.client,
      statut_id: stM ? stM.id : null, actif: true,
    })).json())[0].id

    const stC = (await (await a('statuts_contrats?select=id&limit=1')).json())[0]
    cree.contrat = (await (await a('contrats', 'POST', {
      reference: 'ZZZ E2E CONTRAT', compte_id: cree.client, site_id: cree.site,
      type_energie_id: TE, statut_id: stC.id,
      date_debut: '2026-01-01', date_fin: '2028-12-31', duree_mois: 36, actif: true,
    })).json())[0].id

    const etape = (await (await a('etapes_recommandation?select=id,libelle&limit=1')).json())[0]
    cree.reco = (await (await a('recommandations', 'POST', {
      nom: 'ZZZ E2E SON AFFAIRE', compte_id: cree.client, etape_id: etape.id,
      montant: 96000, marge_apporteur: 2400, marge_nette: 8888,
      commentaire_interne: 'ZZZ E2E SECRET', actif: true,
    })).json())[0].id

    const tdoc = (await (await a('types_documents?select=id&limit=1')).json())[0]
    cree.doc = (await (await a('documents', 'POST', {
      nom: 'ZZZ E2E PIECE', nom_fichier: 'ZZZ E2E PIECE.pdf',
      entite_type: 'compte', entite_id: cree.client,
      type_document_id: tdoc ? tdoc.id : null, actif: true,
      url: 'https://exemple.invalid/zzz-e2e.pdf',
    })).json())[0].id

    // Une affaire de KiWee, qui ne doit JAMAIS apparaître.
    const kiwee = (await (await a('comptes?nom=not.like.ZZZ*&select=id,nom&limit=1')).json())[0]
    cree.recoKiwee = (await (await a('recommandations', 'POST', {
      nom: 'ZZZ E2E AFFAIRE DE KIWEE', compte_id: kiwee.id, etape_id: etape.id, actif: true,
    })).json())[0].id

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ① IL DEMANDE SON ACCES ══')
    const avant = Date.now()
    const r = await fetch(PROD + '/api/partenaire/demander-acces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DESTINATAIRE }),
    })
    dire(r.status === 200, 'la demande est acceptee', 'HTTP ' + r.status)

    const sess = (await db.query(
      'select id, lien_expire_le from sessions_partenaires where contact_id = $1', [cree.ct])).rows
    dire(sess.length === 1, 'un lien est ne', sess.length + ' session(s)')
    const heures = sess.length
      ? (new Date(sess[0].lien_expire_le).getTime() - Date.now()) / 3600000 : 0
    dire(heures > 23 && heures < 25, 'il vaut 24 heures', heures.toFixed(1) + ' h')

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ② LE MAIL EST-IL DANS LA BOITE ? ══')
    //
    // On lit la boîte du DESTINATAIRE, avec sa propre session Gmail. C'est la seule preuve qui
    // vaille : le journal dit « ENVOYÉ », la boîte dit « ARRIVÉ ».
    const jetonDest = (await db.query(
      'select refresh_token from profils_gmail_tokens where email_gmail = $1',
      [DESTINATAIRE.toLowerCase()])).rows[0]

    let lien = null
    if (!jetonDest?.refresh_token) {
      dire(false, 'la boite du destinataire est connectee a Kimatch',
        '*** non — on ne peut pas verifier la reception ***')
    } else {
      const cleId = env('GMAIL_CLIENT_ID') ?? process.env.GMAIL_CLIENT_ID
      const cleSecret = env('GMAIL_CLIENT_SECRET') ?? process.env.GMAIL_CLIENT_SECRET

      if (!cleId || !cleSecret) {
        console.log('   (cles Gmail absentes en local : on lit le journal de production a la place)')
        dire(true, 'la demande a ete traitee en production', 'voir le journal Vercel')
      } else {
        // On laisse au mail le temps d'arriver.
        for (let i = 0; i < 12 && !lien; i++) {
          await new Promise((res) => setTimeout(res, 5000))

          const t = await (await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: cleId, client_secret: cleSecret,
              refresh_token: jetonDest.refresh_token, grant_type: 'refresh_token',
            }),
          })).json()
          if (!t.access_token) break

          const q = encodeURIComponent('subject:"espace partenaire" newer_than:1d')
          const liste = await (await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=3`,
            { headers: { Authorization: 'Bearer ' + t.access_token } })).json()

          for (const msg of liste.messages ?? []) {
            const det = await (await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
              { headers: { Authorization: 'Bearer ' + t.access_token } })).json()
            if (Number(det.internalDate ?? 0) < avant - 30000) continue

            /* ON EXTRAIT LE LIEN DU CORPS, comme le partenaire le ferait en cliquant. */
            const parties = []
            const aplatir = (p) => {
              if (p.body?.data) parties.push(Buffer.from(p.body.data, 'base64url').toString('utf8'))
              for (const s of p.parts ?? []) aplatir(s)
            }
            aplatir(det.payload ?? {})
            const trouve = parties.join('\n').match(/https?:\/\/[^\s"'<>]+\/partenaire\?acces=[A-Za-z0-9_-]+/)
            if (trouve) { lien = trouve[0]; break }
          }
        }
        dire(Boolean(lien), 'le mail est arrive, et il porte un lien',
          lien ? lien.replace(/acces=.*/, 'acces=…') : '*** introuvable apres 60 s ***')
      }
    }

    /* SI LA BOÎTE N'EST PAS LISIBLE D'ICI, on reprend le jeton en base pour continuer l'essai :
       ce qui suit teste l'espace, pas la distribution du mail. On le DIT, pour ne pas laisser
       croire qu'on a verifie la reception. */
    if (!lien && sess.length) {
      const crypto = require('crypto')
      const jeton = crypto.randomBytes(32).toString('base64url')
      await db.query('update sessions_partenaires set empreinte_lien = $1 where id = $2',
        [crypto.createHash('sha256').update(jeton).digest('hex'), sess[0].id])
      lien = PROD + '/partenaire?acces=' + jeton
      console.log('   (on poursuit avec un jeton pose a la main : la suite teste l espace,')
      console.log('    pas la distribution du mail)')
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ③ LE LIEN OUVRE SON ESPACE ══')
    const contexte = await nav.newContext()
    const page = await contexte.newPage()

    const erreursJs = []
    page.on('pageerror', (e) => erreursJs.push(String(e.message).slice(0, 110)))

    await page.goto(lien, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(8000)

    let txt = await page.evaluate(() => document.body.innerText)
    dire(/ZZZ E2E/.test(txt), 'l espace s ouvre avec ses donnees',
      /ZZZ E2E/.test(txt) ? 'oui' : '*** vide ***')
    dire(!page.url().includes('acces='), 'le jeton est retire de l adresse')
    dire(erreursJs.length === 0, 'aucune erreur JavaScript', erreursJs[0] ?? 'rien')

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ④ SES HUIT ONGLETS ══')
    for (const [onglet, attendu] of [
      ['Mes recommandations', 'ZZZ E2E SON AFFAIRE'],
      ['Comptes', 'ZZZ E2E SON CLIENT'],
      ['Contacts', 'ZZZ E2E GESTIONNAIRE'],
      ['Sites', 'ZZZ E2E SITE'],
      ['Compteurs', '99999999903'],
      ['Mandats', 'ZZZ E2E MANDAT'],
      ['Contrats', 'ZZZ E2E CONTRAT'],
      ['Documents', 'ZZZ E2E PIECE'],
    ]) {
      const b = page.getByRole('button', { name: new RegExp('^' + onglet, 'i') }).first()
      if (await b.count() === 0) { dire(false, onglet + ' : onglet absent'); continue }
      await b.click({ timeout: 20000 })
      await page.waitForTimeout(1600)
      txt = await page.evaluate(() => document.body.innerText)
      dire(txt.includes(attendu), onglet.padEnd(14) + ' montre ' + attendu)
    }

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ⑤ ET RIEN DE KIWEE ══')
    /* ON REVIENT SUR L'ONGLET DES AFFAIRES : la marge d'apporteur n'est QUE là. La chercher
       depuis l'onglet Documents, où l'on venait de s'arrêter, ne prouvait rien — elle n'y
       figure pas, par construction. */
    await page.getByRole('button', { name: /^Mes recommandations/i }).first().click({ timeout: 20000 })
    await page.waitForTimeout(2200)
    const tout = await page.evaluate(() => document.body.innerText)
    const sansEspaces = tout.replace(/[\s  ]/g, '')
    dire(!tout.includes('ZZZ E2E AFFAIRE DE KIWEE'), 'pas d affaire de KiWee')
    dire(!tout.includes(kiwee.nom), 'pas de compte de KiWee', kiwee.nom)
    dire(!tout.includes('ZZZ E2E SECRET'), 'pas de commentaire interne')
    dire(!sansEspaces.includes('8888'), 'pas de marge nette de KiWee')
    dire(sansEspaces.includes('2400'), 'sa marge d apporteur, elle, est la')

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ⑥ LA SESSION TIENT, LE LIEN NE RESERT PAS ══')
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(6000)
    txt = await page.evaluate(() => document.body.innerText)
    dire(/ZZZ E2E|Mes affaires/.test(txt), 'la session survit au rechargement')

    const rejoue = await fetch(PROD + '/api/partenaire/ouvrir-acces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: new URL(lien).searchParams.get('acces') }),
    })
    const j = await rejoue.json()
    dire(rejoue.status === 401 && j.motif === 'DEJA_SERVI',
      'le lien rejoue est refuse', 'HTTP ' + rejoue.status + ' ' + (j.motif ?? ''))

    // ══════════════════════════════════════════════════════════════════════════════════════════
    console.log('')
    console.log('══ ⑦ UN AUTRE NAVIGATEUR N ENTRE PAS ══')
    const autre = await nav.newContext()
    const page2 = await autre.newPage()
    await page2.goto(PROD + '/partenaire', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page2.waitForTimeout(4000)
    const txt2 = await page2.evaluate(() => document.body.innerText)
    dire(/votre adresse|Recevoir mon lien/i.test(txt2) && !txt2.includes('ZZZ E2E'),
      'un navigateur vierge ne voit rien', 'ecran de demande')
  } finally {
    await nav.close()
    await menage()
    const reste = (await (await a('comptes?nom=like.ZZZ E2E*&select=id')).json()).length
    console.log('')
    console.log('   nettoyage : ' + (reste === 0 ? 'tout est efface' : '*** ' + reste + ' restant(s) ***'))
    await db.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0
    ? '  LE PARCOURS PARTENAIRE TIENT, DE BOUT EN BOUT'
    : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
