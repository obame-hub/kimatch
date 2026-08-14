import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { runGrdSyncForMandat } from './_grdSync.js'
import { sendMandatSignedEmail } from './_gmailNotify.js'
import { postMessage, joinChannel } from '../slack/_client.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

/**
 * Vercel analyse le corps JSON et remplit `req.body` par defaut. Il faut l'en empecher : la
 * signature HMAC de DocuSign porte sur les octets EXACTS envoyes, et re-serialiser l'objet
 * analyse ne les redonne pas (espaces, echappements, ordre). C'est ce que faisait ce fichier :
 * toute notification etait rejetee en 401, donc aucun mandat ne passait a « Envoye » ni a
 * « Signe ». Constate le 14/08/2026 sur CABINET MOLINIER -- l'enveloppe etait `completed` chez
 * DocuSign depuis 12:22 alors que le mandat restait « A preparer ».
 */
export const config = { api: { bodyParser: false } }

/** Lit le corps de la requete tel qu'il est arrive, sans transformation. */
async function lireCorpsBrut(req: VercelRequest): Promise<string> {
  const morceaux: Buffer[] = []
  for await (const morceau of req) morceaux.push(typeof morceau === 'string' ? Buffer.from(morceau) : (morceau as Buffer))
  return Buffer.concat(morceaux).toString('utf8')
}

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
    envelopeSummary?: { status?: string; completedDateTime?: string }
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

  const corpsBrut = await lireCorpsBrut(req)

  const secret = process.env.DOCUSIGN_CONNECT_HMAC_SECRET
  if (secret) {
    const signature = req.headers['x-docusign-signature-1'] as string | undefined
    if (!verifySignature(corpsBrut, signature, secret)) {
      // On distingue les deux causes dans le journal : une notification non signee (HMAC desactive
      // dans la configuration Connect) et une signature qui ne correspond pas (mauvaise cle).
      // Sans cela, les deux se presentent comme un 401 muet et se diagnostiquent a l'aveugle.
      console.error('[docusign webhook] signature refusee', {
        enTetePresent: Boolean(req.headers['x-docusign-signature-1']),
        tailleCorps: corpsBrut.length,
      })
      res.status(401).json({ error: 'Signature invalide' })
      return
    }
  }

  let payload: ConnectPayload
  try {
    payload = JSON.parse(corpsBrut) as ConnectPayload
  } catch {
    res.status(400).json({ error: 'Corps JSON illisible' })
    return
  }
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
    // Date de signature : jamais enregistrée avant ce correctif -- prend l'horodatage de complétion
    // fourni par DocuSign (le plus fiable), sinon l'heure de réception du webhook en repli.
    const dateSignature = statutCode === 'SIGNE'
      ? (payload.data?.envelopeSummary?.completedDateTime ?? new Date().toISOString())
      : undefined
    const { data: mandats, error } = await admin
      .from('mandats')
      .update({ ...(statutRow ? { statut_id: statutRow.id } : {}), ...(dateSignature ? { date_signature: dateSignature } : {}) })
      .eq('docusign_envelope_id', envelopeId)
      .select('id, compte_id, proprietaire_id, compte:comptes(nom), proprietaire:profils!mandats_proprietaire_id_fkey(email, prenom, nom)')

    if (error) {
      res.status(502).json({ error: error.message })
      return
    }

    type Raw = {
      id: string
      compte_id: string
      proprietaire_id: string | null
      compte: { nom: string } | { nom: string }[] | null
      proprietaire: { email: string; prenom: string; nom: string } | { email: string; prenom: string; nom: string }[] | null
    }
    const raw = mandats?.[0] as Raw | undefined
    const compteNom = raw ? (Array.isArray(raw.compte) ? raw.compte[0]?.nom : raw.compte?.nom) ?? '(compte inconnu)' : ''
    const proprietaire = raw ? (Array.isArray(raw.proprietaire) ? raw.proprietaire[0] : raw.proprietaire) ?? null : null
    if (statutCode === 'SIGNE' && raw) {
      // Best-effort : la synchro GRD + les notifications ne doivent jamais faire échouer
      // l'accusé de réception du webhook envoyé à DocuSign (sinon DocuSign réessaiera indéfiniment).
      try {
        const summary = await runGrdSyncForMandat(admin, raw.id)
        await notifyMandatSigne(admin, raw.id, compteNom, summary)
        await emailProprietaire(admin, raw.id, compteNom, proprietaire, summary)
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

async function alertGmailDeconnecte(admin: Admin, error: string) {
  const { data: cfg } = await admin.from('parametres_slack').select('channel_id, enabled').eq('module', 'mandat').maybeSingle()
  if (!cfg || !cfg.enabled || !cfg.channel_id) return
  await postMessage(cfg.channel_id, `🔴 Email de récapitulatif mandat non envoyé — ${error}`)
}

async function emailProprietaire(
  admin: Admin,
  mandatId: string,
  compteNom: string,
  proprietaire: { email: string; prenom: string; nom: string } | null,
  summary: { succes: string[]; echecs: { pdl: string; error: string }[] },
) {
  if (!proprietaire?.email) return

  const mandatUrl = `https://kimatch.fr/mandats/${mandatId}`
  const lignes = [
    `Bonjour ${proprietaire.prenom},`,
    '',
    `Le mandat pour ${compteNom} vient d'être signé.`,
    '',
    summary.succes.length ? `PDL synchronisés (Enedis/GRDF) : ${summary.succes.join(', ')}` : 'Aucun PDL synchronisé.',
  ]
  if (summary.echecs.length) {
    lignes.push('', `Échecs de synchro : ${summary.echecs.map((e) => `${e.pdl} (${e.error})`).join(', ')}`)
  }
  lignes.push('', `Voir le mandat : ${mandatUrl}`)

  const result = await sendMandatSignedEmail(admin, {
    to: proprietaire.email,
    subject: `KiWee Énergie — Mandat signé (${compteNom})`,
    text: lignes.join('\n'),
  })
  if (!result.ok) {
    console.error('[docusign-webhook] email récapitulatif mandat échoué', result.error)
    if (result.senderMissing) await alertGmailDeconnecte(admin, result.error)
  }
}
