import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken, sendGmailMessage } from './_client.js'

/**
 * ══ ENVOYER UN MAIL DEPUIS KIMATCH, AVEC LE GMAIL DE LA PERSONNE ══
 *
 * Naoëlle, 07/09/2026 : « même si on l'écrit depuis Kimatch et l'envoie depuis Kimatch, on le voit
 * dans nos mails envoyés de Gmail, et quand on reçoit la réponse on la reçoit sur notre Gmail. »
 *
 * ══ CE QUE CETTE FONCTION FAIT, ET DANS CET ORDRE ══
 *
 *   1. Vérifie la session — sans quoi n'importe qui enverrait des mails au nom de KiWee.
 *   2. Compose le corps : le message, puis la signature de l'expéditeur, lue EN BASE.
 *   3. Envoie via Gmail avec le jeton de cette personne, rafraîchi si besoin.
 *   4. Consigne l'envoi dans `interactions`, rattaché au contact reconnu par son adresse.
 *
 * ══ LA SIGNATURE EST LUE ICI, PAS ENVOYÉE PAR LE NAVIGATEUR ══
 *
 * Le volet en affiche un aperçu, mais c'est le serveur qui la colle. Sinon il suffirait de modifier
 * la requête pour signer un mail du nom de quelqu'un d'autre — une signature est une identité, elle
 * ne se laisse pas dicter par le client.
 *
 * ══ LA TRACE DANS KIMATCH EST LE POINT DE L'EXERCICE ══
 *
 * Un mail envoyé et non consigné laisse la fiche du client muette : c'est ce qui rendait
 * l'historique inutilisable avant. L'envoi crée donc une `interaction` de type EMAIL, sens SORTANT,
 * rattachée au contact — reconnu par son adresse, sans que le navigateur ait à le dire.
 *
 * ELLE NE FAIT PAS ÉCHOUER L'ENVOI. Le mail est parti chez le client : refuser la réponse parce que
 * la consignation a raté ferait renvoyer le mail. On répond donc `ok` avec `consigne: false`, et le
 * volet le signale.
 */

interface SendBody {
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  /** Le corps en HTML, tel que composé dans le volet. */
  html?: string
  /** Le même corps en texte, pour les clients qui n'affichent pas l'HTML. */
  text?: string
  /** Faux pour envoyer sans signature — un choix par mail. */
  avecSignature?: boolean
  /** Le fil Gmail, quand le mail répond à une conversation existante. */
  threadId?: string
  /** Le contexte Kimatch, quand l'écran le connaît. Sinon on retrouve le contact par son adresse. */
  contactId?: string
  compteId?: string
  siteId?: string
  recommandationId?: string
  mandatId?: string
  contratId?: string
}

/** Le texte d'un corps HTML, pour la version alternative et le résumé de l'interaction. */
function versTexte(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const body = req.body as SendBody
  const corpsHtml = (body?.html ?? '').trim()
  const corpsTexte = (body?.text ?? '').trim() || (corpsHtml ? versTexte(corpsHtml) : '')
  if (!body?.to || !body.subject || !corpsTexte) {
    res.status(400).json({ error: 'Destinataire, objet et message sont requis' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return
  }

  const supabaseAuthed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAuthed.auth.getUser()
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }
  const profilId = userData.user.id

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: tokenRow, error: tokenError } = await supabase
    .from('profils_gmail_tokens')
    .select('email_gmail, refresh_token, access_token, access_token_expires_at')
    .eq('profil_id', profilId)
    .maybeSingle()

  if (tokenError) {
    res.status(502).json({ error: tokenError.message })
    return
  }
  if (!tokenRow) {
    res.status(400).json({
      error: 'Aucun compte Gmail connecté. Connecte ton compte depuis Mon profil.',
      code: 'gmail_non_connecte',
    })
    return
  }

  // ── La signature, lue en base et jamais reçue du navigateur ──
  let signatureHtml = ''
  if (body.avecSignature !== false) {
    const { data: sig } = await supabase
      .from('profils_signatures_email')
      .select('corps_html')
      .eq('profil_id', profilId)
      .maybeSingle()
    signatureHtml = ((sig?.corps_html as string | null) ?? '').trim()
  }

  // Le mail complet. Une police et une couleur explicites : sans elles, chaque client applique la
  // sienne et le mail ne ressemble pas à ce que le commercial a écrit.
  const htmlComplet = corpsHtml
    ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;">'
      + corpsHtml
      + (signatureHtml ? `<br/><div style="color:#6b7280;font-size:13px;">${signatureHtml}</div>` : '')
      + '</div>'
    : null

  const texteComplet = signatureHtml
    ? `${corpsTexte}\n\n${versTexte(signatureHtml)}`
    : corpsTexte

  let envoi: { id: string; threadId: string | null }
  try {
    let accessToken = tokenRow.access_token as string | null
    const expiresAt = tokenRow.access_token_expires_at
      ? new Date(tokenRow.access_token_expires_at as string).getTime()
      : 0
    if (!accessToken || expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token as string)
      accessToken = refreshed.access_token
      await supabase
        .from('profils_gmail_tokens')
        .update({
          access_token: accessToken,
          access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq('profil_id', profilId)
    }

    envoi = await sendGmailMessage(accessToken, {
      fromEmail: tokenRow.email_gmail as string,
      to: body.to,
      cc: body.cc || null,
      bcc: body.bcc || null,
      subject: body.subject,
      text: texteComplet,
      html: htmlComplet,
      threadId: body.threadId || null,
    })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur Gmail inconnue' })
    return
  }

  // ── La trace dans Kimatch ──
  //
  // Elle ne peut plus faire échouer quoi que ce soit : le mail est parti. Une erreur ici se signale
  // sans annuler, sinon on renverrait le mail pour rattraper une ligne d'historique.
  let consigne = false
  let contactId = body.contactId ?? null
  let compteId = body.compteId ?? null
  try {
    // LE CONTACT SE RECONNAÎT PAR SON ADRESSE quand l'écran ne l'a pas dit. Le premier destinataire
    // fait foi : c'est à lui qu'on écrit, les autres sont en copie de fait.
    if (!contactId) {
      const premiere = body.to.split(/[,;]/)[0]?.trim().toLowerCase()
      if (premiere) {
        const { data: trouve } = await supabase
          .from('contacts')
          .select('id, compte_id')
          .ilike('email', premiere)
          .eq('actif', true)
          .limit(1)
          .maybeSingle()
        if (trouve) {
          contactId = trouve.id as string
          compteId = compteId ?? (trouve.compte_id as string | null)
        }
      }
    }

    const { data: typeEmail } = await supabase
      .from('types_interactions')
      .select('id')
      .eq('code', 'EMAIL')
      .maybeSingle()

    const { error: erreurTrace } = await supabase.from('interactions').insert({
      type_interaction_id: typeEmail?.id ?? null,
      auteur_profil_id: profilId,
      proprietaire_id: profilId,
      cree_par_id: profilId,
      contact_id: contactId,
      compte_id: compteId,
      site_id: body.siteId ?? null,
      recommandation_id: body.recommandationId ?? null,
      mandat_id: body.mandatId ?? null,
      date_interaction: new Date().toISOString(),
      sens: 'SORTANT',
      objet: body.subject.slice(0, 500),
      resume: corpsTexte.slice(0, 4000),
      numero_correspondant: null,
      // L'identifiant Gmail sert de clé : il rend la consignation idempotente si un jour on
      // rapatrie les messages, et permet de retrouver le mail dans la boîte de l'expéditeur.
      source_externe_id: envoi.id,
    })
    consigne = !erreurTrace
  } catch {
    consigne = false
  }

  res.status(200).json({
    ok: true,
    id: envoi.id,
    threadId: envoi.threadId,
    consigne,
    contactId,
  })
}
