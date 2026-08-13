import { createHmac, timingSafeEqual } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Flot « Authorization Code Grant » de DocuSign : chaque utilisateur autorise l'application avec
 * SON compte, une fois, et Kimatch conserve son refresh_token (table docusign_sessions).
 *
 * C'est le remplaçant du JWT « impersonation » d'un compte central. Différence pratique : aucune
 * clé RSA, aucun consentement d'administrateur à donner une fois pour toute l'organisation — juste
 * un écran DocuSign par personne, la première fois.
 */

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} non configurée`)
  return v
}

/** Compte de démonstration par défaut : voir la note dans baseUrl() sur le passage en production. */
export function baseUrl(): string {
  return (process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com').replace(/\/$/, '')
}

/** Le scope `extended` est ce qui fait exister un refresh_token de longue durée (30 jours) : sans
 *  lui, DocuSign ne renvoie qu'un access_token de 8 heures et chacun devrait se reconnecter chaque
 *  jour. `signature` donne le droit d'envoyer des enveloppes. */
const SCOPE = 'signature extended'

/** Origines autorisées à recevoir la redirection finale. Même allowlist que le flot Gmail : le
 *  `state` transite par DocuSign, on ne redirige jamais vers une origine arbitraire. */
const ORIGINES_AUTORISEES = ['https://kimatch.fr', 'https://www.kimatch.fr', 'https://kiwee-os.vercel.app']
const ORIGINE_PAR_DEFAUT = 'https://kimatch.fr'

/** L'URL de retour doit figurer à l'identique dans les Redirect URIs de l'application DocuSign. */
export function redirectUri(): string {
  return process.env.DOCUSIGN_OAUTH_REDIRECT_URI ?? `${ORIGINE_PAR_DEFAUT}/api/docusign/callback`
}

function secretHmac(): string {
  // La clé secrète de l'application sert aussi à sceller le `state`. Elle est déjà indispensable au
  // flot, elle ne quitte jamais le serveur : pas de secret supplémentaire à gérer.
  return requireEnv('DOCUSIGN_SECRET_KEY')
}

/** Chemin de retour : uniquement un chemin relatif de cette application. Une URL absolue serait un
 *  open redirect — on ne renvoie jamais l'utilisateur ailleurs que chez nous.
 *
 *  Le repli est « /profil » : c'est la route de la page « Mon profil » (voir App.tsx). Elle valait
 *  « /mon-profil » jusqu'au 13/08/2026, ce qui renvoyait sur une page blanche après l'autorisation
 *  DocuSign — la route n'existe pas. */
function cheminSur(retour: string | undefined): string {
  if (!retour || !retour.startsWith('/') || retour.startsWith('//')) return '/profil'
  return retour
}

/**
 * `state` = profil + origine + horodatage + page de retour, scellé par un HMAC.
 *
 * La signature n'est pas décorative : sans elle, n'importe qui pourrait forger un `state` portant
 * l'identifiant d'un collègue, autoriser SON propre compte DocuSign et se retrouver enregistré
 * comme expéditeur pour ce collègue. C'est le défaut du `state` en clair du flot Gmail
 * (api/gmail/_client.ts), non corrigé là-bas.
 */
export function encodeState(profilId: string, origine: string | undefined, retour?: string): string {
  const sure = origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINE_PAR_DEFAUT
  const charge = `${profilId}|${sure}|${Date.now()}|${cheminSur(retour)}`
  const signature = createHmac('sha256', secretHmac()).update(charge).digest('base64url')
  return `${Buffer.from(charge).toString('base64url')}.${signature}`
}

/** Un `state` non signé, mal signé ou vieux de plus de quinze minutes ne donne aucun profil : le
 *  callback redirige alors vers une erreur au lieu d'écrire une session. */
export function decodeState(state: string | undefined): { profilId?: string; appUrl: string; retour: string } {
  const appUrlParDefaut = { appUrl: ORIGINE_PAR_DEFAUT, retour: '/profil' }
  if (!state || !state.includes('.')) return appUrlParDefaut
  const [chargeB64, signature] = state.split('.')
  let charge: string
  try {
    charge = Buffer.from(chargeB64, 'base64url').toString('utf8')
  } catch {
    return appUrlParDefaut
  }
  const attendue = createHmac('sha256', secretHmac()).update(charge).digest('base64url')
  const a = Buffer.from(signature ?? '')
  const b = Buffer.from(attendue)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return appUrlParDefaut

  const [profilId, origine, horodatage, retour] = charge.split('|')
  const age = Date.now() - Number(horodatage ?? 0)
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) return appUrlParDefaut

  const appUrl = origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINE_PAR_DEFAUT
  return { profilId: profilId || undefined, appUrl, retour: cheminSur(retour) }
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    scope: SCOPE,
    client_id: requireEnv('DOCUSIGN_INTEGRATION_KEY'),
    redirect_uri: redirectUri(),
    state,
  })
  return `${baseUrl()}/oauth/auth?${params.toString()}`
}

interface JetonsDocusign {
  access_token: string
  refresh_token?: string
  expires_in: number
}

/** DocuSign attend les identifiants de l'application en Basic auth, pas dans le corps. */
function enteteBasic(): string {
  const ik = requireEnv('DOCUSIGN_INTEGRATION_KEY')
  const secret = requireEnv('DOCUSIGN_SECRET_KEY')
  return 'Basic ' + Buffer.from(`${ik}:${secret}`).toString('base64')
}

async function appelJeton(corps: Record<string, string>): Promise<JetonsDocusign> {
  const res = await fetch(`${baseUrl()}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: enteteBasic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corps),
  })
  const data = (await res.json()) as JetonsDocusign & { error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`DocuSign OAuth : ${data.error ?? res.status} — ${data.error_description ?? ''}`)
  }
  return data
}

export async function echangerCode(code: string): Promise<JetonsDocusign> {
  return appelJeton({ grant_type: 'authorization_code', code })
}

export async function rafraichirJeton(refreshToken: string): Promise<JetonsDocusign> {
  return appelJeton({ grant_type: 'refresh_token', refresh_token: refreshToken })
}

export interface IdentiteDocusign {
  docusignUserId: string
  email?: string
  nom?: string
  accountId: string
  accountNom?: string
  baseUri: string
}

/** Le compte retenu est celui désigné par DOCUSIGN_ACCOUNT_ID s'il correspond, sinon le compte par
 *  défaut de la personne. base_uri vient de DocuSign : il dépend de la région d'hébergement du
 *  compte et ne se devine pas. */
export async function lireIdentite(accessToken: string): Promise<IdentiteDocusign> {
  const res = await fetch(`${baseUrl()}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = (await res.json()) as {
    sub?: string
    name?: string
    email?: string
    accounts?: { account_id: string; account_name?: string; base_uri: string; is_default: boolean }[]
  }
  // Aucun compte rattaché : la personne a bien un identifiant DocuSign, mais elle n'est membre
  // d'aucun compte de l'organisation — donc aucune licence. Le dire ici évite d'enregistrer une
  // session qui échouerait au premier envoi, avec un message bien plus obscur.
  if (res.ok && data.accounts && data.accounts.length === 0) {
    throw new Error(
      'Ce compte DocuSign n’est rattaché à aucun compte KiWee : il lui manque une licence. Demandez à ' +
        'l’administrateur DocuSign de vous ajouter, puis recommencez la connexion.',
    )
  }
  if (!res.ok || !data.accounts?.length) throw new Error('Lecture du compte DocuSign impossible (userinfo)')
  const souhaite = process.env.DOCUSIGN_ACCOUNT_ID?.trim() || null
  const compte =
    data.accounts.find((a) => a.account_id === souhaite) ?? data.accounts.find((a) => a.is_default) ?? data.accounts[0]
  return {
    docusignUserId: data.sub ?? '',
    email: data.email,
    nom: data.name,
    accountId: compte.account_id,
    accountNom: compte.account_name,
    baseUri: compte.base_uri,
  }
}

/** Client à la clé de service : docusign_sessions n'a aucune politique de lecture, elle n'est
 *  accessible que par le serveur. */
export function clientService(): SupabaseClient {
  const url = requireEnv('VITE_SUPABASE_URL')
  const cle = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, cle)
}

export interface SessionDocusign {
  profil_id: string
  docusign_user_id: string
  docusign_email: string | null
  docusign_nom: string | null
  account_id: string
  account_nom: string | null
  base_uri: string
  access_token: string
  refresh_token: string
  expire_le: string
}

export async function enregistrerSession(
  admin: SupabaseClient,
  profilId: string,
  identite: IdentiteDocusign,
  jetons: JetonsDocusign,
): Promise<void> {
  if (!jetons.refresh_token) {
    throw new Error(
      'DocuSign n’a pas renvoyé de refresh_token : vérifiez que le scope « extended » est bien ' +
        'demandé et autorisé pour l’application.',
    )
  }
  const { error } = await admin.from('docusign_sessions').upsert({
    profil_id: profilId,
    docusign_user_id: identite.docusignUserId,
    docusign_email: identite.email ?? null,
    docusign_nom: identite.nom ?? null,
    account_id: identite.accountId,
    account_nom: identite.accountNom ?? null,
    base_uri: identite.baseUri,
    access_token: jetons.access_token,
    refresh_token: jetons.refresh_token,
    expire_le: new Date(Date.now() + jetons.expires_in * 1000).toISOString(),
    date_modification: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

/** Marqueur reconnu par le front pour proposer « Connecter mon compte DocuSign » plutôt
 *  qu'afficher une erreur technique. */
export const NON_CONNECTE = 'DOCUSIGN_NON_CONNECTE'

/**
 * Session utilisable de l'utilisateur : rafraîchie si l'access_token expire dans moins de cinq
 * minutes. La marge évite qu'un jeton valide au moment du contrôle soit périmé au moment où
 * DocuSign traite l'appel — une enveloppe perdue pour deux secondes d'écart.
 */
export async function sessionUtilisable(admin: SupabaseClient, profilId: string): Promise<SessionDocusign> {
  const { data, error } = await admin.from('docusign_sessions').select('*').eq('profil_id', profilId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(NON_CONNECTE)
  const session = data as SessionDocusign

  const restant = new Date(session.expire_le).getTime() - Date.now()
  if (restant > 5 * 60 * 1000) return session

  let jetons: JetonsDocusign
  try {
    jetons = await rafraichirJeton(session.refresh_token)
  } catch {
    // Refresh token révoqué (déconnexion côté DocuSign) ou dépassé : la seule issue est une
    // nouvelle autorisation. On supprime la session pour que le front propose d'emblée la
    // connexion, au lieu de rejouer un jeton mort à chaque envoi.
    await admin.from('docusign_sessions').delete().eq('profil_id', profilId)
    throw new Error(NON_CONNECTE)
  }

  const expireLe = new Date(Date.now() + jetons.expires_in * 1000).toISOString()
  await admin
    .from('docusign_sessions')
    .update({
      access_token: jetons.access_token,
      // DocuSign renvoie un nouveau refresh_token à chaque rafraîchissement : ne pas l'enregistrer
      // ferait expirer la session au bout de trente jours sans raison visible.
      refresh_token: jetons.refresh_token ?? session.refresh_token,
      expire_le: expireLe,
      date_modification: new Date().toISOString(),
    })
    .eq('profil_id', profilId)

  return { ...session, access_token: jetons.access_token, refresh_token: jetons.refresh_token ?? session.refresh_token, expire_le: expireLe }
}

/** Identifie l'appelant depuis son jeton Supabase, pour savoir de quelle session DocuSign il
 *  s'agit. Le même contrôle que les endpoints Gmail. */
export async function profilAppelant(authHeader: string): Promise<string | null> {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}
