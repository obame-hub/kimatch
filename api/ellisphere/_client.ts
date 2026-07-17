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
  return `<admin>
    <client>
      <contractId>${contractId}</contractId>
      <userId>${userId}</userId>
      <password>${password}</password>
    </client>
    <context>
      <appId version="1">${appId}</appId>
      <date>${date}</date>
    </context>
  </admin>`
}

async function callEllisphere(endpoint: string, body: string, { tolerant = false } = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body,
  })
  const text = await res.text()
  if (!res.ok && !tolerant) {
    throw new Error(`Ellisphere ${endpoint} a répondu ${res.status}: ${text.slice(0, 300)}`)
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
}

function extractCompany(node: Record<string, unknown>): EllisphereCompany {
  const names = asArray(node?.name)
  const raisonSociale = pickByAttr(names, 'businessname') ?? asText(node?.businessName) ?? null
  const nomCommercial = pickByAttr(names, 'tradename') ?? raisonSociale

  const ids = asArray(node?.id)
  const siren = pickIdByAttr(ids, 'register')
  const siret = pickIdByAttr(ids, 'register-estb')

  const address = node?.address as Record<string, unknown> | undefined
  const ville = address ? asText(address.cityName) : null
  const adresse = address
    ? [asText(address.addressLine), asText(address.cityCode), asText(address.cityName)].filter(Boolean).join(', ')
    : null

  const activity = node?.activity as Record<string, unknown> | undefined
  const codeNAF = (activity?.['@_code'] as string) ?? null
  const libelleAPE = activity ? asText(activity['#text'] ?? activity) : null

  return { raisonSociale, nomCommercial, siren, siret, adresse, ville, codeNAF, libelleAPE }
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
}

export async function getScoreBySiren(siren: string): Promise<EllisphereScore> {
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

  if (!scoreNode) return { siren, score: null, scale: null }

  if (typeof scoreNode === 'object') {
    return { siren, score: asText(scoreNode['#text'] ?? scoreNode), scale: (scoreNode['@_scale'] as string) ?? null }
  }
  return { siren, score: String(scoreNode), scale: null }
}
