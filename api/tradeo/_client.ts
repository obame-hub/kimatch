/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CLIENT SERVEUR DE L'API ENERGIEX (TRADEO)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Réunion du 28/09/2026 : Kimatch doit récupérer les PRIX UNITAIRES des fournisseurs — pas des
 * budgets, qui dépendent chacun de la consommation retenue par le fournisseur et ne se comparent
 * pas. Tradeo expose ces prix par son API (documentation v1.4 envoyée par Yanni).
 *
 * Ne jamais importer ce fichier depuis `src/` : les identifiants n'existent que côté serveur.
 *
 * ══ LE JETON ══
 *
 * Tradeo le délivre contre un email et un mot de passe, pour 7 jours, et REND LE MÊME tant qu'il
 * est valide. On le garde donc en mémoire le temps que la fonction reste chaude, et on le redemande
 * au premier 401 : un jeton révoqué côté Tradeo ne bloque ainsi qu'un seul appel. Il n'est écrit
 * nulle part — ni en base, ni dans le journal, ni dans une réponse au navigateur.
 *
 * ══ ON NE LIT PAS LES MESSAGES, ON LIT LE CODE HTTP ══
 *
 * Mesuré le 28/09/2026 sur la pré-production : « Email et mot de passe obligatoires. » là où la
 * documentation annonce « Email et mot de passe requis. ». Un test sur le texte casserait à la
 * première reformulation ; le code HTTP, lui, est un contrat.
 */

const URL_PAR_DEFAUT = 'https://pre-prod-api.tradeo-energie.fr/api'
/* Le calcul de budget interroge tous les fournisseurs de Tradeo : on lui laisse le temps, mais pas
   celui de Vercel. Au-delà, on préfère une erreur lisible à une fonction coupée. */
const DELAI_MS = 50_000

export type CodeErreurTradeo =
  | 'TRADEO_NON_CONFIGURE'
  | 'TRADEO_IDENTIFIANTS_REFUSES'
  | 'TRADEO_INJOIGNABLE'
  | 'TRADEO_DELAI_DEPASSE'

export class ErreurTradeo extends Error {
  constructor(public code: CodeErreurTradeo, message: string) {
    super(message)
  }
}

export function urlTradeo(): string {
  return (process.env.TRADEO_API_URL || URL_PAR_DEFAUT).replace(/\/+$/, '')
}

export function tradeoConfigure(): boolean {
  return Boolean(process.env.TRADEO_EMAIL && process.env.TRADEO_PASSWORD)
}

interface JetonEnCache {
  token: string
  prefixe: string | null
  expiration: string | null
}
let jetonEnCache: JetonEnCache | null = null

export interface ReponseTradeo {
  statut: number
  corps: unknown
  dureeMs: number
}

async function envoyer(chemin: string, init: RequestInit): Promise<ReponseTradeo> {
  const debut = Date.now()
  let reponse: Response
  try {
    reponse = await fetch(`${urlTradeo()}/${chemin}`, { ...init, signal: AbortSignal.timeout(DELAI_MS) })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ErreurTradeo('TRADEO_DELAI_DEPASSE', `Tradeo n'a pas répondu en ${DELAI_MS / 1000} s.`)
    }
    throw new ErreurTradeo('TRADEO_INJOIGNABLE', 'Tradeo est injoignable (réseau ou DNS).')
  }
  const texte = await reponse.text()
  let corps: unknown
  try {
    corps = texte ? JSON.parse(texte) : null
  } catch {
    /* Une page d'erreur HTML (proxy, 502 de leur côté) : on la garde, tronquée, pour la voir. */
    corps = { texte: texte.slice(0, 2000) }
  }
  return { statut: reponse.status, corps, dureeMs: Date.now() - debut }
}

/** Obtient le jeton, depuis le cache ou auprès de Tradeo. */
export async function obtenirJeton(forcer = false): Promise<JetonEnCache> {
  if (jetonEnCache && !forcer) {
    const expire = jetonEnCache.expiration ? Date.parse(jetonEnCache.expiration) : NaN
    // Une heure de marge : un jeton qui expire pendant un calcul ferait échouer ce calcul.
    if (Number.isNaN(expire) || expire - Date.now() > 3600_000) return jetonEnCache
  }
  const email = process.env.TRADEO_EMAIL
  const password = process.env.TRADEO_PASSWORD
  if (!email || !password) {
    throw new ErreurTradeo(
      'TRADEO_NON_CONFIGURE',
      'Les identifiants Tradeo ne sont pas renseignés sur le serveur (TRADEO_EMAIL, TRADEO_PASSWORD).',
    )
  }
  const form = new FormData()
  form.append('email', email)
  form.append('password', password)
  const { statut, corps } = await envoyer('generer_token_api/', { method: 'POST', body: form })
  const c = (corps ?? {}) as { token?: string; prefixe?: string; date_expiration?: string; message?: string }
  if (statut !== 200 || !c.token) {
    jetonEnCache = null
    throw new ErreurTradeo(
      'TRADEO_IDENTIFIANTS_REFUSES',
      `Tradeo refuse les identifiants du serveur (HTTP ${statut}${c.message ? ` : ${c.message}` : ''}).`,
    )
  }
  jetonEnCache = { token: c.token, prefixe: c.prefixe ?? null, expiration: c.date_expiration ?? null }
  return jetonEnCache
}

export type CorpsTradeo =
  | { format: 'multipart'; champs: Record<string, string | { nom: string; type: string; base64: string }> }
  | { format: 'json'; donnees: unknown }
  | { format: 'vide' }

function construireInit(token: string, corps: CorpsTradeo): RequestInit {
  const headers: Record<string, string> = { Authorization: `Api-Key ${token}` }
  if (corps.format === 'json') {
    headers['Content-Type'] = 'application/json'
    return { method: 'POST', headers, body: JSON.stringify(corps.donnees) }
  }
  if (corps.format === 'vide') return { method: 'POST', headers }
  const form = new FormData()
  for (const [cle, valeur] of Object.entries(corps.champs)) {
    if (typeof valeur === 'string') form.append(cle, valeur)
    else form.append(cle, new Blob([Buffer.from(valeur.base64, 'base64')], { type: valeur.type }), valeur.nom)
  }
  return { method: 'POST', headers, body: form }
}

/**
 * Appelle une route Tradeo authentifiée. Un 401 redemande le jeton UNE fois : au-delà, c'est que
 * le compte lui-même est refusé, et réessayer ne ferait que multiplier les appels.
 */
export async function appelerTradeo(chemin: string, corps: CorpsTradeo): Promise<ReponseTradeo> {
  let jeton = await obtenirJeton()
  let reponse = await envoyer(chemin, construireInit(jeton.token, corps))
  if (reponse.statut === 401) {
    jeton = await obtenirJeton(true)
    reponse = await envoyer(chemin, construireInit(jeton.token, corps))
  }
  return reponse
}
