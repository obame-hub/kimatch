// Client serveur pour l'API Ellisphere (data-access-gateway).
// Ne jamais importer ce fichier depuis le code front (src/) — les identifiants
// ne doivent exister que côté serveur (variables d'env sans préfixe VITE_).

import { XMLParser } from 'fast-xml-parser'

const BASE_URL = 'https://services.data-access-gateway.com/1/rest'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'company' || name === 'establishment',
})

function credentials() {
  const contractId = process.env.ELLISPHERE_CONTRACT_ID
  const userId = process.env.ELLISPHERE_USER_ID
  const password = process.env.ELLISPHERE_PASSWORD
  if (!contractId || !userId || !password) {
    throw new Error('Identifiants Ellisphere manquants (ELLISPHERE_CONTRACT_ID / ELLISPHERE_USER_ID / ELLISPHERE_PASSWORD)')
  }
  return { contractId, userId, password }
}

function adminBlock(appId: 'WSOM' | 'WSRISK') {
  const { contractId, userId, password } = credentials()
  const date = new Date().toISOString().replace(/\.\d+Z$/, '.000Z')
  // Tools envoie en plus un <userPrefix> sur svcOnlineOrder. Les appels actuels de Kimatch
  // fonctionnent sans, donc il reste OPTIONNEL : envoyé seulement si la variable existe.
  const userPrefix = process.env.ELLISPHERE_USER_PREFIX
  return `<admin>
    <client>
      <contractId>${contractId}</contractId>
      ${userPrefix ? `<userPrefix>${escapeXml(userPrefix)}</userPrefix>` : ''}
      <userId>${userId}</userId>
      <password>${password}</password>
    </client>
    <context>
      <appId version="1">${appId}</appId>
      <date>${date}</date>
    </context>
  </admin>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xA0;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
}

async function callEllisphereRaw(endpoint: string, body: string): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
    body,
  })
  return { ok: res.ok, status: res.status, text: await res.text() }
}

async function callEllisphere(endpoint: string, body: string, { tolerant = false } = {}): Promise<Record<string, unknown>> {
  const { ok, status, text } = await callEllisphereRaw(endpoint, body)
  if (!ok && !tolerant) {
    throw new Error(`Ellisphere ${endpoint} a répondu ${status}: ${text.slice(0, 300)}`)
  }
  return parser.parse(text)
}

export interface EllisphereCompany {
  raisonSociale: string | null
  nomCommercial: string | null
  siren: string | null
  siret: string | null
  adresse: string | null
  /** La rue seule, et le code postal seul — voir le commentaire de leur construction. */
  rue: string | null
  codePostal: string | null
  ville: string | null
  codeNAF: string | null
  libelleAPE: string | null
  /** Identifiant interne Ellisphere de l'établissement -- seul moyen de commander le rapport de
   * risque complet (`svcOnlineOrder`), qui porte l'avis crédit et les points faibles. */
  srcId: string | null
}

function extractCompany(node: Record<string, unknown>): EllisphereCompany {
  const names = asArray(node?.name)
  const raisonSociale = pickByAttr(names, 'businessname') ?? asText(node?.businessName) ?? null
  const nomCommercial = pickByAttr(names, 'tradename') ?? raisonSociale

  const ids = asArray(node?.id)
  const siren = pickIdByAttr(ids, 'register')
  const siret = pickIdByAttr(ids, 'register-estb')
  const srcId = pickIdByAttr(ids, 'src')

  const address = node?.address as Record<string, unknown> | undefined
  const ville = address ? asText(address.cityName) : null
  /* ══ LES TROIS MORCEAUX SÉPARÉMENT, EN PLUS DE LA LIGNE ENTIÈRE ══
     `comptes` range la rue, le code postal et la ville dans trois colonnes : recoller puis
     redécouper au moment de créer un compte perdrait ce qu'Ellisphere sait déjà. `adresse` reste
     pour les appelants qui affichent une ligne d'un tenant. */
  const rue = address ? asText(address.addressLine) : null
  const codePostal = address ? asText(address.cityCode) : null
  const adresse = address
    ? [rue, codePostal, ville].filter(Boolean).join(', ')
    : null

  const activity = node?.activity as Record<string, unknown> | undefined
  const codeNAF = (activity?.['@_code'] as string) ?? null
  const libelleAPE = activity ? asText(activity['#text'] ?? activity) : null

  return { raisonSociale, nomCommercial, siren, siret, adresse, rue, codePostal, ville, codeNAF, libelleAPE, srcId }
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [value as Record<string, unknown>]
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'])
  }
  return String(value)
}

function pickByAttr(nodes: Record<string, unknown>[], attrValue: string): string | null {
  const match = nodes.find((n) => n['@_type'] === attrValue)
  return match ? asText(match) : null
}

function pickIdByAttr(nodes: Record<string, unknown>[], attrValue: string): string | null {
  const match = nodes.find((n) => n['@_type'] === attrValue)
  return match ? asText(match) : null
}

export async function searchByIdentifier(rawValue: string): Promise<EllisphereCompany | null> {
  const digits = rawValue.replace(/\s/g, '')
  // SIREN (9 chiffres) = identifiant "register" ; SIRET (14 chiffres) = identifiant
  // "register-estb" — ce sont deux types Ellisphere distincts (cf. doc, annexe des identifiants).
  const idType = digits.length === 9 ? 'register' : 'register-estb'

  const body = `<svcSearchByIdRequest lang="FR" version="2.1">
    ${adminBlock('WSOM')}
    <request><searchCriteria><id type="${idType}">${digits}</id></searchCriteria></request>
  </svcSearchByIdRequest>`

  const data = await callEllisphere('svcSearchById', body)
  const response = data?.svcSearchResponse as Record<string, unknown> | undefined
  const responseNode = response?.response as Record<string, unknown> | undefined
  const est = responseNode?.establishment
  if (!est) return null
  const node = Array.isArray(est) ? est[0] : est
  return extractCompany(node as Record<string, unknown>)
}

export async function searchByName(name: string): Promise<EllisphereCompany[]> {
  const body = `<svcSearchByNameRequest lang="FR" version="2.1">
    ${adminBlock('WSOM')}
    <request><searchCriteria><name>${name}</name></searchCriteria></request>
  </svcSearchByNameRequest>`

  const data = await callEllisphere('svcSearchByName', body)
  const response = data?.svcSearchResponse as Record<string, unknown> | undefined
  const responseNode = response?.response as Record<string, unknown> | undefined
  const establishments = asArray(responseNode?.establishment)
  return establishments
    .map(extractCompany)
    .filter((c) => c.raisonSociale && c.siret)
}

async function activateMonitoring(siren: string): Promise<void> {
  const body = `<svcStartMonitoringRequest lang="FR" version="2.2">
    ${adminBlock('WSRISK')}
    <request>
      <id type="register" idName="SIREN">${siren}</id>
      <product range="50001" />
    </request>
  </svcStartMonitoringRequest>`

  // Ellisphere répond en HTTP 401 même pour le cas normal "entreprise déjà surveillée"
  // (result code=ERR, minorCode=3201) — ce n'est pas un échec, on continue toujours vers le score.
  const data = await callEllisphere('svcStartMonitoring', body, { tolerant: true })
  const result = (data?.svcStartMonitoringResponse as Record<string, unknown> | undefined)?.result as
    | Record<string, unknown>
    | undefined
  const code = result?.['@_code']
  if (code && code !== 'OK' && result?.minorCode !== 3201 && asText(result?.minorCode) !== '3201') {
    console.warn(`Ellisphere monitoring non activé pour ${siren}:`, JSON.stringify(result))
  }
}

export interface EvenementEllisphere {
  libelle: string
  /** GREEN, ORANGE, RED — tel que le rapport le dit. */
  severite: string | null
  date: string | null
}

export interface DirigeantEllisphere {
  nom: string
  role: string | null
  depuis: string | null
}

/**
 * ══ CE QUE LE RAPPORT DE RISQUE CONTIENT VRAIMENT ══
 *
 * Établi le 24/09/2026 en lisant un rapport réel, section par section, après que William eut
 * constaté que quatre sociétés différentes affichaient toutes 10/10. Plus rien ici n'est deviné :
 * chaque champ a été vu dans un `<assessmentData>` livré par Ellisphere.
 *
 * TOUT VIENT DU MÊME APPEL, DÉJÀ PAYÉ. Le produit 50001 est commandé en entier depuis toujours ;
 * on n'en gardait qu'une note et deux phrases.
 */
export interface EllisphereScore {
  siren: string
  /** La note de l'entreprise, sur l'échelle `scale` (« 0 - 10 »). */
  score: string | null
  scale: string | null
  /** La classe de risque, sur A - E. */
  classeRisque: string | null
  /** « Risque faible à quasi nul » — le commentaire de la classe. */
  libelleRisque: string | null
  /** L'analyse rédigée d'Ellisphere sur ce dossier. */
  creditOpinion: string | null
  /** Conservé sous son ancien nom : c'est le `comment type="score"`, ce que Tools appelait les
   *  points faibles. En pratique il dit aussi les points forts. */
  paymentIncidents: string | null
  /** Depuis quand Ellisphere note ce dossier, et quand il l'a revu pour la dernière fois. */
  noteDepuis: string | null
  noteMaj: string | null
  /** LA MÊME NOTE, POUR LE SECTEUR. Une société à 6 dans un secteur à 4 ne se lit pas comme une
   *  société à 6 dans un secteur à 9. */
  scoreSecteur: string | null
  classeRisqueSecteur: string | null
  /** L'encours conseillé aujourd'hui (`upTo`), et le plafond du dossier (`limit`), en euros. */
  encoursConseille: string | null
  encoursPlafond: string | null
  /** Les notes passées, de la plus récente à la plus ancienne. */
  historique: { valeur: string; date: string | null; classe: string | null }[]
  /** « Active », « Radiée »… tel que le rapport l'écrit. */
  statut: string | null
  statutType: string | null
  dateCreation: string | null
  /** Le capital social, en euros. */
  capital: string | null
  /** Le nombre d'établissements actifs. */
  etablissements: string | null
  effectif: string | null
  dirigeants: DirigeantEllisphere[]
  /** Les événements légaux les plus récents, avec leur gravité. */
  evenements: EvenementEllisphere[]
}

/** Commande le rapport de risque complet d'un établissement (produit 50001) et en extrait la
 * note, la classe de risque et son commentaire -- même appel et même parsing que la fonction
 * `ellisphere-score` de Tools. `svcConsultList` (liste de surveillance) ne renvoie QUE la note
 * brute : c'est pour ça qu'un second appel est nécessaire.
 *
 * Renvoie `null` si l'appel échoue, pour que l'appelant puisse retomber sur la note seule plutôt
 * que de perdre l'information complètement. */
type RapportRisque = Omit<EllisphereScore, 'siren'>

/**
 * Le rapport de risque complet (produit 50001), lu section par section.
 *
 * ══ CHAQUE EXTRACTION A ÉTÉ VUE DANS UN RAPPORT RÉEL ══
 *
 * Le 24/09/2026, quatre sociétés affichaient toutes 10/10 : le code prenait le premier `<score>` du
 * document, qui appartient à la LÉGENDE de l'échelle. On travaille désormais dans
 * `<assessmentData>`, et les noms de balises viennent d'un rapport livré, pas d'une supposition.
 */
async function getRiskReport(srcId: string): Promise<RapportRisque | null> {
  const body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<svcOnlineOrderRequest lang="FR" version="2.2">
  ${adminBlock('WSRISK')}
  <request>
    <id type="src">${escapeXml(srcId)}</id>
    <product range="50001" version="1" />
    <deliveryOptions>
      <outputMethod>raw</outputMethod>
    </deliveryOptions>
  </request>
</svcOnlineOrderRequest>`

  const { ok, status, text } = await callEllisphereRaw('svcOnlineOrder', body)
  const erreur = /<result[^>]*code="ERR"[^>]*>/.test(text)
  if (!ok || erreur) {
    const major = text.match(/<majorMessage>([^<]+)<\/majorMessage>/)?.[1] ?? `HTTP ${status}`
    const minor = text.match(/<minorMessage>([^<]+)<\/minorMessage>/)?.[1] ?? ''
    console.warn('[ellisphere] rapport de risque indisponible :', [major, minor].filter(Boolean).join(' — '))
    return null
  }

  const un = (motif: RegExp, source = text): string | null => {
    const m = source.match(motif)
    return m?.[1] ? decodeXml(m[1].trim()) : null
  }

  /* ══ LE SCORE DE L'ENTREPRISE EST DANS `<assessmentData>` ══
     Le document porte aussi une légende de l'échelle ; c'est elle qui produisait le 10 universel. */
  void consignerLesComptes(text)

  const evaluation = text.match(/<assessmentData\b[\s\S]*?<\/assessmentData>/i)?.[0] ?? ''
  const blocStandard = evaluation.match(/<score\b[^>]*\btype="standard"[^>]*>[\s\S]*?<\/score>/i)?.[0] ?? ''
  const blocSecteur = evaluation.match(/<score\b[^>]*\btype="sector"[^>]*>[\s\S]*?<\/score>/i)?.[0] ?? ''
  /* L'en-tête du bloc s'arrête au premier `<history>` : sans cette coupe, les valeurs de l'historique
     répondraient aux mêmes recherches que la note courante. */
  const enTete = blocStandard.split('<history')[0]

  const score = un(/<value\b[^>]*\btype="score"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i, enTete)?.replace(',', '.') ?? null
  const scale = un(/<value\b[^>]*\btype="score"[^>]*\bscale="([^"]+)"/i, enTete)
  const classeRisque = un(/<value\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/value>/i, enTete)
  const libelleRisque = un(/<comment\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/comment>/i, enTete)
  const paymentIncidents = un(/<comment\b[^>]*\btype="score"[^>]*>\s*([^<]+?)\s*<\/comment>/i, enTete)
  const noteDepuis = un(/<date\b[^>]*\btype="since"[^>]*>\s*([^<]+?)\s*<\/date>/i, enTete)
  const noteMaj = un(/<date\b[^>]*\btype="lastupdate"[^>]*>\s*([^<]+?)\s*<\/date>/i, enTete)

  const scoreSecteur = un(/<value\b[^>]*\btype="score"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i, blocSecteur)?.replace(',', '.') ?? null
  const classeRisqueSecteur = un(/<value\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/value>/i, blocSecteur)

  /* L'AVIS DE CRÉDIT EST UN CONTENEUR, pas une phrase : `limit` est le plafond du dossier, `upTo`
     l'encours conseillé aujourd'hui. Le lire en texte brut recrachait une soupe de dates et de
     montants — c'est ce que William a vu à l'écran. */
  const avis = text.match(/<creditOpinion\b[\s\S]*?<\/creditOpinion>/i)?.[0] ?? ''
  const enTeteAvis = avis.split('<history')[0]
  const encoursPlafond = un(/<limit\b[^>]*>\s*([\d.,]+)\s*<\/limit>/i, enTeteAvis)
  const encoursConseille = un(/<upTo\b[^>]*>\s*([\d.,]+)\s*<\/upTo>/i, enTeteAvis)

  const historique: RapportRisque['historique'] = []
  for (const m of blocStandard.matchAll(/<history\b[^>]*>([\s\S]*?)<\/history>/gi)) {
    const corps = m[1]
    const valeur = corps.match(/<value\b[^>]*\btype="score"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i)?.[1]
    if (!valeur) continue
    historique.push({
      valeur: valeur.replace(',', '.'),
      date: un(/<date\b[^>]*\btype="effective"[^>]*>\s*([^<]+?)\s*<\/date>/i, corps),
      classe: un(/<value\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/value>/i, corps),
    })
    if (historique.length >= 6) break
  }

  const statut = un(/<currentStatus\b[^>]*>\s*([^<]+?)\s*<\/currentStatus>/i)
  const statutType = un(/<currentStatus\b[^>]*\btype="([^"]+)"/i)
  const dateCreation = un(/<foundation\b[^>]*>[\s\S]*?<date\b[^>]*\btype="creation"[^>]*>\s*([^<]+?)\s*<\/date>/i)
  const capital = un(/<capitalInformation\b[^>]*>[\s\S]*?<capital\b[^>]*>\s*([\d.,]+)\s*<\/capital>/i)
  const effectif = un(/<numberOfEmployees\b[^>]*>\s*([\d.,]+)\s*<\/numberOfEmployees>/i)

  /* Le nombre d'établissements est une somme : le rapport le donne par département. */
  let etablissements: string | null = null
  const repartition = text.match(/<establishmentsBreakDown\b[\s\S]*?<\/establishmentsBreakDown>/i)?.[0]
  if (repartition) {
    let total = 0
    for (const m of repartition.matchAll(/<value\b[^>]*>\s*(\d+)\s*<\/value>/gi)) total += Number(m[1])
    if (total > 0) etablissements = String(total)
  }

  const dirigeants: DirigeantEllisphere[] = []
  for (const m of text.matchAll(/<manager\b[^>]*>([\s\S]*?)<\/manager>/gi)) {
    const corps = m[1]
    const nom = un(/<fullName\b[^>]*>\s*([^<]+?)\s*<\/fullName>/i, corps)
    if (!nom) continue
    dirigeants.push({
      nom,
      role: un(/<role\b[^>]*\borigin="src"[^>]*>\s*([^<]+?)\s*<\/role>/i, corps)
        ?? un(/<role\b[^>]*>\s*([^<]+?)\s*<\/role>/i, corps),
      depuis: un(/<date\b[^>]*\btype="since"[^>]*>\s*([^<]+?)\s*<\/date>/i, corps),
    })
    if (dirigeants.length >= 4) break
  }

  /* LES ÉVÉNEMENTS PORTENT UNE GRAVITÉ — GREEN, ORANGE, RED. C'est elle qui décide de la couleur,
     pas la date : une radiation en vert n'existe pas. */
  const evenements: EvenementEllisphere[] = []
  for (const m of text.matchAll(/<event\b[^>]*>([\s\S]*?)<\/event>/gi)) {
    const corps = m[1]
    const libelle = un(/<description\b[^>]*>\s*([^<]+?)\s*<\/description>/i, corps)
    if (!libelle) continue
    evenements.push({
      libelle,
      severite: un(/<severity\b[^>]*>\s*([^<]+?)\s*<\/severity>/i, corps),
      date: un(/<date\b[^>]*\btype="effective"[^>]*>\s*([^<]+?)\s*<\/date>/i, corps),
    })
  }
  /* Les plus graves d'abord, puis les plus récents : c'est dans cet ordre qu'on veut les lire. */
  const rang = (s: string | null) => (s === 'RED' ? 0 : s === 'ORANGE' ? 1 : 2)
  evenements.sort((a, b) => rang(a.severite) - rang(b.severite) || (b.date ?? '').localeCompare(a.date ?? ''))

  return {
    score, scale, classeRisque, libelleRisque,
    creditOpinion: libelleRisque && classeRisque ? `${libelleRisque} (classe ${classeRisque})` : libelleRisque,
    paymentIncidents, noteDepuis, noteMaj,
    scoreSecteur, classeRisqueSecteur,
    encoursConseille, encoursPlafond,
    historique, statut, statutType, dateCreation, capital, etablissements, effectif,
    dirigeants, evenements: evenements.slice(0, 6),
  }
}

export async function getScoreBySiren(siren: string): Promise<EllisphereScore> {
  // Chemin privilégié : rapport de risque complet, qui porte tout ce que la carte Ellipro affiche.
  try {
    const etablissement = await searchByIdentifier(siren)
    if (etablissement?.srcId) {
      const rapport = await getRiskReport(etablissement.srcId)
      if (rapport && rapport.score !== null) return { siren, ...rapport }
    }
  } catch (err) {
    console.warn('[ellisphere] chemin rapport de risque indisponible, repli sur la liste de surveillance :', err)
  }

  // Repli : liste de surveillance. Ne donne que la note brute, mais c'est le chemin qui
  // fonctionnait jusqu'ici — on ne veut pas perdre la note si le rapport complet échoue.
  return getScoreFromMonitoring(siren)
}

async function getScoreFromMonitoring(siren: string): Promise<EllisphereScore> {
  await activateMonitoring(siren)

  // Filtre côté serveur sur ce SIREN précis — le <id> doit être imbriqué DANS <listCriteria>
  // (testé en direct : en sibling ça ne filtre rien, imbriqué ça passe de 2793 résultats/1,5 Mo
  // à 1 résultat/746 octets).
  const body = `<svcConsultListRequest lang="FR" version="2.1">
    ${adminBlock('WSOM')}
    <request>
      <listCriteria type="monitoring">
        <id type="register">${siren}</id>
      </listCriteria>
    </request>
  </svcConsultListRequest>`

  const data = await callEllisphere('svcConsultList', body)
  const response = data?.svcConsultListResponse as Record<string, unknown> | undefined
  const responseNode = response?.response as Record<string, unknown> | undefined
  const companies = asArray(responseNode?.company)

  const match = companies.find((c) => asText(c.id) === siren) ?? companies[0]
  const scoreNode = match?.score as Record<string, unknown> | string | undefined

  // La liste de surveillance ne porte ni avis crédit ni points faibles : ces deux champs
  // n'existent que dans le rapport de risque (voir getRiskReport).
  if (!scoreNode) return {
    siren, score: null, scale: null, classeRisque: null, libelleRisque: null, creditOpinion: null,
    paymentIncidents: null, noteDepuis: null, noteMaj: null, scoreSecteur: null,
    classeRisqueSecteur: null, encoursConseille: null, encoursPlafond: null, historique: [],
    statut: null, statutType: null, dateCreation: null, capital: null, etablissements: null,
    effectif: null, dirigeants: [], evenements: [],
  }

  if (typeof scoreNode === 'object') {
    return {
      ...{
    siren, score: null, scale: null, classeRisque: null, libelleRisque: null, creditOpinion: null,
    paymentIncidents: null, noteDepuis: null, noteMaj: null, scoreSecteur: null,
    classeRisqueSecteur: null, encoursConseille: null, encoursPlafond: null, historique: [],
    statut: null, statutType: null, dateCreation: null, capital: null, etablissements: null,
    effectif: null, dirigeants: [], evenements: [],
  },
      score: asText(scoreNode['#text'] ?? scoreNode),
      scale: (scoreNode['@_scale'] as string) ?? null,
    }
  }
  return { ...{
    siren, score: null, scale: null, classeRisque: null, libelleRisque: null, creditOpinion: null,
    paymentIncidents: null, noteDepuis: null, noteMaj: null, scoreSecteur: null,
    classeRisqueSecteur: null, encoursConseille: null, encoursPlafond: null, historique: [],
    statut: null, statutType: null, dateCreation: null, capital: null, etablissements: null,
    effectif: null, dirigeants: [], evenements: [],
  }, score: String(scoreNode) }
}

/**
 * ══ UNE DERNIÈRE CAPTURE, ÉTROITE : LES COMPTES ANNUELS ══
 *
 * Tout le reste du rapport a été lu le 24/09/2026. Seuls les comptes manquaient : le premier
 * rapport capturé était celui d'une société créée en 2021, qui n'en publie pas. Un syndic établi en
 * aura, et c'est le dernier morceau qui manque à la carte Ellipro.
 *
 * ELLE NE GARDE QUE `<financials>` ET SES VOISINS — ni identité, ni dirigeants, ni événements :
 * tout cela est déjà connu. Elle s'efface dès la lecture faite, comme la précédente.
 */
async function consignerLesComptes(rapport: string): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const cle = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !cle) return
    const comptes = rapport.match(/<financials\b[\s\S]*?<\/financials>/gi)?.slice(0, 2).join('\n') ?? null
    if (!comptes) return
    const siren = rapport.match(/idName="SIREN"[^>]*>\s*(\d{9})/i)?.[1] ?? 'inconnu'
    await fetch(`${url}/rest/v1/diagnostics_ellisphere`, {
      method: 'POST',
      headers: { apikey: cle, Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ siren, sections: { financials: comptes.slice(0, 9000) } }),
    })
  } catch {
    /* Un diagnostic qui échoue ne doit jamais empêcher un score d'être rendu. */
  }
}

/* LE DIAGNOSTIC DE STRUCTURE COMPLET A ÉTÉ RETIRÉ LE 24/09/2026, sa lecture faite. Il a servi une journée à
   comprendre ce que le rapport contient vraiment — et à trouver pourquoi quatre sociétés affichaient
   toutes 10/10. Tout ce qui est extrait plus haut vient de cette lecture. Laisser un mouchard écrire
   en production à chaque consultation ne se justifie plus. */
