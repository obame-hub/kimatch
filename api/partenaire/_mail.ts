import { refreshAccessToken, sendGmailMessage } from '../gmail/_client.js'
import { lire } from './_cle.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ENVOYER UN LIEN D'ACCÈS À UN PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « tu peux envoyer le lien avec le mail de William comme ce qu'on reçoit
 * nous ».
 *
 * ══ PAR GMAIL, COMME TOUT LE RESTE ══
 *
 * KiWee n'a pas de service d'envoi transactionnel, et n'a pas à en prendre un pour cette seule
 * fonction : les neuf boîtes de l'équipe sont déjà connectées, et `api/gmail/_client.ts` sait
 * envoyer depuis l'une d'elles. J'avais d'abord branché Resend — un fournisseur que KiWee n'utilise
 * pas, choisi sans demander. Corrigé.
 *
 * ══ UNE SEULE BOÎTE, CHOISIE UNE FOIS ══
 *
 * L'expéditeur est fixé par `MAIL_EXPEDITEUR_PARTENAIRE`, et vaut par défaut celle de William.
 * Ce n'est PAS la boîte du commercial qui suit le partenaire, et c'est délibéré : un lien demandé
 * à vingt-deux heures partirait alors de la boîte de quelqu'un qui dort, et atterrirait au milieu
 * de sa conversation avec ce partenaire. Ici, c'est toujours la même adresse — le partenaire
 * apprend à la reconnaître.
 *
 * SI CETTE BOÎTE N'EST PAS CONNECTÉE, on le DIT dans le journal du serveur au lieu de faire
 * semblant. Un envoi qui échoue en silence est la pire des pannes : le partenaire attend un mail
 * qui ne viendra jamais, et personne ne le sait.
 */

const EXPEDITEUR_PAR_DEFAUT = 'w.goupil@kiwee-energie.fr'

export interface Courriel {
  destinataire: string
  sujet: string
  texte: string
  html: string
}

export interface Resultat {
  envoye: boolean
  /** Ce qui s'est passé, pour le journal du serveur — jamais montré au partenaire. */
  detail: string
}

export async function envoyer(c: Courriel): Promise<Resultat> {
  const expediteur = (process.env.MAIL_EXPEDITEUR_PARTENAIRE ?? EXPEDITEUR_PAR_DEFAUT).toLowerCase()

  /* ══ PAS DE CLIENT SUPABASE ICI ══
   *
   * `@supabase/supabase-js` v2 embarque un client temps réel qui exige Node 22 (« native WebSocket
   * not found » en dessous). Sous Node 20, le seul IMPORT fait échouer le point d'entrée — mesuré
   * ce jour : le lien naissait en base, la réponse partait, et le mail ne partait jamais. L'échec
   * n'apparaissait que dans le journal du serveur.
   *
   * `lire` fait la même chose par `fetch` sur PostgREST, sans dépendre d'une version de Node. */
  const jetons = await lire<{ refresh_token: string | null }>(
    `profils_gmail_tokens?email_gmail=eq.${encodeURIComponent(expediteur)}&select=refresh_token&limit=1`,
  )

  const refresh = jetons && jetons.length > 0 ? jetons[0].refresh_token : null
  if (!refresh) {
    return {
      envoye: false,
      detail: `La boîte ${expediteur} n’est pas connectée à Kimatch : le lien ne peut pas partir. ` +
        'À reconnecter depuis Paramètres → Gmail.',
    }
  }

  try {
    /* ON RAFRAÎCHIT PLUTÔT QUE DE RÉUTILISER L'ACCESS TOKEN STOCKÉ : il ne vaut qu'une heure, et un
       lien demandé à n'importe quelle heure ne doit pas dépendre de la dernière fois que quelqu'un
       a ouvert Kimatch. Le refresh_token, lui, vaut trente jours et se renouvelle à l'usage. */
    const { access_token } = await refreshAccessToken(refresh)

    await sendGmailMessage(access_token, {
      fromEmail: expediteur,
      to: c.destinataire,
      subject: c.sujet,
      text: c.texte,
      html: c.html,
    })

    return { envoye: true, detail: `envoyé depuis ${expediteur}` }
  } catch (e) {
    return { envoye: false, detail: e instanceof Error ? e.message : 'Gmail injoignable' }
  }
}

/**
 * Le message qui porte le lien.
 *
 * COURT, ET SANS RIEN DEMANDER. Celui qui le reçoit vient de taper son adresse : il sait pourquoi
 * il l'a reçu, et il n'a qu'un geste à faire.
 *
 * ON DIT LA DURÉE. « Ce lien expire dans 24 heures » évite qu'il le garde en favori et se demande
 * la semaine suivante pourquoi il ne marche plus.
 */
export function messageDeLien(lien: string, prenom: string | null): Courriel {
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,'

  const texte = [
    bonjour,
    '',
    'Voici votre accès à votre espace partenaire KiWee Énergie :',
    '',
    lien,
    '',
    'Ce lien est valable 24 heures. Une fois ouvert, votre navigateur garde l’accès pendant 30 jours.',
    '',
    'Vous n’avez pas demandé cet accès ? Ignorez ce message : le lien ne sert à rien sans ce mail.',
    '',
    '— KiWee Énergie',
  ].join('\n')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0a0e0c">
  <p style="font-size:15px;line-height:1.5;margin:0 0 16px">${bonjour}</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
    Voici votre accès à votre espace partenaire KiWee Énergie.
  </p>
  <p style="margin:0 0 20px">
    <a href="${lien}" style="display:inline-block;background:#0d7a5f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
      Ouvrir mon espace
    </a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#5a6560;margin:0 0 8px">
    Ce lien est valable <strong>24 heures</strong>. Une fois ouvert, votre navigateur garde l’accès
    pendant 30 jours.
  </p>
  <p style="font-size:13px;line-height:1.5;color:#5a6560;margin:0 0 20px">
    Vous n’avez pas demandé cet accès ? Ignorez ce message : le lien ne sert à rien sans ce mail.
  </p>
  <p style="font-size:12px;color:#8a938e;margin:0;border-top:1px solid #e6e9e7;padding-top:14px">
    KiWee Énergie
  </p>
</div>`.trim()

  return {
    destinataire: '',
    sujet: 'Votre accès à l’espace partenaire KiWee',
    texte,
    html,
  }
}
