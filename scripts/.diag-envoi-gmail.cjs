/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE MAIL N'ARRIVE PAS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « non j'ai rien reçu ».
 *
 * Le lien naît bien en base — c'est mesuré. Reste à savoir où la chaîne casse, et il y a quatre
 * endroits possibles :
 *
 *   ① le jeton Gmail de l'expéditeur est périmé ou révoqué
 *   ② l'envoi est refusé par Google (scope insuffisant, compte suspendu…)
 *   ③ le message part mais n'arrive pas (spam, filtre, adresse en erreur)
 *   ④ le code de production n'est pas celui que je crois (déploiement en retard)
 *
 * On les départage un par un, EN APPELANT VRAIMENT GMAIL. Les clés `GMAIL_CLIENT_ID` et
 * `GMAIL_CLIENT_SECRET` ne sont pas dans `.env.local` — on les demande donc à l'appelant, ou on
 * dit clairement qu'on ne peut pas conclure.
 *
 *     GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/.diag-envoi-gmail.cjs
 */
const fs = require('fs')
const { Client } = require('pg')

const env = (c) => {
  const l = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((x) => x.startsWith(c + '='))
  return l ? l.slice(c.length + 1).trim().replace(/^["'<]|[>"']$/g, '') : null
}

const m = fs.readFileSync('.env.local', 'utf8').match(/^SUPABASE_DB_URL=(.*)$/m)
const db = new Client({
  connectionString: m[1].trim().replace(/^["']|["']$/g, ''),
  ssl: { rejectUnauthorized: false },
})

const EXPEDITEUR = (process.env.MAIL_EXPEDITEUR_PARTENAIRE ?? 'w.goupil@kiwee-energie.fr').toLowerCase()

;(async () => {
  await db.connect()
  try {
    console.log('')
    console.log('══ ① LE JETON DE L EXPEDITEUR ══')
    const t = (await db.query(
      'select refresh_token, access_token_expires_at, date_connexion, lecture_autorisee ' +
      'from profils_gmail_tokens where email_gmail = $1', [EXPEDITEUR])).rows[0]

    if (!t) {
      console.log('   *** ' + EXPEDITEUR + ' n a AUCUN jeton : la boite n est pas connectee. ***')
      console.log('   -> a reconnecter depuis Kimatch, Parametres > Gmail.')
      return
    }
    console.log('   boite connectee le : ' + String(t.date_connexion).slice(0, 10))
    console.log('   refresh_token      : ' + (t.refresh_token ? 'present' : '*** ABSENT ***'))

    const cleId = process.env.GMAIL_CLIENT_ID
    const cleSecret = process.env.GMAIL_CLIENT_SECRET
    if (!cleId || !cleSecret) {
      console.log('')
      console.log('   ON NE PEUT PAS ALLER PLUS LOIN D ICI.')
      console.log('   `GMAIL_CLIENT_ID` et `GMAIL_CLIENT_SECRET` sont sur Vercel, pas en local.')
      console.log('')
      console.log('   Deux facons de conclure :')
      console.log('     · relancer ce script avec les deux cles :')
      console.log('         GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… node scripts/.diag-envoi-gmail.cjs')
      console.log('     · ou lire les journaux Vercel : le point d entree ecrit')
      console.log('         [partenaire/demander-acces] <adresse> : <la raison exacte>')
      return
    }

    console.log('')
    console.log('══ ② GOOGLE ACCEPTE-T-IL CE JETON ? ══')
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cleId, client_secret: cleSecret,
        refresh_token: t.refresh_token, grant_type: 'refresh_token',
      }),
    })
    const j = await r.json()
    if (!j.access_token) {
      console.log('   *** REFUSE : ' + JSON.stringify(j).slice(0, 200) + ' ***')
      console.log('   -> le jeton de ' + EXPEDITEUR + ' est perime ou revoque : a reconnecter.')
      return
    }
    console.log('   jeton rafraichi : ok')
    console.log('   droits accordes : ' + (j.scope ?? '(non precise)'))

    const peutEnvoyer = (j.scope ?? '').includes('gmail.send')
    console.log('   droit d envoi   : ' + (peutEnvoyer ? 'oui' : '*** ABSENT — c est la panne ***'))

    console.log('')
    console.log('══ ③ ON ENVOIE, POUR DE VRAI ══')
    const dest = process.env.DESTINATAIRE
    if (!dest) {
      console.log('   (passez DESTINATAIRE=vous@exemple.fr pour essayer un envoi reel)')
      return
    }

    const sujet = 'Essai Kimatch — espace partenaire'
    const corps = [
      `From: ${EXPEDITEUR}`,
      `To: ${dest}`,
      `Subject: =?UTF-8?B?${Buffer.from(sujet, 'utf-8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      'Ceci est un essai d envoi depuis Kimatch. Si vous le recevez, la chaine fonctionne.',
    ].join('\r\n')

    const envoi = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + j.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: Buffer.from(corps, 'utf-8').toString('base64url'),
        }),
      })

    const res = await envoi.json()
    if (!envoi.ok) {
      console.log('   *** GOOGLE REFUSE : HTTP ' + envoi.status + ' ' + JSON.stringify(res).slice(0, 250) + ' ***')
      return
    }
    console.log('   envoye : id ' + res.id)
    console.log('')
    console.log('   -> si ce message n arrive pas non plus, la panne est APRES Gmail :')
    console.log('      filtre du destinataire, spam, ou adresse refusee par le serveur distant.')
  } finally {
    await db.end()
  }
})().catch((e) => { console.error('ECHEC : ' + e.message); process.exit(1) })
