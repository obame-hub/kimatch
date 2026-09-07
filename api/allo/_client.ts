/**
 * ══ CLIENT SERVEUR DE L'API ALLO ══
 *
 * Allo est la téléphonie de KiWee : elle enregistre les appels, les transcrit et les résume. Ce
 * fichier est la seule porte d'entrée vers son API.
 *
 * NE JAMAIS IMPORTER CE FICHIER DEPUIS `src/`. La clé Allo n'a aucun préfixe `VITE_`, donc elle
 * n'existe que côté serveur — et la documentation d'Allo est explicite : « do not expose it in
 * client-side code or public repositories ». Le dépôt de Kimatch est public.
 *
 * ══ CE QUE LA CLÉ DONNE ══
 *
 * Elle ouvre TOUT le compte Allo : lire les appels et leurs enregistrements, lire les transcriptions,
 * envoyer des SMS depuis les numéros de l'entreprise. C'est la même famille de risque que le
 * certificat Enedis — d'où la garde de session sur chaque fonction qui l'utilise, comme depuis
 * l'audit du 28/08/2026.
 *
 * ══ LE SCHÉMA D'AUTHENTIFICATION N'EST PAS `Bearer` ══
 *
 * C'est `Authorization: Api-Key ak_live_…`. Une erreur de schéma renvoie un 401 sans autre
 * explication, et on cherche longtemps.
 */

const BASE_URL = 'https://api.withallo.com'

/** Le nom de la variable, écrit une fois — les messages d'erreur s'y réfèrent. */
const VARIABLE_CLE = 'ALLO_API_KEY'

function cle(): string {
  const k = process.env[VARIABLE_CLE]
  if (!k) throw new Error(`Clé Allo manquante (${VARIABLE_CLE})`)
  return k
}

/**
 * Un appel à l'API Allo.
 *
 * ── LES LIMITES DE DÉBIT SONT REMONTÉES, PAS AVALÉES ──
 * Allo accepte 20 lectures et 5 écritures par seconde et par clé, et répond 429 au-delà en donnant
 * `X-RateLimit-Reset`. Une reprise d'historique de plusieurs milliers d'appels touche ce plafond :
 * `RateLimitAllo` porte le délai à attendre pour que l'appelant puisse s'endormir la bonne durée
 * plutôt que de réessayer à l'aveugle.
 */
export class RateLimitAllo extends Error {
  constructor(public readonly attendreSecondes: number) {
    super(`Limite de débit Allo atteinte, réessayer dans ${attendreSecondes} s`)
    this.name = 'RateLimitAllo'
  }
}

async function requete<T>(
  chemin: string,
  options: { methode?: 'GET' | 'POST'; corps?: unknown } = {},
): Promise<T> {
  const reponse = await fetch(`${BASE_URL}${chemin}`, {
    method: options.methode ?? 'GET',
    headers: {
      Authorization: `Api-Key ${cle()}`,
      ...(options.corps ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.corps ? JSON.stringify(options.corps) : undefined,
  })

  if (reponse.status === 429) {
    const reset = Number(reponse.headers.get('X-RateLimit-Reset'))
    throw new RateLimitAllo(Number.isFinite(reset) && reset > 0 ? reset : 1)
  }

  if (!reponse.ok) {
    // LE CORPS DE L'ERREUR EST REMONTÉ, TRONQUÉ. Un « 400 » nu ne dit pas quel champ est refusé, et
    // c'est toujours un champ. Tronqué parce qu'une erreur peut renvoyer une page entière.
    const texte = await reponse.text().catch(() => '')
    throw new Error(`Allo ${reponse.status} sur ${chemin}${texte ? ` — ${texte.slice(0, 300)}` : ''}`)
  }

  return (await reponse.json()) as T
}

/* ════════════════════════════════ CE QU'UN APPEL CONTIENT ════════════════════════════════ */

export interface ContactAllo {
  id: string
  name: string | null
  company: { id: string; name: string } | null
  deals?: { id: string; name: string; status: string }[]
}

export interface LigneTranscription {
  /** `USER` : quelqu'un de KiWee. `EXTERNAL` : le correspondant. */
  source: 'USER' | 'EXTERNAL'
  time: string
  text: string
}

/**
 * Un élément de conversation : un appel ou un SMS.
 *
 * Les champs qui ne concernent qu'un des deux types valent `null` sur l'autre — `duration` et
 * `result` sont nuls sur un SMS, `content` et `status` le sont sur un appel. C'est la forme d'Allo,
 * gardée telle quelle : la traduire ici ferait un deuxième vocabulaire à apprendre.
 */
export interface ItemAllo {
  id: string
  type: 'CALL' | 'SMS'
  direction: 'INBOUND' | 'OUTBOUND'
  /** Le numéro de KiWee qui a servi. */
  allo_number: string
  /** Le numéro du correspondant, en E.164 — la clé du rattachement à un contact Kimatch. */
  contact_number: string
  contacts: ContactAllo[]
  /** Qui a décroché ou appelé, côté KiWee. */
  user: { id: string; name: string | null; email: string | null } | null
  date: string
  duration: number | null
  result: 'ANSWERED' | 'VOICEMAIL' | 'TRANSFERRED' | null
  /** Absent si l'enregistrement est désactivé, ou si l'appel n'a pas été décroché. */
  recording_url: string | null
  /** Le résumé produit par l'IA d'Allo. Absent quand elle n'a rien produit. */
  summary: string | null
  /**
   * Les étiquettes posées par l'IA ou par la personne. RELEVÉES SUR LES DONNÉES le 04/09/2026, sur
   * 200 appels dont 94 en portent : `interested`, `follow_up_later`, `to_call_back`,
   * `not_interested`, `meeting_booked`.
   *
   * Ce vocabulaire recouvre presque exactement `issues_interactions` de Kimatch : c'est par là que
   * passera la correspondance, et non par une invention de notre côté. La liste n'est pas fermée —
   * une étiquette inconnue se garde telle quelle plutôt que de se perdre.
   */
  tags: string[] | null
  /** N'arrive QUE si la requête demande `extend: 'transcript'`. `null` sinon — pas « pas de transcription ». */
  transcript: LigneTranscription[] | null
  /**
   * ══ LA FICHE DU CORRESPONDANT, EXTRAITE DE L'APPEL PAR L'IA D'ALLO ══
   *
   * ABSENT DE LA DOCUMENTATION PUBLIQUE. Trouvé le 04/09/2026 en sondant le vrai compte : le premier
   * appel lu renvoyait le nom, la fonction et la société de la personne au bout du fil, déduits de
   * la conversation — « Magdalena RYBKA-BERTRAND, Assistante commerciale, GAZ EUROPEEN ».
   *
   * C'est la donnée la plus intéressante de l'API pour Kimatch, et la plus dangereuse : elle est
   * DEDUITE d'une transcription automatique, elle n'est pas déclarée. Elle peut proposer de créer ou
   * compléter un contact ; elle ne doit jamais écraser une valeur saisie par quelqu'un.
   *
   * Non documenté veut aussi dire non garanti : le champ peut disparaître ou changer de forme sans
   * préavis. Tout ce qui le lit doit survivre à son absence.
   */
  extracted_data?: {
    contact?: {
      name?: string
      emails?: string[]
      address?: string
      company?: string
      website?: string
      job_title?: string
    }
  } | null
  /** Second champ non documenté, vide sur tous les appels sondés le 04/09/2026. À surveiller. */
  data_collected?: Record<string, unknown> | null
  content: string | null
  status: string | null
  message_type: string | null
}

export interface PageItems {
  data: ItemAllo[]
  pagination: { page: number; size: number; total_count: number; total_pages: number; has_more: boolean }
}

export interface FiltreItems {
  date?: { from?: string; to?: string }
  direction?: 'INBOUND' | 'OUTBOUND'
  type?: 'CALL' | 'SMS' | 'ALL'
  result?: 'ANSWERED' | 'VOICEMAIL' | 'TRANSFERRED'
  user_id?: string
  allo_number?: string
  contact_number?: string
  tags?: string[]
  search?: string
  sort?: 'DATE_DESC' | 'DATE_ASC' | 'RELEVANCE'
  /** `transcript` pour obtenir les transcriptions. Coûte en volume : à ne demander que si on les garde. */
  extend?: 'transcript'
  page?: number
  /** 100 au maximum, refusé au-delà. */
  size?: number
}

/** Une page d'appels et de SMS, filtrée. C'est l'endpoint de la reprise d'historique. */
export function chercherItems(filtre: FiltreItems): Promise<PageItems> {
  return requete<PageItems>('/v2/api/conversations/items/search', { methode: 'POST', corps: filtre })
}

/** Le compte auquel la clé donne accès. Sert à vérifier qu'elle est valide et bien posée. */
export function moi(): Promise<unknown> {
  return requete<unknown>('/v2/api/me')
}

/** Les numéros de l'entreprise chez Allo. */
export function numeros(): Promise<unknown> {
  return requete<unknown>('/v2/api/numbers')
}

/** Les utilisateurs Allo — à rapprocher des profils Kimatch pour savoir qui a décroché. */
export function utilisateurs(): Promise<unknown> {
  return requete<unknown>('/v2/api/users')
}

/** Vrai si la clé est configurée. À utiliser avant d'appeler quoi que ce soit d'autre. */
export function cleConfiguree(): boolean {
  return Boolean(process.env[VARIABLE_CLE])
}
