import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDocusignContext, sendEnvelope } from './_client.js'
import { NON_CONNECTE, profilAppelant } from './_oauth.js'
import { archiverDocumentsEnvoyes, clientAdmin, type ObjetSigne } from './_archivage.js'

interface SendBody {
  mandatId?: string
  /**
   * L'autre objet qu'on fait signer : un contrat de fourniture.
   *
   * URGENCE DU 21/08/2026. Michel ne pouvait pas envoyer le contrat de SDC AMPLITUDE 2 a la
   * signature, et pour une raison simple : rien ne le permettait. Cet endpoint exigeait un
   * `mandatId` et refusait tout le reste, aucun ecran de contrat n'appelait l'envoi, et la fiche
   * contrat ne faisait qu'AFFICHER un etat de signature qui n'avait jamais pu naitre. Les colonnes
   * etaient la depuis le debut (`docusign_envelope_id`, `statut_signature`, `date_signature`,
   * `contact_signataire_id`), le code non.
   */
  contratId?: string
  documents?: { pdfBase64: string; fileName: string }[]
  /** Repli rétro-compatible : URL d'un document déjà attaché (ancien flux manuel). */
  documentUrl?: string
  documentName?: string
  signerEmail?: string
  signerName?: string
  emailSubject?: string
  emailMessage?: string
  draft?: boolean
  returnUrl?: string
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

  // L'enveloppe part du compte DocuSign de CETTE personne : il faut donc savoir qui appelle avant
  // toute chose (voir getDocusignContext).
  const profilId = await profilAppelant(authHeader)
  if (!profilId) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  const body = req.body as SendBody
  // Un objet, et un seul : le mandat ou le contrat. Les deux a la fois n'aurait pas de sens, et
  // aucun des deux ne laisserait la signature sans rien a rattacher.
  const objet: ObjetSigne | null = body?.mandatId
    ? { type: 'mandat', id: body.mandatId }
    : body?.contratId
      ? { type: 'contrat', id: body.contratId }
      : null
  if (body?.mandatId && body?.contratId) {
    res.status(400).json({ error: 'mandatId ou contratId, pas les deux' })
    return
  }
  if (!objet || !body.signerEmail || !body.signerName || (!body.documents?.length && !body.documentUrl)) {
    res.status(400).json({
      error: 'mandatId ou contratId, signerEmail, signerName et au moins un document sont requis',
    })
    return
  }
  const estContrat = objet.type === 'contrat'

  try {
    let documents: { pdfBase64: string; fileName: string }[]
    if (body.documents?.length) {
      documents = body.documents
    } else {
      const pdfRes = await fetch(body.documentUrl!)
      if (!pdfRes.ok) {
        res.status(400).json({ error: `Impossible de récupérer le document (${pdfRes.status})` })
        return
      }
      const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
      if (!pdfBuffer.length) {
        res.status(400).json({ error: 'Document vide' })
        return
      }
      documents = [{
        pdfBase64: pdfBuffer.toString('base64'),
        fileName: body.documentName ?? (estContrat ? 'Contrat.pdf' : 'Mandat.pdf'),
      }]
    }

    const ctx = await getDocusignContext(profilId)
    const result = await sendEnvelope(ctx, {
      documents,
      signerEmail: body.signerEmail,
      signerName: body.signerName,
      emailSubject:
        body.emailSubject ?? (estContrat ? 'KiWee Énergie — Contrat à signer' : 'KiWee Énergie — Mandat à signer'),
      emailMessage: body.emailMessage,
      // Le webhook repart de ce champ pour retrouver l'objet : `contrat_id` ou `mandat_id`.
      customFields: [{ name: estContrat ? 'contrat_id' : 'mandat_id', value: objet.id }],
      draft: body.draft,
      returnUrl: body.returnUrl,
      // PAS D'ANCRES SUR UN CONTRAT : le PDF vient du fournisseur et ne porte pas les nôtres.
      // L'expéditeur place les champs lui-même dans DocuSign avant d'envoyer.
      ancres: !estContrat,
    })

    // Archiver ce qui vient de partir a la signature. Best-effort assume : l'enveloppe est deja
    // chez DocuSign, le mandat suit son cours meme si le depot echoue — on journalise et on rend
    // la main. Sans cela, un mandat jamais signe ne laissait aucune trace de ce qu'on avait soumis
    // au client (la version signee etait bien archivee, l'envoyee jamais).
    try {
      const admin = clientAdmin()
      const { data: porteur } = admin
        ? await admin
            .from(estContrat ? 'contrats' : 'mandats')
            .select('compte:comptes(nom)')
            .eq('id', objet.id)
            .maybeSingle()
        : { data: null }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compteNom = (porteur as any)?.compte?.nom ?? objet.type
      await archiverDocumentsEnvoyes(objet, compteNom, documents)

      // LA DATE D'ENVOI, ÉCRITE TOUT DE SUITE. Côté mandat c'est le webhook qui la pose au premier
      // événement DocuSign ; côté contrat on ne peut pas attendre : un brouillon que l'expéditeur
      // n'envoie finalement pas ne déclenche aucun événement, et la fiche resterait muette alors
      // qu'une enveloppe existe. On enregistre donc l'enveloppe et l'envoi dès leur création.
      if (admin && estContrat) {
        await admin
          .from('contrats')
          .update({
            docusign_envelope_id: result.envelopeId,
            statut_signature: body.draft ? 'BROUILLON' : 'ENVOYE',
            ...(body.draft ? {} : { date_envoi_signature: new Date().toISOString() }),
            date_modification: new Date().toISOString(),
          })
          .eq('id', objet.id)
      }
    } catch (archErr) {
      console.error('[docusign send] archivage de la version envoyée échoué', archErr)
    }

    res.status(200).json({ ...result, emetteur: ctx.emetteur })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur DocuSign inconnue'
    // 409 et code dédié plutôt qu'un 502 générique : ce n'est pas une panne, c'est une autorisation
    // qui manque. Le front distingue les deux pour proposer « Connecter mon compte DocuSign » au
    // lieu d'afficher un message d'erreur technique.
    if (message === NON_CONNECTE) {
      res.status(409).json({
        error: `Votre compte DocuSign n’est pas connecté. Ouvrez « Mon profil » et autorisez DocuSign : c’est à faire une seule fois, et ${estContrat ? 'le contrat' : 'le mandat'} partira ensuite de votre compte.`,
        code: NON_CONNECTE,
      })
      return
    }
    res.status(502).json({ error: message })
  }
}
