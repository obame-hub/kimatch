function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} non configurée`)
  return v
}

const REDIRECT_URI = 'https://kiwee-os.vercel.app/api/gmail/callback'
// `userinfo.email` est INDISPENSABLE en plus de `gmail.send` : le callback lit l'adresse du compte
// connecté via /oauth2/v2/userinfo, qui refuse l'appel sans ce scope. Sans lui la connexion échoue
// systématiquement sur « Impossible de récupérer l'adresse Gmail connectée ». Mêmes scopes que la
// fonction gmail-auth de Tools.
const SCOPE = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email'

export function buildGoogleAuthUrl(state: string): string {
  const clientId = requireEnv('GMAIL_CLIENT_ID')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const clientId = requireEnv('GMAIL_CLIENT_ID')
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const data = (await res.json()) as GoogleTokens & { error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`Échange de code Google échoué: ${data.error ?? res.status} — ${data.error_description ?? ''}`)
  }
  return data
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const clientId = requireEnv('GMAIL_CLIENT_ID')
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`Rafraîchissement du token Google échoué: ${data.error ?? res.status} — ${data.error_description ?? ''}`)
  }
  return { access_token: data.access_token, expires_in: data.expires_in ?? 3600 }
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = (await res.json()) as { email?: string }
  if (!res.ok || !data.email) throw new Error("Impossible de récupérer l'adresse Gmail connectée")
  return data.email
}

function base64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export interface SendGmailInput {
  fromEmail: string
  to: string
  subject: string
  text: string
}

export async function sendGmailMessage(accessToken: string, input: SendGmailInput): Promise<{ id: string }> {
  const message = [
    `From: ${input.fromEmail}`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.text,
  ].join('\r\n')

  const raw = base64url(message)
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  const data = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || !data.id) {
    throw new Error(`Envoi Gmail échoué: ${data.error?.message ?? res.status}`)
  }
  return { id: data.id }
}
