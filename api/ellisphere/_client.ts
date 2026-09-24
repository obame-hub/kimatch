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

export interface EllisphereScore {
  siren: string
  score: string | null
  scale: string | null
  /** Libellé de la classe de risque, ex. « Risque moyen à élevé (classe C) ». */
  creditOpinion: string | null
  /** Commentaire détaillé du score = les « points faibles » affichés par Tools. */
  paymentIncidents: string | null
  /* ══ DEUX LECTURES DE PLUS, TIRÉES DU MÊME RAPPORT DÉJÀ PAYÉ ══
     Le produit 50001 est commandé en entier ; on n'en gardait que la note et deux phrases. Ces deux
     champs viennent du même appel, sans un centime de plus.
     ILS SONT EXTRAITS AU MIEUX, ET RENDUS `null` QUAND ILS MANQUENT : les noms de balises sont
     déduits de ceux que l'on sait présents (`value type="score"`, `value type="riskclass"`), pas
     d'une documentation sous les yeux. L'écran n'affiche que ce qui existe — un rapport qui ne les
     porte pas ne casse rien et ne montre rien. */
  /** L'encours conseillé par Ellisphere, en euros. */
  encoursConseille: string | null
  /** Les notes précédentes, du plus récent au plus ancien : le code notait déjà que les blocs
   *  `<score>` suivants sont l'historique. Une note qui monte ne se lit pas comme une note qui
   *  descend, à valeur égale. */
  historique: { valeur: string; date: string | null }[]
}

/** Commande le rapport de risque complet d'un établissement (produit 50001) et en extrait la
 * note, la classe de risque et son commentaire -- même appel et même parsing que la fonction
 * `ellisphere-score` de Tools. `svcConsultList` (liste de surveillance) ne renvoie QUE la note
 * brute : c'est pour ça qu'un second appel est nécessaire.
 *
 * Renvoie `null` si l'appel échoue, pour que l'appelant puisse retomber sur la note seule plutôt
 * que de perdre l'information complètement. */
type RapportRisque = {
  score: string | null
  scale: string | null
  creditOpinion: string | null
  paymentIncidents: string | null
  encoursConseille: string | null
  historique: { valeur: string; date: string | null }[]
}

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

  /* ══ ON NOTE CE QUE LE RAPPORT CONTIENT, UNE FOIS ══
     William, 24/09/2026 : « peux-tu checker tout ce que contient un rapport venant d'Ellipro ? »
     Les identifiants vivent sur Vercel : seule la production peut le voir passer. Elle en consigne
     donc la STRUCTURE — noms de balises, types de `value` et de `comment` — dans
     `diagnostics_ellisphere`, le temps de construire la carte sur du réel.
     TEMPORAIRE, et sans effet sur la réponse : un échec d'écriture est ignoré. À retirer une fois
     la lecture faite. */
  void consignerStructure(text)

  /* ══ LE PREMIER <score> DU RAPPORT N'EST PAS CELUI DE L'ENTREPRISE ══
     William, 24/09/2026 : quatre sociétés différentes, toutes à 10/10, toutes « classe A », toutes
     avec la même phrase. Le rapport porte une LÉGENDE de l'échelle — on y trouve `upTo`, `class`,
     `color`, `label` — et c'est elle que la recherche attrapait, sur sa première entrée : le haut
     du barème. D'où un 10 universel.
     LE SCORE DE L'ENTREPRISE VIT DANS `<assessmentData>`, qui n'apparaît qu'une fois dans le
     rapport. On s'y enferme AVANT de chercher, et on ne retombe sur le document entier que si la
     section manque — auquel cas mieux vaut une note douteuse que pas de note du tout. */
  const evaluation = text.match(/<assessmentData\b[\s\S]*?<\/assessmentData>/i)?.[0] ?? text
  const bloc = evaluation.match(/<score\b[\s\S]*?<\/score>/)?.[0] ?? evaluation

  const scoreMatch =
    bloc.match(/<value\b[^>]*\btype="score"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i) ??
    bloc.match(/<value\b[^>]*scale="0\s*-\s*10"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i)
  const score = scoreMatch ? scoreMatch[1].replace(',', '.') : null
  const scale = bloc.match(/<value\b[^>]*\btype="score"[^>]*\bscale="([^"]+)"/i)?.[1] ?? null

  const riskClass = bloc.match(/<value\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/value>/i)?.[1]?.trim() ?? null
  const riskComment = bloc.match(/<comment\b[^>]*\btype="riskclass"[^>]*>\s*([^<]+?)\s*<\/comment>/i)?.[1]?.trim() ?? null
  /* `<creditOpinion>` est un élément à part entière du rapport, et il ne dit pas la même chose que
     le commentaire de classe de risque : c'est l'avis rédigé, quand il existe. */
  const avisRedige = text.match(/<creditOpinion\b[^>]*>\s*([\s\S]*?)\s*<\/creditOpinion>/i)?.[1]
    ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null

  const creditOpinion = avisRedige ? decodeXml(avisRedige) : riskComment
    ? decodeXml(riskClass ? `${riskComment} (classe ${riskClass})` : riskComment)
    : riskClass
      ? `Classe ${riskClass}`
      : null

  const scoreComment = bloc.match(/<comment\b[^>]*\btype="score"[^>]*>\s*([^<]+?)\s*<\/comment>/i)?.[1]?.trim() ?? null
  const paymentIncidents = scoreComment ? decodeXml(scoreComment) : null

  /* L'encours conseillé se cherche dans TOUT le rapport et non dans le seul bloc de score : rien ne
     dit qu'il y vive. Absent, il vaut `null` et l'écran n'en parle pas. */
  const encoursConseille =
    text.match(/<value\b[^>]*\btype="creditlimit"[^>]*>\s*([\d.,\s]+?)\s*<\/value>/i)?.[1]?.replace(/\s/g, '').replace(',', '.')
    ?? null

  /* Les blocs `<score>` suivants sont l'historique — le commentaire ci-dessus le disait déjà sans
     que personne n'en tire parti. On garde les cinq plus récents, valeur et date quand elle existe. */
  /* L'HISTORIQUE VIT DANS `<history>` / `<monitoring>`, et non dans les `<score>` du document —
     il n'y en a que deux, dont la légende. Chaque entrée porte une note et une date. */
  const historique: { valeur: string; date: string | null }[] = []
  for (const m of evaluation.matchAll(/<(history|monitoring)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const corps = m[2]
    const valeur = corps.match(/<value\b[^>]*\btype="score"[^>]*>\s*(\d+(?:[.,]\d+)?)\s*<\/value>/i)?.[1]
    if (!valeur) continue
    const date = corps.match(/<date\b[^>]*>\s*([^<]+?)\s*<\/date>/i)?.[1] ?? null
    historique.push({ valeur: valeur.replace(',', '.'), date })
    if (historique.length >= 6) break
  }

  return { score, scale, creditOpinion, paymentIncidents, encoursConseille, historique }
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
  if (!scoreNode) return { siren, score: null, scale: null, creditOpinion: null, paymentIncidents: null, encoursConseille: null, historique: [] }

  if (typeof scoreNode === 'object') {
    return {
      siren,
      score: asText(scoreNode['#text'] ?? scoreNode),
      scale: (scoreNode['@_scale'] as string) ?? null,
      creditOpinion: null,
      paymentIncidents: null,
      encoursConseille: null,
      historique: [],
    }
  }
  return { siren, score: String(scoreNode), scale: null, creditOpinion: null, paymentIncidents: null, encoursConseille: null, historique: [] }
}


/**
 * Consigne la structure d'un rapport — TEMPORAIRE, voir son appel.
 *
 * ON NE GARDE PAS LE RAPPORT ENTIER : les noms de balises et leurs occurrences, les valeurs de
 * `type=` (c'est là qu'est le sens : score, riskclass, creditlimit…), et 4 000 caractères d'extrait
 * pour lire la forme des valeurs. Assez pour décider quoi afficher, pas assez pour constituer une
 * copie du service.
 */
async function consignerStructure(rapport: string): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const cle = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !cle) return

    const balises: Record<string, number> = {}
    for (const m of rapport.matchAll(/<([A-Za-z][\w:.-]*)\b/g)) {
      balises[m[1]] = (balises[m[1]] ?? 0) + 1
    }
    const types: Record<string, number> = {}
    for (const m of rapport.matchAll(/<(value|comment|indicator|item)\b[^>]*\btype="([^"]+)"/gi)) {
      const cle2 = `${m[1].toLowerCase()}:${m[2]}`
      types[cle2] = (types[cle2] ?? 0) + 1
    }
    const siren = rapport.match(/idName="SIREN"[^>]*>\s*(\d{9})/i)?.[1]
      ?? rapport.match(/>(\d{9})</)?.[1]
      ?? 'inconnu'

    /* L'EXTRAIT DE 4 000 CARACTÈRES S'ARRÊTAIT AVANT LE SCORE : le rapport commence par l'identité,
       et tout ce qui a de la valeur vient après. On prélève donc des SECTIONS nommées, choisies
       dans l'inventaire des balises. */
    const section = (nom: string, max = 4000): string | null => {
      const m = rapport.match(new RegExp(`<${nom}\\b[\\s\\S]*?</${nom}>`, 'i'))
      return m ? m[0].slice(0, max) : null
    }

    await fetch(`${url}/rest/v1/diagnostics_ellisphere`, {
      method: 'POST',
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        siren,
        balises,
        types_valeurs: types,
        extrait: rapport.slice(0, 1200),
        sections: {
          assessmentData: section('assessmentData', 9000),
          creditOpinion: section('creditOpinion', 2000),
          currentStatus: section('currentStatus', 600),
          foundation: section('foundation', 600),
          capitalInformation: section('capitalInformation', 800),
          numberOfEmployees: section('numberOfEmployees', 800),
          workForce: section('workForce', 800),
          financials: section('financials', 5000),
          companyAppointments: section('companyAppointments', 2000),
          establishmentsBreakDown: section('establishmentsBreakDown', 800),
          evenement: section('event', 1200),
          balisesScore: rapport.match(/<score\b[^>]*>/gi)?.slice(0, 4) ?? null,
        },
      }),
    })
  } catch {
    /* Un diagnostic qui échoue ne doit surtout pas empêcher un score d'être rendu. */
  }
}
