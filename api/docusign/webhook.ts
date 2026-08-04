import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { runGrdSyncForMandat } from './_grdSync.js'
import { postMessage, joinChannel } from '../slack/_client.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

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
    const { data: mandats, error } = await admin
      .from('mandats')
      .update({ ...(statutRow ? { statut_id: statutRow.id } : {}) })
      .eq('docusign_envelope_id', envelopeId)
      .select('id, compte_id, compte:comptes(nom)')

    if (error) {
      res.status(502).json({ error: error.message })
      return
    }

    const raw = mandats?.[0] as { id: string; compte_id: string; compte: { nom: string } | { nom: string }[] | null } | undefined
    const compteNom = raw ? (Array.isArray(raw.compte) ? raw.compte[0]?.nom : raw.compte?.nom) ?? '(compte inconnu)' : ''
    if (statutCode === 'SIGNE' && raw) {
      // Best-effort : la synchro GRD + la notification ne doivent jamais faire échouer l'accusé
      // de réception du webhook envoyé à DocuSign (sinon DocuSign réessaiera indéfiniment).
      try {
        const summary = await runGrdSyncForMandat(admin, raw.id)
        await notifyMandatSigne(admin, raw.id, compteNom, summary)
      } catch (syncErr) {
        console.error('[docusign-webhook] synchro GRD post-signature échouée', syncErr)
      }
    }

    res.status(200).json({ ok: true, envelopeId, statutCode })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}

async function notifyMandatSigne(
  admin: Admin,
  mandatId: string,
  compteNom: string,
  summary: { succes: string[]; echecs: { pdl: string; error: string }[] },
) {
  const { data: cfg } = await admin.from('parametres_slack').select('channel_id, enabled').eq('module', 'mandat').maybeSingle()
  if (!cfg || !cfg.enabled || !cfg.channel_id) return

  const mandatUrl = `https://kimatch.fr/mandats/${mandatId}`
  const lignes = [`*Mandat signé — <${mandatUrl}|${compteNom}>*`]
  if (summary.succes.length) lignes.push(`✅ Synchronisés : ${summary.succes.join(', ')}`)
  if (summary.echecs.length) lignes.push(`⚠️ Échecs : ${summary.echecs.map((e) => `${e.pdl} (${e.error})`).join(', ')}`)
  const text = `✅ Mandat signé — ${compteNom} — synchro GRD lancée automatiquement`
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: lignes.join('\n') } }]

  let result = await postMessage(cfg.channel_id, text, blocks)
  if (!result.ok && result.error === 'not_in_channel') {
    const join = await joinChannel(cfg.channel_id)
    if (join.ok) result = await postMessage(cfg.channel_id, text, blocks)
  }
  if (!result.ok) console.error('[docusign-webhook] notification Slack mandat échouée', result.error)
}
