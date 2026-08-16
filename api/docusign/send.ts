import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDocusignContext, sendEnvelope } from './_client.js'
import { NON_CONNECTE, profilAppelant } from './_oauth.js'
import { archiverDocumentsEnvoyes, clientAdmin } from './_archivage.js'

interface SendBody {
  mandatId?: string
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
  if (!body?.mandatId || !body.signerEmail || !body.signerName || (!body.documents?.length && !body.documentUrl)) {
    res.status(400).json({ error: 'mandatId, signerEmail, signerName et au moins un document sont requis' })
    return
  }

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
      documents = [{ pdfBase64: pdfBuffer.toString('base64'), fileName: body.documentName ?? 'Mandat.pdf' }]
    }

    const ctx = await getDocusignContext(profilId)
    const result = await sendEnvelope(ctx, {
      documents,
      signerEmail: body.signerEmail,
      signerName: body.signerName,
      emailSubject: body.emailSubject ?? 'KiWee Énergie — Mandat à signer',
      emailMessage: body.emailMessage,
      customFields: [{ name: 'mandat_id', value: body.mandatId }],
      draft: body.draft,
      returnUrl: body.returnUrl,
    })

    // Archiver ce qui vient de partir a la signature. Best-effort assume : l'enveloppe est deja
    // chez DocuSign, le mandat suit son cours meme si le depot echoue — on journalise et on rend
    // la main. Sans cela, un mandat jamais signe ne laissait aucune trace de ce qu'on avait soumis
    // au client (la version signee etait bien archivee, l'envoyee jamais).
    try {
      const admin = clientAdmin()
      const { data: mandat } = admin
        ? await admin.from('mandats').select('compte:comptes(nom)').eq('id', body.mandatId).maybeSingle()
        : { data: null }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const compteNom = (mandat as any)?.compte?.nom ?? 'mandat'
      await archiverDocumentsEnvoyes(body.mandatId, compteNom, documents)
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
        error: 'Votre compte DocuSign n’est pas connecté. Ouvrez « Mon profil » et autorisez DocuSign : c’est à faire une seule fois, et le mandat partira ensuite de votre compte.',
        code: NON_CONNECTE,
      })
      return
    }
    res.status(502).json({ error: message })
  }
}
