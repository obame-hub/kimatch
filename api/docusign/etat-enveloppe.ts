import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDocusignContext } from './_client.js'
import { NON_CONNECTE, profilAppelant } from './_oauth.js'
import { clientAdmin } from './_archivage.js'

/**
 * Où en est vraiment une enveloppe, d'après DocuSign lui-même.
 *
 * POURQUOI CET APPEL EXISTE. Naoëlle, 21/08/2026, après avoir envoyé le contrat de SDC AMPLITUDE 2 :
 * « j'ai envoyé ce contrat mais j'ai rien qui me montre s'il a bien été envoyé. Comment je suis sûre
 * que ça a envoyé ? » Le statut affiché venait du webhook, et un webhook peut ne pas arriver — un
 * réseau qui tombe, une notification perdue, une session absente au moment de la vérification. Dans
 * ce cas Kimatch affiche un état périmé sans le savoir, ce qui est pire que de n'afficher rien.
 *
 * Cet appel ne fait donc pas confiance à ce qu'on a en base : il demande à DocuSign, et REMET la base
 * d'accord avec lui. C'est la seule réponse honnête à « comment je suis sûre ».
 *
 * Lecture seule du point de vue de DocuSign : on ne modifie jamais l'enveloppe.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }
  const profilId = await profilAppelant(authHeader)
  if (!profilId) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  const contratId = typeof req.query.contratId === 'string' ? req.query.contratId : null
  if (!contratId) {
    res.status(400).json({ error: 'contratId requis' })
    return
  }

  const admin = clientAdmin()
  if (!admin) {
    res.status(500).json({ error: 'Supabase (service role) non configuré côté serveur' })
    return
  }

  const { data: contrat } = await admin
    .from('contrats')
    .select('id, docusign_envelope_id, statut_signature')
    .eq('id', contratId)
    .maybeSingle()
  if (!contrat) {
    res.status(404).json({ error: 'Contrat introuvable' })
    return
  }
  if (!contrat.docusign_envelope_id) {
    res.status(200).json({ envoye: false, raison: 'Aucune enveloppe DocuSign pour ce contrat.' })
    return
  }

  try {
    const ctx = await getDocusignContext(profilId)
    const base = `${ctx.baseUri}/restapi/v2.1/accounts/${ctx.accountId}/envelopes/${contrat.docusign_envelope_id}`
    const entetes = { Authorization: `Bearer ${ctx.accessToken}` }

    const [rEnv, rDest] = await Promise.all([
      fetch(base, { headers: entetes }),
      fetch(`${base}/recipients`, { headers: entetes }),
    ])
    if (!rEnv.ok) {
      res.status(502).json({ error: `DocuSign a refusé la lecture de l'enveloppe (${rEnv.status})` })
      return
    }
    const env = (await rEnv.json()) as { status?: string; sentDateTime?: string; completedDateTime?: string }
    const dest = rDest.ok
      ? ((await rDest.json()) as { signers?: { name?: string; email?: string; status?: string; deliveredDateTime?: string }[] })
      : { signers: [] }
    const signataire = dest.signers?.[0] ?? null

    // ON REMET LA BASE D'ACCORD AVEC DOCUSIGN. C'est tout l'intérêt : si le webhook n'est jamais
    // arrivé, cet appel rattrape le retard au lieu de laisser un statut périmé à l'écran.
    const PAR_STATUT: Record<string, string> = {
      created: 'BROUILLON',
      sent: 'ENVOYE',
      delivered: 'ENVOYE',
      completed: 'SIGNE',
      declined: 'REFUSE',
      voided: 'ANNULE',
    }
    const statut = env.status ? PAR_STATUT[env.status] : undefined
    if (statut && statut !== contrat.statut_signature) {
      await admin
        .from('contrats')
        .update({
          statut_signature: statut,
          ...(env.sentDateTime ? { date_envoi_signature: env.sentDateTime } : {}),
          ...(statut === 'SIGNE' && env.completedDateTime ? { date_signature: env.completedDateTime } : {}),
          date_modification: new Date().toISOString(),
        })
        .eq('id', contrat.id)
    }

    res.status(200).json({
      envoye: env.status !== 'created',
      statut: statut ?? null,
      statutDocusign: env.status ?? null,
      envoyeLe: env.sentDateTime ?? null,
      signeLe: env.completedDateTime ?? null,
      signataire: signataire ? { nom: signataire.name, email: signataire.email, statut: signataire.status, recuLe: signataire.deliveredDateTime ?? null } : null,
      // Le lien vers l'enveloppe dans DocuSign, construit depuis la région du compte plutôt que
      // devine : `eu.docusign.net` cote API correspond a `apps-eu.docusign.com` cote site.
      lien: lienVersEnveloppe(ctx.baseUri, contrat.docusign_envelope_id),
      corrige: Boolean(statut && statut !== contrat.statut_signature),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur DocuSign inconnue'
    if (message === NON_CONNECTE) {
      res.status(409).json({
        error: 'Votre compte DocuSign n’est pas connecté. Ouvrez « Mon profil » et autorisez DocuSign.',
        code: NON_CONNECTE,
      })
      return
    }
    res.status(502).json({ error: message })
  }
}

/** L'adresse de l'enveloppe sur le site DocuSign, déduite de la région du compte. */
function lienVersEnveloppe(baseUri: string, envelopeId: string): string {
  const hote = baseUri.includes('demo.docusign.net')
    ? 'appdemo.docusign.com'
    : baseUri.includes('eu.docusign.net')
      ? 'apps-eu.docusign.com'
      : baseUri.includes('au.docusign.net')
        ? 'apps-au.docusign.com'
        : baseUri.includes('ca.docusign.net')
          ? 'apps-ca.docusign.com'
          : 'app.docusign.com'
  return `https://${hote}/documents/details/${envelopeId}`
}
