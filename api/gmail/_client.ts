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
/* ══ `gmail.readonly` EN PLUS, DEPUIS LE 14/09/2026 ══
   William : « il faut un tracking sur les mails qu'on envoie ET REÇOIT ». La réponse d'un client
   arrive dans la boîte de l'expéditeur ; pour la ramener dans Kimatch il faut un droit de lecture,
   et l'accord précédent ne portait que l'envoi.

   GOOGLE N'OFFRE PAS PLUS FIN : il n'existe pas de droit « lire seulement les conversations que
   cette application a ouvertes ». C'est toute la boîte ou rien. La restriction est donc dans notre
   code — `api/gmail/rapatrier.ts` ne demande que les fils dont Kimatch connaît l'identifiant — et
   non dans l'autorisation. C'est une discipline, il faut la dire plutôt que la sous-entendre.

   CONSÉQUENCE : les 9 personnes déjà connectées doivent refaire la connexion. Un jeton ne gagne
   pas un droit après coup. En attendant, leurs envois partent normalement ; seules leurs réponses
   ne rentrent pas, et `profils_gmail_tokens.lecture_autorisee` retient laquelle en est où. */
const SCOPE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

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
  /* CE QUE GOOGLE A RÉELLEMENT ACCORDÉ, séparé par des espaces. Ce n'est pas forcément ce qu'on a
     demandé : l'écran de consentement laisse décocher une case, et un compte d'entreprise peut
     restreindre un droit. La seule source de vérité est donc cette réponse-là. */
  scope?: string
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
  /**
   * Les pièces jointes, déjà téléchargées et encodées par l'appelant.
   *
   * `contenu` est du base64 BRUT, sans retour à la ligne : c'est ici qu'on le replie à 76
   * caractères, comme le reste du message.
   */
  attachments?: { filename: string; mimeType: string; contenu: string }[]
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

  /**
   * ══ LE CORPS, ET SEULEMENT LE CORPS ══
   *
   * `multipart/alternative` porte les deux lectures du même texte — le client choisit. Il ne peut
   * pas porter de fichier : une pièce jointe n'est pas une variante du message, c'est autre chose
   * à côté. D'où l'emboîtement plus bas, qui reste sans effet quand il n'y a rien à joindre.
   */
  const corpsDuMessage = (): string[] => {
    if (input.html && input.html.trim()) {
      // Une frontière improbable dans un corps de mail : Gmail refuse le message si elle y apparaît.
      const limite = `----kimatch-alt-${Date.now().toString(36)}`
      return [
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
      ]
    }
    return [
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      enBase64(input.text),
    ]
  }

  const pieces = input.attachments ?? []

  let message: string
  if (pieces.length > 0) {
    /* ══ AVEC PIÈCES JOINTES : `multipart/mixed` ENVELOPPE LE RESTE ══
     *
     * La structure est imbriquée et l'ordre compte : le corps EN PREMIER, les fichiers ensuite.
     * Un client qui trouve un fichier avant le texte affiche le mail comme une pièce jointe sans
     * message.
     *
     * `Content-Disposition: attachment` plutôt qu'`inline` : sans lui, une image se colle au milieu
     * du texte au lieu de rester un fichier à télécharger — ce n'est pas ce qu'on a demandé en
     * cliquant sur le trombone.
     *
     * Le nom de fichier est encodé en base64 UTF-8 comme l'objet : « Mandat Kiwee — Résidence
     * Béranger.pdf » arriverait autrement en « Mandat Kiwee ? R?sidence B?ranger.pdf ».
     */
    const limite = `----kimatch-mix-${Date.now().toString(36)}`
    message = [
      ...enTetes,
      `Content-Type: multipart/mixed; boundary="${limite}"`,
      '',
      `--${limite}`,
      ...corpsDuMessage(),
      '',
      ...pieces.flatMap((p) => [
        `--${limite}`,
        `Content-Type: ${p.mimeType}; name="=?UTF-8?B?${Buffer.from(p.filename, 'utf-8').toString('base64')}?="`,
        `Content-Disposition: attachment; filename="=?UTF-8?B?${Buffer.from(p.filename, 'utf-8').toString('base64')}?="`,
        'Content-Transfer-Encoding: base64',
        '',
        p.contenu.replace(/(.{76})/g, '$1\r\n'),
        '',
      ]),
      `--${limite}--`,
    ].join('\r\n')
  } else if (input.html && input.html.trim()) {
    message = [...enTetes, ...corpsDuMessage()].join('\r\n')
  } else {
    message = [...enTetes, ...corpsDuMessage()].join('\r\n')
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LIRE UN FIL DE CONVERSATION
   ════════════════════════════════════════════════════════════════════════════════════════════════

   Ajouté le 14/09/2026 pour rapatrier les réponses. On ne demande QUE des fils dont Kimatch
   connaît l'identifiant — ceux qu'il a lui-même ouverts en envoyant un mail. Google ne sait pas
   restreindre un jeton à cela ; c'est donc une discipline de ce code, et le point d'entrée unique
   ci-dessous est ce qui la rend vérifiable d'un coup d'œil. */

export interface MessageGmail {
  id: string
  threadId: string
  /** Vrai quand le message vient de l'extérieur : c'est une réponse, pas notre propre envoi. */
  entrant: boolean
  date: string
  objet: string
  de: string
  a: string
  /** Le texte du message, sans les citations du fil précédent quand on sait les couper. */
  texte: string
}

/** `404` = fil supprimé chez la personne, `403` = droit de lecture non accordé. Les deux se
 *  distinguent parce qu'ils appellent des suites opposées : oublier le fil, ou demander un accord. */
export class ErreurLectureGmail extends Error {
  constructor(public readonly statut: number, message: string) {
    super(message)
    this.name = 'ErreurLectureGmail'
  }
}

function enTete(entetes: { name: string; value: string }[] | undefined, nom: string): string {
  const t = (entetes ?? []).find((h) => h.name.toLowerCase() === nom.toLowerCase())
  return t?.value ?? ''
}

/**
 * Le texte lisible d'un message, en descendant les parties MIME.
 *
 * On préfère `text/plain` : l'HTML d'un mail traîne des tableaux de mise en page et des styles qui
 * n'apprennent rien à qui relit un échange. À défaut on déshabille l'HTML, ce qui est grossier mais
 * reste lisible — et c'est mieux qu'une ligne vide.
 */
function texteDuMessage(charge: Record<string, unknown> | undefined): string {
  if (!charge) return ''
  const partie = charge as {
    mimeType?: string
    body?: { data?: string }
    parts?: Record<string, unknown>[]
  }
  const decode = (d?: string) => (d ? Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8') : '')

  if (partie.mimeType === 'text/plain' && partie.body?.data) return decode(partie.body.data)
  if (partie.parts) {
    for (const p of partie.parts) {
      const t = texteDuMessage(p)
      if (t) return t
    }
  }
  if (partie.mimeType === 'text/html' && partie.body?.data) {
    return decode(partie.body.data)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return ''
}

/**
 * LES CITATIONS DU FIL PRÉCÉDENT SONT COUPÉES.
 *
 * Une réponse de trois lignes traîne l'échange entier en dessous. Les garder ferait que chaque
 * message d'un fil de six contienne les cinq précédents — l'activité deviendrait illisible, et la
 * même phrase apparaîtrait six fois dans une carte qui les empile déjà.
 *
 * On coupe sur les marqueurs que Gmail et Outlook posent en français comme en anglais. Ce qui passe
 * au travers reste tronqué à 8 000 caractères plus loin : on ne cherche pas la perfection, on
 * cherche à ce que la première lecture montre la réponse et pas l'historique.
 */
const MARQUEURS_CITATION = [
  /^\s*Le .+ a écrit\s*:/m,
  /^\s*On .+ wrote\s*:/m,
  /^\s*-{2,}\s*Message d'origine\s*-{2,}/mi,
  /^\s*-{2,}\s*Original Message\s*-{2,}/mi,
  /^\s*De\s*:.*\n\s*Envoyé\s*:/mi,
  /^\s*From\s*:.*\n\s*Sent\s*:/mi,
  /^\s*_{10,}\s*$/m,
]

export function sansCitation(texte: string): string {
  let fin = texte.length
  for (const m of MARQUEURS_CITATION) {
    const trouve = texte.search(m)
    if (trouve >= 0 && trouve < fin) fin = trouve
  }
  /* Un message QUI N'EST QUE citation garde son texte entier : couper à zéro rendrait une carte
     vide, et mieux vaut trop que rien quand on relit un échange. */
  const coupe = texte.slice(0, fin).trim()
  return coupe.length > 0 ? coupe : texte.trim()
}

/** Les messages d'un fil, du plus ancien au plus récent, tels que Gmail les connaît. */
export async function lireFilGmail(
  accessToken: string,
  threadId: string,
  adressePropre: string,
): Promise<MessageGmail[]> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) {
    const corps = await res.text().catch(() => '')
    throw new ErreurLectureGmail(res.status, `Gmail ${res.status} — ${corps.slice(0, 300)}`)
  }
  const fil = (await res.json()) as {
    messages?: {
      id: string
      threadId: string
      internalDate?: string
      payload?: { headers?: { name: string; value: string }[] } & Record<string, unknown>
    }[]
  }

  const propre = adressePropre.trim().toLowerCase()
  return (fil.messages ?? []).map((m) => {
    const entetes = m.payload?.headers
    const de = enTete(entetes, 'From')
    /* ENTRANT = CE QUI NE VIENT PAS DE NOUS. On compare sur l'adresse, pas sur le libellé :
       « Fabien DUBARRY <f.dubarry@kiwee-energie.fr> » et « f.dubarry@kiwee-energie.fr » sont la
       même personne, et seule la seconde forme est stable. */
    const entrant = !de.toLowerCase().includes(propre)
    const brut = texteDuMessage(m.payload)
    return {
      id: m.id,
      threadId: m.threadId,
      entrant,
      date: m.internalDate
        ? new Date(Number(m.internalDate)).toISOString()
        : new Date().toISOString(),
      objet: enTete(entetes, 'Subject'),
      de,
      a: enTete(entetes, 'To'),
      texte: sansCitation(brut),
    }
  })
}
