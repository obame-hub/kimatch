import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const STATUT_CODE_PAR_EVENEMENT: Record<string, string> = {
  sent: 'ENVOYE',
  delivered: 'ENVOYE',
  completed: 'SIGNE',
  declined: 'REFUSE',
  voided: 'REVOQUE',
}

interface ConnectPayload {
  event?: string
  data?: {
    envelopeId?: string
    envelopeSummary?: { status?: string }
  }
}

function verifySignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const secret = process.env.DOCUSIGN_CONNECT_HMAC_SECRET
  if (secret) {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const signature = req.headers['x-docusign-signature-1'] as string | undefined
    if (!verifySignature(rawBody, signature, secret)) {
      res.status(401).json({ error: 'Signature invalide' })
      return
    }
  }

  const payload = req.body as ConnectPayload
  const envelopeId = payload?.data?.envelopeId
  const status = payload?.data?.envelopeSummary?.status ?? payload?.event?.replace('envelope-', '')

  if (!envelopeId || !status) {
    res.status(200).json({ ok: true, skipped: true, reason: 'payload incomplet' })
    return
  }

  const statutCode = STATUT_CODE_PAR_EVENEMENT[status]
  if (!statutCode) {
    res.status(200).json({ ok: true, skipped: true, reason: `statut ${status} ignoré` })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Supabase (service role) non configuré côté serveur' })
    return
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: statutRow } = await admin.from('statuts_mandats').select('id').eq('code', statutCode).maybeSingle()
    const { error } = await admin
      .from('mandats')
      .update({ ...(statutRow ? { statut_id: statutRow.id } : {}) })
      .eq('docusign_envelope_id', envelopeId)

    if (error) {
      res.status(502).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true, envelopeId, statutCode })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}
