import { createSign } from 'crypto'

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} non configurée`)
  return v
}

async function getJwtAccessToken(): Promise<string> {
  const integrationKey = requireEnv('DOCUSIGN_INTEGRATION_KEY')
  const userId = requireEnv('DOCUSIGN_USER_ID')
  const rsaPem = requireEnv('DOCUSIGN_RSA_PRIVATE_KEY')
  const baseUrl = process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com'
  const aud = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: integrationKey,
    sub: userId,
    aud,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = base64url(signer.sign(rsaPem))
  const assertion = `${signingInput}.${signature}`

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    if (data.error === 'consent_required') {
      throw new Error(
        `consent_required — ouvre https://${aud}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${integrationKey}&redirect_uri=https://kiwee-os.vercel.app et clique "Accept".`,
      )
    }
    throw new Error(`DocuSign token error: ${data.error ?? res.status} — ${data.error_description ?? ''}`)
  }
  return data.access_token
}

interface DocusignContext {
  accessToken: string
  accountId: string
  baseUri: string
}

export async function getDocusignContext(): Promise<DocusignContext> {
  const baseUrl = process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com'
  const accountIdEnv = requireEnv('DOCUSIGN_ACCOUNT_ID')
  const accessToken = await getJwtAccessToken()

  const res = await fetch(`${baseUrl}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = (await res.json()) as { accounts?: { account_id: string; base_uri: string; is_default: boolean }[] }
  if (!res.ok || !data.accounts) throw new Error('DocuSign userinfo failed')
  const account = data.accounts.find((a) => a.account_id === accountIdEnv) ?? data.accounts.find((a) => a.is_default) ?? data.accounts[0]
  if (!account) throw new Error('Aucun compte DocuSign associé à cet utilisateur')
  return { accessToken, accountId: account.account_id, baseUri: account.base_uri }
}

export interface SendEnvelopeDocument {
  pdfBase64: string
  fileName: string
}

export interface SendEnvelopeInput {
  documents: SendEnvelopeDocument[]
  signerEmail: string
  signerName: string
  emailSubject: string
  emailMessage?: string
  customFields?: { name: string; value: string }[]
  /** Si vrai, l'enveloppe est créée en BROUILLON ("created") -- un humain doit ensuite l'envoyer
   * depuis l'éditeur DocuSign (Sender View), jamais un envoi 100% automatique. Même comportement
   * que Tools, sur demande explicite (04/08/2026) -- avant ça Kimatch envoyait direct ("sent"). */
  draft?: boolean
  returnUrl?: string
}

export interface SendEnvelopeResult {
  envelopeId: string
  status: string
  senderViewUrl?: string
}

export async function sendEnvelope(ctx: DocusignContext, input: SendEnvelopeInput): Promise<SendEnvelopeResult> {
  const envelope = {
    emailSubject: input.emailSubject,
    emailBlurb: input.emailMessage ?? '',
    status: input.draft ? 'created' : 'sent',
    documents: input.documents.map((d, i) => ({ documentBase64: d.pdfBase64, name: d.fileName, fileExtension: 'pdf', documentId: String(i + 1) })),
    customFields: input.customFields?.length
      ? { textCustomFields: input.customFields.map((cf) => ({ name: cf.name, value: cf.value, required: 'false', show: 'false' })) }
      : undefined,
    recipients: {
      signers: [
        {
          email: input.signerEmail,
          name: input.signerName,
          recipientId: '1',
          routingOrder: '1',
          localePolicy: { languageCode: 'fr', cultureName: 'fr-FR' },
          // Ancres à motif rare (convention DocuSign classique, reprise de Tools) plutôt que des
          // mots ordinaires ("Signature", "Date") : le texte légal du mandat contient lui-même
          // ces mots en prose ("date de signature", etc.), ce qui créerait de faux tabs partout
          // si on ancrait sur les mots eux-mêmes.
          tabs: {
            signHereTabs: [{ anchorString: '\\s1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-8' }],
            dateSignedTabs: [{ anchorString: '\\d1\\', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-8', font: 'Arial', fontSize: 'Size8' }],
          },
        },
      ],
    },
  }

  const res = await fetch(`${ctx.baseUri}/restapi/v2.1/accounts/${ctx.accountId}/envelopes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  })
  const data = (await res.json()) as { envelopeId?: string; status?: string; message?: string; errorCode?: string }
  if (!res.ok || !data.envelopeId) {
    throw new Error(`DocuSign envelope creation failed: ${data.errorCode ?? res.status} — ${data.message ?? ''}`)
  }

  let senderViewUrl: string | undefined
  if (input.draft) {
    const viewRes = await fetch(`${ctx.baseUri}/restapi/v2.1/accounts/${ctx.accountId}/envelopes/${data.envelopeId}/views/sender`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: input.returnUrl ?? 'https://kimatch.fr' }),
    })
    const viewData = (await viewRes.json()) as { url?: string; message?: string }
    if (viewRes.ok && viewData.url) senderViewUrl = viewData.url
  }

  return { envelopeId: data.envelopeId, status: data.status ?? (input.draft ? 'created' : 'sent'), senderViewUrl }
}
