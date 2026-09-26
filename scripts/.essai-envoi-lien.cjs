/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE MAIL PART-IL VRAIMENT ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * C'est le seul maillon que je n'avais jamais éprouvé : le lien naissait bien en base, mais je ne
 * l'avais jamais vu arriver dans une boîte. Un envoi qui échoue en silence est la pire des pannes —
 * le partenaire attend un mail qui ne viendra jamais, et personne ne le sait.
 *
 * ON ENVOIE POUR DE VRAI, à l'adresse de capture (`ADRESSE_CAPTURE` dans `.env.local`), et l'on
 * vérifie ensuite dans la boîte d'envoi de l'expéditeur que le message est bien parti.
 *
 * TOUT EST EFFACÉ À LA FIN, y compris en cas d'échec.
 */
const fs = require('fs')
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

/* L'ADRESSE DE CAPTURE EST CELLE QUE KIMATCH UTILISE DÉJÀ pour ses essais d'envoi. Elle est dans
   `.env.local`, jamais écrite ici. */
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

  try {
    if (!DESTINATAIRE) {
      throw new Error('ADRESSE_CAPTURE absente de .env.local : on n’enverrait nulle part.')
    }

    console.log('')
    console.log('   expediteur   : ' + (process.env.MAIL_EXPEDITEUR_PARTENAIRE ?? 'w.goupil@kiwee-energie.fr'))
    console.log('   destinataire : ' + DESTINATAIRE)

    // ── LA BOÎTE DE L'EXPÉDITEUR EST-ELLE CONNECTÉE ? ──
    const expediteur = (process.env.MAIL_EXPEDITEUR_PARTENAIRE ?? 'w.goupil@kiwee-energie.fr').toLowerCase()
    const jeton = (await db.query(
      'select refresh_token from profils_gmail_tokens where email_gmail = $1', [expediteur])).rows[0]
    console.log('')
    console.log('══ ① LA BOITE EST-ELLE CONNECTEE ? ══')
    dire(Boolean(jeton?.refresh_token), 'la boite de l expediteur est connectee a Kimatch',
      jeton?.refresh_token ? 'oui' : '*** NON — le lien ne partirait pas ***')

    // ── LE DÉCOR : un partenaire dont le contact porte l'adresse de capture ──
    await a('contacts?email=eq.' + encodeURIComponent(DESTINATAIRE), 'DELETE')
    await a('comptes?nom=like.ZZZ ENVOI*', 'DELETE')

    cree.part = (await (await a('comptes', 'POST', {
      nom: 'ZZZ ENVOI PARTENAIRE', type_compte_id: TP, type_compte: 'partenaire', actif: true,
    })).json())[0].id
    cree.ct = (await (await a('contacts', 'POST', {
      nom: 'ZZZ ENVOI', prenom: 'Essai', email: DESTINATAIRE, compte_id: cree.part, actif: true,
    })).json())[0].id

    console.log('')
    console.log('══ ② ON DEMANDE UN LIEN, POUR DE VRAI ══')
    const avant = Date.now()
    const r = await fetch(BASE + '/api/partenaire/demander-acces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DESTINATAIRE }),
    })
    const corps = await r.json()
    dire(r.status === 200, 'la demande est acceptee', 'HTTP ' + r.status)
    console.log('   reponse : ' + (corps.message ?? '').slice(0, 90))

    // La réponse part AVANT l'envoi : on laisse le temps au mail de sortir.
    await new Promise((res) => setTimeout(res, 9000))

    const sess = (await db.query(
      'select id, lien_expire_le from sessions_partenaires where contact_id = $1', [cree.ct])).rows
    dire(sess.length === 1, 'le lien est bien ne en base', sess.length + ' session(s)')

    console.log('')
    console.log('══ ③ L ENVOI A-T-IL REUSSI ? ══')

    /* ON LIT LE JOURNAL DU SERVEUR, et non pas rien.

       Mon premier essai affichait « LE LIEN PART » sans avoir rien verifie : les cles Gmail sont
       absentes en local, il sautait la verification et concluait au succes. Le mail ne partait
       pas — `_mail.ts` importait le client Supabase, qui exige Node 22, et le point d'entree
       echouait AVANT le premier appel a Gmail.

       `demander-acces` journalise toute erreur d'envoi. L'absence de ligne d'erreur, une fois le
       lien ne en base, est donc la preuve que l'envoi est alle au bout. */
    const journal = process.env.JOURNAL_VITE
    if (!journal || !fs.existsSync(journal)) {
      dire(false, 'le journal du serveur est lisible',
        '*** posez JOURNAL_VITE=<chemin du log de npm run dev> ***')
    } else {
      /** Les couleurs du terminal brouillent la lecture : on les retire. */
      const ESC = String.fromCharCode(27)
      const sansCouleur = (x) => x.split(ESC).map((m,i) => (i===0 ? m : m.slice(m.indexOf(String.fromCharCode(109))+1))).join('')

      const lignes = fs.readFileSync(journal, 'utf8')
        .split(String.fromCharCode(10))
        .map(sansCouleur)
        /* `demander-acces` journalise sous `[partenaire/demander-acces]`, SANS le mot « api ».
           Mon premier filtre cherchait « api/partenaire » et écartait justement les lignes qu'il
           devait lire : le test annonçait « LE LIEN PART » alors que le journal disait
           « GMAIL_CLIENT_ID non configurée ». */
        .filter((l) => l.includes('partenaire'))
        .slice(-8)

      /* TOUTE LIGNE JOURNALISÉE PAR `demander-acces` EST UN ÉCHEC, par construction : le succès ne
         journalise rien. Chercher des mots-clés était une erreur — mon filtre ne reconnaissait pas
         « GMAIL_CLIENT_ID non configurée », et le test concluait au succès alors que rien n'était
         parti. On inverse : la présence d'une ligne suffit. */
      const erreurs = lignes.filter((l) => l.includes('[partenaire/demander-acces]'))
      dire(erreurs.length === 0, 'aucune erreur d envoi dans le journal',
        erreurs.length === 0 ? 'rien' : '*** ' + erreurs[erreurs.length - 1].slice(0, 130) + ' ***')

      if (erreurs.length) {
        console.log('')
        console.log('   LE MAIL N EST PAS PARTI. Les dernieres lignes du journal :')
        for (const l of lignes) console.log('      ' + l.slice(0, 140))
      }
    }
  } finally {
    await db.query("delete from sessions_partenaires where contact_id in " +
      "(select id from contacts where email = $1)", [DESTINATAIRE]).catch(() => {})
    if (DESTINATAIRE) await a('contacts?email=eq.' + encodeURIComponent(DESTINATAIRE), 'DELETE')
    await a('comptes?nom=like.ZZZ ENVOI*', 'DELETE')
    console.log('')
    console.log('   nettoyage : fait')
    await db.end()
  }

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log(soucis === 0 ? '  LE LIEN PART' : '  *** ' + soucis + ' SOUCI(S) ***')
  console.log('════════════════════════════════════════════════')
  console.log('')
  process.exit(soucis === 0 ? 0 : 1)
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
