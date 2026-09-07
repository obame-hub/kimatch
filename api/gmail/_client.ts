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

/** Origines autorisées à recevoir la redirection finale du flot OAuth. Allowlist volontaire : le
 * `state` transite par Google et revient côté client, on ne redirige donc jamais vers une origine
 * arbitraire (open redirect). */
const ORIGINES_AUTORISEES = [
  'https://kimatch.fr',
  'https://www.kimatch.fr',
  'https://kiwee-os.vercel.app',
]
const ORIGINE_PAR_DEFAUT = 'https://kimatch.fr'

/** `state` = identifiant du profil + origine de départ, pour revenir sur le domaine d'où
 * l'utilisateur a lancé la connexion. Sans ça le callback renvoyait tout le monde sur
 * kiwee-os.vercel.app, même en partant de kimatch.fr. */
export function encodeState(profilId: string, origine: string | undefined): string {
  const sure = origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINE_PAR_DEFAUT
  return `${profilId}|${sure}`
}

export function decodeState(state: string | undefined): { profilId?: string; appUrl: string } {
  const [profilId, origine] = (state ?? '').split('|')
  const appUrl = origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINE_PAR_DEFAUT
  return { profilId: profilId || undefined, appUrl }
}

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
  cc?: string | null
  bcc?: string | null
  subject: string
  /** Le corps en texte brut. Sert de repli pour les clients qui n'affichent pas l'HTML. */
  text: string
  /** Le corps en HTML, signature comprise. Absent, le mail part en texte seul. */
  html?: string | null
  /**
   * Le fil Gmail auquel rattacher ce message.
   *
   * Sans lui, une réponse ouvre une nouvelle conversation dans la boîte du client et le fil se
   * découpe en messages isolés — le contraire de ce qu'on attend d'une réponse.
   */
  threadId?: string | null
}

/**
 * ══ LE MESSAGE ENVOYÉ À GMAIL ══
 *
 * ── POURQUOI L'ENVOI PASSE PAR GMAIL ET NON PAR UN SERVEUR À NOUS ──
 *
 * Naoëlle, 07/09/2026 : « même si on l'écrit depuis Kimatch et l'envoie depuis Kimatch, on le voit
 * dans nos mails envoyés de Gmail, et quand on reçoit la réponse on la reçoit sur notre Gmail. »
 *
 * C'est précisément ce que fait l'API Gmail et que ne ferait aucun autre envoi : le message atterrit
 * dans les « Envoyés » de la personne, le client répond à son adresse, et le fil se reconstitue chez
 * elle sans que Kimatch ait à s'en mêler. Un envoi par un service tiers partirait « au nom de »
 * quelqu'un, sans trace dans sa boîte, et les réponses arriveraient ailleurs.
 *
 * ── LE CORPS EST EN BASE64, PAS EN 7BIT ──
 *
 * Même choix que dans Cockpit, et pour une raison concrète : en 7bit, Gmail casse les lignes longues
 * et abîme les caractères accentués. Le base64 coupé tous les 76 caractères (RFC 2045) passe intact,
 * accents compris — et une signature HTML tient rarement sur des lignes courtes.
 *
 * ── DEUX VERSIONS DU CORPS ──
 *
 * `multipart/alternative` porte le texte et l'HTML : chaque client affiche celle qu'il sait lire.
 * N'envoyer que l'HTML marche en pratique, mais coûte un point de réputation anti-spam et rend le
 * mail illisible dans les rares clients en texte seul.
 */
export async function sendGmailMessage(
  accessToken: string,
  input: SendGmailInput,
): Promise<{ id: string; threadId: string | null }> {
  const enTetes = [
    `From: ${input.fromEmail}`,
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : null,
    input.bcc ? `Bcc: ${input.bcc}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
  ].filter((l): l is string => l !== null)

  const enBase64 = (contenu: string) =>
    Buffer.from(contenu, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')

  let message: string
  if (input.html && input.html.trim()) {
    // Une frontière improbable dans un corps de mail : Gmail refuse le message si elle y apparaît.
    const limite = `----kimatch-${Date.now().toString(36)}`
    message = [
      ...enTetes,
      `Content-Type: multipart/alternative; boundary="${limite}"`,
      '',
      `--${limite}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      enBase64(input.text),
      '',
      `--${limite}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      enBase64(input.html),
      '',
      `--${limite}--`,
    ].join('\r\n')
  } else {
    message = [
      ...enTetes,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      enBase64(input.text),
    ].join('\r\n')
  }

  const corps: Record<string, unknown> = { raw: base64url(message) }
  if (input.threadId) corps.threadId = input.threadId

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const data = (await res.json()) as { id?: string; threadId?: string; error?: { message?: string } }
  if (!res.ok || !data.id) {
    throw new Error(`Envoi Gmail échoué: ${data.error?.message ?? res.status}`)
  }
  return { id: data.id, threadId: data.threadId ?? null }
}
