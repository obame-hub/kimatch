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
  const adresse = address
    ? [asText(address.addressLine), asText(address.cityCode), asText(address.cityName)].filter(Boolean).join(', ')
    : null

  const activity = node?.activity as Record<string, unknown> | undefined
  const codeNAF = (activity?.['@_code'] as string) ?? null
  const libelleAPE = activity ? asText(activity['#text'] ?? activity) : null

  return { raisonSociale, nomCommercial, siren, siret, adresse, ville, codeNAF, libelleAPE, srcId }
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

export interface EllisphereScore {
  siren: string
  score: string | null
  scale: string | null
  /** Libellé de la classe de risque, ex. « Risque moyen à élevé (classe C) ». */
  creditOpinion: string | null
  /** Commentaire détaillé du score = les « points faibles » affichés par Tools. */
  paymentIncidents: string | null
}

/** Commande le rapport de risque complet d'un établissement (produit 50001) et en extrait la
 * note, la classe de risque et son commentaire -- même appel et même parsing que la fonction
 * `ellisphere-score` de Tools. `svcConsultList` (liste de surveillance) ne renvoie QUE la note
 * brute : c'est pour ça qu'un second appel est nécessaire.
 *
 * Renvoie `null` si l'appel échoue, pour que l'appelant puisse retomber sur la note seule plutôt
 * que de perdre l'information complètement. */
async function getRiskReport(srcId: string): Promise<{ score: string | null; scale: string | null; creditOpinion: string | null; paymentIncidents: string | null } | null> {
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

  // Le score courant est dans le PREMIER bloc <score> de <assessmentData> ; les suivants sont
  // l'historique. On isole donc ce bloc avant d'y chercher les valeurs.
  const bloc = text.match(/<score\b[\s\S]*?<\/score>/)?.[0] ?? text

  const scoreMatch =
    bloc.match(/<value\b[^>]*\btype="score"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i) ??
    bloc.match(/<value\b[^>]*scale="0\s*-\s*10"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i)
  const score = scoreMatch ? scoreMatch[1].replace(',', '.') : null
  const scale = bloc.match(/<value\b[^>]*\btype="score"[^>]*\bscale="([^"]+)"/i)?.[1] ?? null

  const riskClass = bloc.match(/<value\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/value>/i)?.[1]?.trim() ?? null
  const riskComment = bloc.match(/<comment\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/comment>/i)?.[1]?.trim() ?? null
  const creditOpinion = riskComment
    ? decodeXml(riskClass ? `${riskComment} (classe ${riskClass})` : riskComment)
    : riskClass
      ? `Classe ${riskClass}`
      : null

  const scoreComment = bloc.match(/<comment\b[^>]*\btype="score"[^>]*>\s*([^<]+?)\s*<\/comment>/i)?.[1]?.trim() ?? null
  const paymentIncidents = scoreComment ? decodeXml(scoreComment) : null

  return { score, scale, creditOpinion, paymentIncidents }
}

export async function getScoreBySiren(siren: string): Promise<EllisphereScore> {
  // Chemin privilégié : rapport de risque complet, qui porte l'avis crédit et les points faibles.
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
  if (!scoreNode) return { siren, score: null, scale: null, creditOpinion: null, paymentIncidents: null }

  if (typeof scoreNode === 'object') {
    return {
      siren,
      score: asText(scoreNode['#text'] ?? scoreNode),
      scale: (scoreNode['@_scale'] as string) ?? null,
      creditOpinion: null,
      paymentIncidents: null,
    }
  }
  return { siren, score: String(scoreNode), scale: null, creditOpinion: null, paymentIncidents: null }
}
