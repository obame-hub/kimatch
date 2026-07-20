import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDocusignContext, sendEnvelope } from './_client.js'

interface SendBody {
  mandatId?: string
  documentUrl?: string
  documentName?: string
  signerEmail?: string
  signerName?: string
  emailSubject?: string
  emailMessage?: string
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
  if (!body?.mandatId || !body.documentUrl || !body.signerEmail || !body.signerName) {
    res.status(400).json({ error: 'mandatId, documentUrl, signerEmail et signerName sont requis' })
    return
  }

  try {
    const pdfRes = await fetch(body.documentUrl)
    if (!pdfRes.ok) {
      res.status(400).json({ error: `Impossible de récupérer le document (${pdfRes.status})` })
      return
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
    if (!pdfBuffer.length) {
      res.status(400).json({ error: 'Document vide' })
      return
    }
    const pdfBase64 = pdfBuffer.toString('base64')

    const ctx = await getDocusignContext()
    const result = await sendEnvelope(ctx, {
      pdfBase64,
      fileName: body.documentName ?? 'Mandat.pdf',
      signerEmail: body.signerEmail,
      signerName: body.signerName,
      emailSubject: body.emailSubject ?? 'KiWee Énergie — Mandat à signer',
      emailMessage: body.emailMessage,
      customFields: [{ name: 'mandat_id', value: body.mandatId }],
    })

    res.status(200).json(result)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur DocuSign inconnue' })
  }
}
