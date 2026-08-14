import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sessionQuelconque } from './_oauth.js'
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

  // La signature HMAC ne fait plus autorite a elle seule.
  //
  // Elle a bloque toutes les notifications pendant des semaines : 25 echecs enregistres cote
  // DocuSign, tous en 401, dont l'enveloppe signee de CABINET MOLINIER. Deux causes se sont
  // succedees -- la verification portait sur une re-serialisation du corps au lieu des octets
  // recus, puis la cle DOCUSIGN_CONNECT_HMAC_SECRET s'est revelee differente de celle configuree
  // dans Connect. Dans les deux cas le resultat etait le meme : aucun mandat ne passait a « Signe »,
  // en silence, et personne ne pouvait le deviner depuis l'application.
  //
  // On ne fait donc plus confiance au CONTENU de la notification, signee ou non : on en extrait le
  // seul identifiant d'enveloppe, puis on demande son vrai statut a DocuSign. Une notification
  // forgee ne peut alors rien affirmer -- au pire elle declenche une resynchronisation d'un mandat
  // existant avec la verite de DocuSign. Une signature valide reste un bon signe, elle est
  // journalisee, mais son absence ne fait plus perdre un statut.
  const secret = process.env.DOCUSIGN_CONNECT_HMAC_SECRET
  const signatureValide = secret
    ? verifySignature(corpsBrut, req.headers['x-docusign-signature-1'] as string | undefined, secret)
    : null

  let payload: ConnectPayload
  try {
    payload = JSON.parse(corpsBrut) as ConnectPayload
  } catch {
    res.status(400).json({ error: 'Corps JSON illisible' })
    return
  }
  const envelopeId = payload?.data?.envelopeId
  if (!envelopeId) {
    res.status(200).json({ ok: true, skipped: true, reason: 'aucun identifiant d’enveloppe' })
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

    // L'enveloppe doit correspondre a un mandat connu : c'est la premiere barriere, avant meme
    // d'appeler DocuSign.
    const { data: mandatConnu } = await admin
      .from('mandats')
      .select('id, cree_par_id, proprietaire_id')
      .eq('docusign_envelope_id', envelopeId)
      .maybeSingle()
    if (!mandatConnu) {
      res.status(200).json({ ok: true, skipped: true, reason: 'enveloppe inconnue' })
      return
    }

    const session = await sessionQuelconque(admin, mandatConnu.proprietaire_id ?? mandatConnu.cree_par_id)
    if (!session) {
      // Sans session DocuSign, impossible de verifier quoi que ce soit. On refuse plutot que
      // d'appliquer un statut non verifie, et on repond 200 pour que DocuSign ne rejoue pas
      // indefiniment une notification que nous ne saurons pas traiter davantage la prochaine fois.
      console.error('[docusign webhook] aucune session DocuSign disponible pour verifier', { envelopeId })
      res.status(200).json({ ok: true, skipped: true, reason: 'aucune session DocuSign pour vérifier' })
      return
    }

    // La verite vient de DocuSign, pas du corps de la requete.
    const envRes = await fetch(`${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const env = (await envRes.json()) as { status?: string; completedDateTime?: string; sentDateTime?: string }
    if (!envRes.ok || !env.status) {
      res.status(502).json({ error: 'Statut DocuSign illisible' })
      return
    }
    const status = env.status
    const statutCode = STATUT_CODE_PAR_EVENEMENT[status]
    console.log('[docusign webhook] enveloppe verifiee', { envelopeId, status, signatureValide })
    if (!statutCode) {
      res.status(200).json({ ok: true, skipped: true, reason: `statut ${status} ignoré` })
      return
    }
    const { data: statutRow } = await admin.from('statuts_mandats').select('id').eq('code', statutCode).maybeSingle()
    // Horodatages pris sur l'enveloppe verifiee, pas sur la notification : ce sont les memes que
    // ceux de la piste d'audit DocuSign.
    const dateSignature = statutCode === 'SIGNE' ? (env.completedDateTime ?? new Date().toISOString()) : undefined
    const dateEnvoi = env.sentDateTime ?? undefined
    const { data: mandats, error } = await admin
      .from('mandats')
      .update({
        ...(statutRow ? { statut_id: statutRow.id } : {}),
        ...(dateSignature ? { date_signature: dateSignature } : {}),
        ...(dateEnvoi ? { date_envoi: dateEnvoi } : {}),
      })
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
        await archiverDocumentSigne(admin, session, envelopeId, raw.id, compteNom)
      } catch (docErr) {
        console.error('[docusign-webhook] archivage du mandat signé échoué', docErr)
      }
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

/**
 * Depose le mandat signe dans les fichiers du mandat.
 *
 * Sans cela, le document signe n'existe nulle part dans Kimatch : la configuration Connect est en
 * `includeDocuments: false` (elle transporte les evenements, pas les PDF), et rien n'allait le
 * chercher. Signale le 14/08/2026 : « le mandat n'est nulle part dans le fichier ».
 *
 * On telecharge la version combinee -- tous les documents de l'enveloppe et le certificat de
 * signature en un seul PDF, c'est exactement ce qu'on veut conserver comme preuve.
 *
 * Le depot passe par la cle de service : le bucket « documents » n'accorde aucune ecriture aux
 * utilisateurs, et il n'a pas a en accorder pour cet usage puisque c'est le serveur qui archive.
 */
async function archiverDocumentSigne(
  admin: Admin,
  session: { base_uri: string; account_id: string; access_token: string },
  envelopeId: string,
  mandatId: string,
  compteNom: string,
) {
  // Deja archive : le webhook peut etre rejoue plusieurs fois pour la meme enveloppe.
  const { data: existant } = await admin
    .from('documents')
    .select('id')
    .eq('entite_type', 'mandat')
    .eq('entite_id', mandatId)
    .eq('nom', 'Mandat signé')
    .maybeSingle()
  if (existant) return

  const res = await fetch(
    `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${envelopeId}/documents/combined`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  )
  if (!res.ok) throw new Error(`téléchargement du document signé refusé (${res.status})`)
  const pdf = Buffer.from(await res.arrayBuffer())
  if (!pdf.length) throw new Error('document signé vide')

  const url = process.env.VITE_SUPABASE_URL as string
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const nomFichier = `Mandat_signe_${compteNom.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`
  const chemin = `mandats/${mandatId}/${nomFichier}`
  const depot = await fetch(`${url}/storage/v1/object/documents/${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: new Uint8Array(pdf),
  })
  if (!depot.ok) throw new Error(`dépôt dans le stockage refusé (${depot.status})`)

  const { data: typeDoc } = await admin.from('types_documents').select('id').eq('code', 'MANDAT').maybeSingle()
  const { error } = await admin.from('documents').insert({
    ...(typeDoc ? { type_document_id: typeDoc.id } : {}),
    nom: 'Mandat signé',
    nom_fichier: nomFichier,
    url: `${url}/storage/v1/object/public/documents/${chemin}`,
    mime_type: 'application/pdf',
    taille_octets: pdf.length,
    entite_type: 'mandat',
    entite_id: mandatId,
  })
  if (error) throw new Error(error.message)
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
