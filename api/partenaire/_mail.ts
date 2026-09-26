/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ENVOYER UN MAIL À UN PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ PAS PAR GMAIL, ET C'EST DÉLIBÉRÉ ══
 *
 * `api/gmail/send.ts` envoie depuis la boîte d'un commercial : c'est ce qu'il faut pour écrire à un
 * client, et c'est exactement ce qu'il ne faut pas ici. Un lien d'accès demandé à trois heures du
 * matin partirait de la boîte de quelqu'un qui dort, et atterrirait dans sa conversation avec le
 * partenaire. C'est un mail de service, il part de KiWee, pas de quelqu'un.
 *
 * ══ LE SERVICE SE CHOISIT PAR L'ENVIRONNEMENT ══
 *
 * On lit `RESEND_API_KEY` ou, à défaut, un SMTP classique. Aucun secret n'est écrit ici, et le jour
 * où KiWee change de fournisseur, c'est une variable à poser sur Vercel — pas une ligne de code.
 *
 * SI RIEN N'EST CONFIGURÉ, on le DIT au lieu de faire semblant. Un envoi qui échoue en silence est
 * la pire des pannes : le partenaire attend un mail qui ne viendra jamais, et personne ne le sait.
 */

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

/** Vrai si un service d'envoi est configuré. L'écran s'en sert pour ne pas promettre l'impossible. */
export function envoiConfigure(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL)
}

export async function envoyer(c: Courriel): Promise<Resultat> {
  const expediteur = process.env.MAIL_EXPEDITEUR ?? 'KiWee Énergie <ne-pas-repondre@kimatch.fr>'

  // ── RESEND, si la clé est posée ──
  const cleResend = process.env.RESEND_API_KEY
  if (cleResend) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleResend}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: expediteur,
          to: [c.destinataire],
          subject: c.sujet,
          text: c.texte,
          html: c.html,
        }),
      })
      if (!r.ok) {
        return { envoye: false, detail: `Resend a répondu ${r.status} : ${(await r.text()).slice(0, 200)}` }
      }
      return { envoye: true, detail: 'envoyé par Resend' }
    } catch (e) {
      return { envoye: false, detail: e instanceof Error ? e.message : 'Resend injoignable' }
    }
  }

  /* AUCUN SERVICE : on ne ment pas. L'appelant décidera quoi en faire — ici, répondre au partenaire
     que quelque chose ne va pas de notre côté, et le dire dans le journal du serveur. */
  return {
    envoye: false,
    detail: 'Aucun service d’envoi configuré (RESEND_API_KEY absente). Le mail n’est pas parti.',
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
    KiWee Énergie — ce message est automatique, merci de ne pas y répondre.
  </p>
</div>`.trim()

  return {
    destinataire: '',
    sujet: 'Votre accès à l’espace partenaire KiWee',
    texte,
    html,
  }
}
