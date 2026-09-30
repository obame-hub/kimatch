// Client serveur pour l'API Enedis SGE B2B (mTLS). Ne jamais importer ce fichier
// depuis le code front (src/) — le certificat client et la clé privée ne doivent
// exister que côté serveur (variables d'env Vercel, jamais préfixées VITE_).

import https from 'node:https'

const URL_DTC = 'https://sge-ws.enedis.fr/ConsultationDonneesTechniquesContractuelles/v1.0'
const URL_MESURES = 'https://sge-ws.enedis.fr/ConsultationMesures/v1.1'

function credentials() {
  const login = process.env.ENEDIS_LOGIN
  const contratId = process.env.ENEDIS_CONTRAT_ID
  const cert = process.env.ENEDIS_CERT_PEM
  const key = process.env.ENEDIS_KEY_PEM
  if (!login || !contratId || !cert || !key) {
    throw new Error('Identifiants/certificat Enedis manquants (ENEDIS_LOGIN / ENEDIS_CONTRAT_ID / ENEDIS_CERT_PEM / ENEDIS_KEY_PEM)')
  }
  return { login, contratId, cert, key }
}

function postSoapOnce(url: string, body: string, cert: string, key: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        cert,
        key,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '""',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf-8') }))
      },
    )
    req.on('timeout', () => req.destroy(new Error('[transient] Délai dépassé (30s)')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// Enedis renvoie parfois des erreurs 5xx transitoires — on retente 2 fois.
async function postSoap(url: string, body: string, label: string): Promise<string> {
  const { cert, key } = credentials()
  let lastErr: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { status, text } = await postSoapOnce(url, body, cert, key)
      const hasFault = /<faultstring>|<faultcode>|<resultat\b/i.test(text)
      if (status >= 400 && !hasFault) {
        throw new Error(`[transient][${label}] Enedis a répondu HTTP ${status}`)
      }
      return text
    } catch (e) {
      lastErr = e
      if (!/\[transient\]/.test(String(e))) throw e
      await new Promise((r) => setTimeout(r, 600 * attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()

function normClasse(code: string): string {
  const c = code.toUpperCase().trim()
  if (/^(P|PTE|POINTE|PM)$/.test(c)) return 'POINTE'
  if (c === 'HPH' || c === 'HPP') return 'HPH'
  if (c === 'HCH' || c === 'HCP') return 'HCH'
  if (c === 'HPE' || c === 'HPB') return 'HPE'
  if (c === 'HCE' || c === 'HCB') return 'HCE'
  return c
}

export interface EnedisElecResult {
  success: boolean
  error?: string
  pdlId?: string
  segment?: string | null
  fta?: string | null
  ftaLibelle?: string | null
  isHTA?: boolean
  utilisation?: string | null
  domaineTension?: string | null
  tensionLivraison?: string | null
  calendrierFournisseur?: 'BASE' | 'HP/HC' | null
  puissanceSouscrite?: number | null
  puissanceRaccordement?: number | null
  puissancesParClasse?: Record<string, number> | null
  adresse?: string | null
  codePostalSite?: string | null
  ville?: string | null
  consoParClasseMwh?: Record<string, number> | null
  consoTotaleMwh?: number | null
  consoTotaleKwh?: number | null
  periodeDebut?: string | null
  periodeFin?: string | null
  /** La consommation TOTALE des douze dernières périodes de relève entières — voir `releveesMensuelles`. */
  consoMensuelleMwh?: { mois: string; debut: string; fin: string; mwh: number; estimee: boolean }[] | null
  /** RELEVÉ TECHNIQUE TEMPORAIRE (30/09/2026) : la forme des mesures reçues, sans leurs valeurs —
   *  retiré de la réponse par `fetch-elec.ts`, rangé dans `diagnostics_enedis`. */
  diagnostic?: Record<string, unknown>
}

/**
 * ══ UN MOIS, C'EST UNE PÉRIODE DE RELÈVE ENTIÈRE ══
 *
 * William, 30/09/2026 : « il faut renseigner les consommations par mois (consommation totale, pas
 * par poste). Je souhaite l'historique des 12 derniers mois renseignés — attention aux demi-mois
 * ou autre ce qui pourrait nuire à la santé de la data. »
 *
 * CE QU'ENEDIS ENVOIE VRAIMENT (relevé du 30/09/2026 sur le PDL 30000630420723, un C4) : pas des
 * mois civils, mais des PÉRIODES DE RELÈVE calées sur le cycle du compteur — 22/08 → 21/09,
 * 22/07 → 22/08, 19/02 → 22/03… Consécutives, d'environ un mois, tous les postes sur les mêmes
 * bornes. Ma première règle n'acceptait que des mois commençant le 1er : elle les rejetait toutes.
 *
 * ON NE DÉCOUPE RIEN. Chaque période garde ses vraies bornes et sa vraie consommation ; elle est
 * seulement RANGÉE sous le mois de son milieu, qui est aussi celui où tombent la plupart de ses
 * jours (22/08 → 21/09 : septembre). Répartir au prorata des jours inventerait une consommation
 * jour par jour qu'Enedis n'a pas mesurée.
 *
 * Une période est écartée — absente, jamais approchée — si :
 *   · elle ne fait pas entre 25 et 35 jours (demi-mois, période écourtée, trou de relève) ;
 *   · un poste attendu y manque, ou y figure deux fois ;
 *   · une autre période retenue tombe dans le même mois.
 */
export function releveesMensuelles(
  mesures: { classe: string; debut: string; fin: string; valeurKwh: number; estimee: boolean }[],
  aujourdhui: string = new Date().toISOString().slice(0, 10),
): { mois: string; debut: string; fin: string; mwh: number; estimee: boolean }[] {
  const jours = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
  /* La fenêtre part de la DERNIÈRE période close, pas d'aujourd'hui : un compteur dont la relève a
     du retard garde ses douze périodes. */
  const closes = mesures.filter((x) => x.fin <= aujourdhui)
  const derniere = closes.reduce((m, x) => (x.fin > m ? x.fin : m), '')
  if (!derniere) return []
  const unAnAvant = new Date(`${derniere}T00:00:00Z`)
  unAnAvant.setUTCMonth(unAnAvant.getUTCMonth() - 13)
  const borne = unAnAvant.toISOString().slice(0, 10)

  /* Les postes attendus : ceux de cette année-là — un poste disparu avec un ancien tarif ne doit
     pas faire rejeter les périodes récentes. */
  const recentes = closes.filter((x) => x.fin > borne)
  const attendus = new Set(recentes.map((x) => x.classe))

  const parPeriode = new Map<string, { debut: string; fin: string; parClasse: Map<string, number>; double: boolean; estimee: boolean }>()
  for (const x of recentes) {
    const cle = `${x.debut}|${x.fin}`
    const p = parPeriode.get(cle) ?? { debut: x.debut, fin: x.fin, parClasse: new Map(), double: false, estimee: false }
    if (p.parClasse.has(x.classe)) p.double = true
    else p.parClasse.set(x.classe, x.valeurKwh)
    if (x.estimee) p.estimee = true
    parPeriode.set(cle, p)
  }

  const valides = [...parPeriode.values()]
    .filter((p) => {
      const d = jours(p.debut, p.fin)
      return d >= 25 && d <= 35 && !p.double && [...attendus].every((c) => p.parClasse.has(c))
    })
    .map((p) => {
      const milieu = new Date(Date.parse(`${p.debut}T00:00:00Z`) + (jours(p.debut, p.fin) / 2) * 86_400_000)
      return { ...p, mois: `${milieu.toISOString().slice(0, 7)}-01` }
    })
    .sort((a, b) => b.fin.localeCompare(a.fin))
    .slice(0, 12)

  const parMois = new Map<string, number>()
  for (const p of valides) parMois.set(p.mois, (parMois.get(p.mois) ?? 0) + 1)
  return valides
    .filter((p) => parMois.get(p.mois) === 1)
    .map((p) => ({
      mois: p.mois,
      debut: p.debut,
      fin: p.fin,
      mwh: Math.round(([...p.parClasse.values()].reduce((a, b) => a + b, 0) / 1000) * 1000) / 1000,
      estimee: p.estimee,
    }))
    .sort((a, b) => a.mois.localeCompare(b.mois))
}

export async function fetchElecData(pdlId: string): Promise<EnedisElecResult> {
  const { login, contratId } = credentials()

  // ─── Appel 1 : Données Techniques Contractuelles ───
  const xmlDtc = await postSoap(
    URL_DTC,
    `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tec="http://www.enedis.fr/sge/b2b/technique/v1.0"
  xmlns:ope="http://www.enedis.fr/sge/b2b/services/consulterdonneestechniquescontractuelles/v1.0">
  <soapenv:Header>
    <tec:entete><infoDemandeur><loginDemandeur>${login}</loginDemandeur></infoDemandeur></tec:entete>
  </soapenv:Header>
  <soapenv:Body>
    <ope:consulterDonneesTechniquesContractuelles>
      <pointId>${pdlId}</pointId>
      <loginUtilisateur>${login}</loginUtilisateur>
      <autorisationClient>true</autorisationClient>
    </ope:consulterDonneesTechniquesContractuelles>
  </soapenv:Body>
</soapenv:Envelope>`,
    'DTC',
  )

  const faultDtc = xmlDtc.match(/<faultstring>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim()
  if (faultDtc) {
    return { success: false, error: `Enedis (données techniques) a renvoyé une erreur : ${faultDtc}` }
  }

  const segmentCodesRaw = [...xmlDtc.matchAll(/segment[^>]*code=["']([^"']+)["']/gi)].map((m) => m[1].trim())
  const segmentCx = segmentCodesRaw.find((c) => /^C[1-5]$/i.test(c))?.toUpperCase() ?? null

  /* LE CODE DE LA FTA (« HTALU5 », « BTSUPCU4 »), jamais son libellé — c'est ce que la fiche affiche
     et ce que les listes de valeurs proposent. */
  const fta = xmlDtc.match(/formuleTarifaireAcheminement[^>]*code=["']([^"']+)["']/)?.[1]?.replace(/\s+/g, '').toUpperCase() ?? null
  const ftaLibelleRaw = xmlDtc.match(/<formuleTarifaireAcheminement[^>]*>[\s\S]*?<libelle>([^<]+)<\/libelle>/)?.[1] ?? null
  const ftaLibelle = ftaLibelleRaw ? decodeXml(ftaLibelleRaw) : null
  const puissanceMax = xmlDtc.match(/<puissanceSouscriteMax>[\s\S]*?<valeur>([^<]+)<\/valeur>/)?.[1] ?? null
  const puissanceRacc = xmlDtc.match(/<puissanceRaccordementSoutirage>[\s\S]*?<valeur>([^<]+)<\/valeur>/)?.[1] ?? null
  const domaineTension = xmlDtc.match(/domaineTension[^>]*code=["']([^"']+)["']/)?.[1] ?? null

  const dtUp = (domaineTension ?? '').toUpperCase()
  const segment =
    segmentCx ?? (dtUp === 'BTSUP' ? 'C4' : dtUp === 'BTINF' ? 'C5' : dtUp.startsWith('HTA') ? 'C3' : null)

  const tensionLib = xmlDtc.match(/<tensionLivraison>[\s\S]*?<libelle>([^<]+)<\/libelle>/)?.[1] ?? null
  let utilisation: string | null = null
  if (fta?.includes('CU')) utilisation = 'CU'
  else if (fta?.includes('MU')) utilisation = 'MU'
  else if (fta?.includes('LU')) utilisation = 'LU'

  const calFournLibelle = xmlDtc.match(/<calendrierFournisseur>[\s\S]*?<libelle>([^<]+)<\/libelle>/i)?.[1]?.trim() ?? null

  const adresseBloc = xmlDtc.match(/<adresseInstallation>([\s\S]*?)<\/adresseInstallation>/i)?.[1] ?? ''
  const pick = (tag: string) => {
    const m = adresseBloc.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'))?.[1]
    return m ? decodeXml(m) : null
  }
  const rueParts = [pick('numeroEtNomVoie'), pick('lieuDit'), pick('complementAdresse')].filter((p): p is string => !!p)
  const adresseElec = rueParts.length ? rueParts.join(' - ') : null
  const codePostalElec = pick('codePostal')
  const villeElec = (() => {
    const direct = pick('commune')
    if (direct) return direct
    const block = adresseBloc.match(/<commune\b[^>]*>([\s\S]*?)<\/commune>/i)?.[1] ?? ''
    const lib = block.match(/<libelle>([^<]+)<\/libelle>/i)?.[1]
    if (lib) return decodeXml(lib)
    const txt = block.match(/>([^<]+)</)?.[1] ?? block.match(/^([^<]+)/)?.[1]
    return txt && txt.trim() ? decodeXml(txt) : null
  })()

  // ─── Appel 2 : Mesures ───
  const xmlMesures = await postSoap(
    URL_MESURES,
    `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tec="http://www.enedis.fr/sge/b2b/technique/v1.0"
  xmlns:ope="http://www.enedis.fr/sge/b2b/services/consultermesures/v1.1">
  <soapenv:Header>
    <tec:entete><infoDemandeur><loginDemandeur>${login}</loginDemandeur></infoDemandeur></tec:entete>
  </soapenv:Header>
  <soapenv:Body>
    <ope:consulterMesures>
      <pointId>${pdlId}</pointId>
      <loginDemandeur>${login}</loginDemandeur>
      <contratId>${contratId}</contratId>
      <autorisationClient>true</autorisationClient>
    </ope:consulterMesures>
  </soapenv:Body>
</soapenv:Envelope>`,
    'Mesures',
  )

  const faultMesures = xmlMesures.match(/<faultstring>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim()
  if (faultMesures) {
    return { success: false, error: `Enedis (mesures) a renvoyé une erreur : ${faultMesures}` }
  }

  const codeRetour = xmlMesures.match(/resultat[^>]*code=["']([^"']+)["']/)?.[1]
  const libelleRetour = xmlMesures.match(/resultat[^>]*>([^<]+)</)?.[1]?.trim()
  if (codeRetour !== 'SGT200') {
    return {
      success: false,
      error: `Enedis mesures refusées (code ${codeRetour ?? 'inconnu'})${libelleRetour ? ` : ${libelleRetour}` : ''}`,
    }
  }

  let exempleMesure: string | null = null
  let exempleSerie: string | null = null
  const allDates: string[] = []
  const parCalendrier: Record<string, Record<string, number>> = {}
  const mesuresParCalendrier: Record<string, { classe: string; debut: string; fin: string; valeurKwh: number; estimee: boolean }[]> = {}
  for (const sm of [...xmlMesures.matchAll(/<serie[^>]*>([\s\S]*?)<\/serie>/g)]) {
    const sx = sm[1]
    const classe = sx.match(/classeTemporelle[^>]*code=["']([^"']+)["']/)?.[1]
    const unite = sx.match(/<unite>([^<]+)<\/unite>/)?.[1]?.toLowerCase()
    const calendrier = sx.match(/calendrier[^>]*code=["']([^"']+)["']/)?.[1] ?? '?'
    if (!classe || unite !== 'kwh') continue
    const cls = normClasse(classe)
    ;(parCalendrier[calendrier] ??= {})
    if (!exempleSerie) exempleSerie = sx.replace(/<mesure>[\s\S]*<\/mesure>/, '<mesure>…</mesure>').slice(0, 800)
    for (const mm of [...sx.matchAll(/<mesure>([\s\S]*?)<\/mesure>/g)]) {
      const mx = mm[1]
      if (!exempleMesure) exempleMesure = mx.replace(/<valeur>[^<]*<\/valeur>/, '<valeur>·</valeur>').slice(0, 800)
      const valeur = mx.match(/<valeur>([^<]+)<\/valeur>/)?.[1]
      const dateFin = mx.match(/<dateFin>([^<]+)<\/dateFin>/)?.[1]?.slice(0, 10)
      const dateDebut = mx.match(/<dateDebut>([^<]+)<\/dateDebut>/)?.[1]?.slice(0, 10)
      const statut = mx.match(/statut[^>]*code=["']([^"']+)["']/)?.[1]
      if (!valeur || !dateFin || statut === 'ANNULEE') continue
      allDates.push(dateFin)
      parCalendrier[calendrier][`${cls}|${dateFin}`] = (parCalendrier[calendrier][`${cls}|${dateFin}`] ?? 0) + parseFloat(valeur)
      if (dateDebut && !Number.isNaN(parseFloat(valeur))) {
        ;(mesuresParCalendrier[calendrier] ??= []).push({
          classe: cls, debut: dateDebut, fin: dateFin, valeurKwh: parseFloat(valeur), estimee: /ESTIM/i.test(statut ?? ''),
        })
      }
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7)
  const allMonths = [...new Set(allDates.map((d) => d.slice(0, 7)))].filter((m) => m < currentMonth).sort().reverse()
  const uniqueMonths = allMonths.slice(0, 12)
  const periods12 = new Set(uniqueMonths)

  const VENTIL = new Set(['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'HP', 'HC'])
  const calStats = Object.entries(parCalendrier)
    .map(([cal, entries]) => {
      const moisCouverts = new Set<string>()
      const classes = new Set<string>()
      for (const key of Object.keys(entries)) {
        const [classe, dateFin] = key.split('|')
        const mois = dateFin.slice(0, 7)
        if (periods12.has(mois)) {
          moisCouverts.add(mois)
          classes.add(classe)
        }
      }
      const hasVentil = [...classes].some((c) => VENTIL.has(c))
      return { cal, couverture: moisCouverts.size, hasVentil }
    })
    .filter((s) => s.couverture > 0)
  calStats.sort((a, b) => b.couverture - a.couverture || Number(b.hasVentil) - Number(a.hasVentil) || a.cal.localeCompare(b.cal))
  const calChoisi = calStats[0]?.cal ?? Object.keys(parCalendrier)[0] ?? null
  const consoKwhSrc = (calChoisi && parCalendrier[calChoisi]) || {}

  const conso12: Record<string, number> = {}
  for (const [key, val] of Object.entries(consoKwhSrc)) {
    const [classe, dateFin] = key.split('|')
    if (periods12.has(dateFin.slice(0, 7))) conso12[classe] = (conso12[classe] ?? 0) + val
  }
  const totalMwh = Object.values(conso12).reduce((a, b) => a + b, 0) / 1000

  /* Les douze mois civils qui précèdent le mois en cours — le mois en cours n'est jamais complet. */
  const douzeMois = new Set<string>()
  for (let i = 1; i <= 12; i++) {
    const d = new Date()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - i)
    douzeMois.add(d.toISOString().slice(0, 7))
  }
  const consoMensuelleMwh = calChoisi ? releveesMensuelles(mesuresParCalendrier[calChoisi] ?? []) : []

  const isHTA = !!segment && /^C[1-4]$/i.test(segment)
  const ORDRE = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE']

  const consoParClasseMwh: Record<string, number> = {}
  for (const [classe, val] of Object.entries(conso12)) {
    consoParClasseMwh[classe] = Math.round((val / 1000) * 1000) / 1000
  }

  const puissancesParClasse: Record<string, number> = {}
  const deniveleMatch =
    xmlDtc.match(/<denivelePuissances>([\s\S]*?)<\/denivelePuissances>/i)?.[1] ??
    xmlDtc.match(/<puissancesSouscritesSoutirage>([\s\S]*?)<\/puissancesSouscritesSoutirage>/i)?.[1] ??
    ''
  if (deniveleMatch) {
    for (const pm of deniveleMatch.matchAll(/classeTemporelle[^>]*code=["']([^"']+)["'][\s\S]*?<valeur>([^<]+)<\/valeur>/gi)) {
      const cls = normClasse(pm[1])
      const v = parseFloat(pm[2])
      if (!Number.isNaN(v)) puissancesParClasse[cls] = v
    }
  }

  const orderObj = (obj: Record<string, number>, fillAll = false) => {
    const out: Record<string, number> = {}
    for (const k of ORDRE) {
      if (k in obj) out[k] = obj[k]
      else if (fillAll) out[k] = 0
    }
    for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k]
    return out
  }

  const c5Classes = Object.keys(conso12)
  const c5HasSeason = ['HPH', 'HCH', 'HPE', 'HCE'].some((k) => c5Classes.includes(k))
  const c5HasHpHc = ['HP', 'HC'].some((k) => c5Classes.includes(k))
  let calendrierFournisseur: 'BASE' | 'HP/HC' = c5HasSeason || c5HasHpHc ? 'HP/HC' : 'BASE'
  if (calFournLibelle) {
    if (/heures?\s*pleines|heures?\s*creuses|hp\/?hc/i.test(calFournLibelle)) calendrierFournisseur = 'HP/HC'
    else if (/\bbase\b/i.test(calFournLibelle) && !c5HasSeason && !c5HasHpHc) calendrierFournisseur = 'BASE'
  }

  return {
    success: true,
    pdlId,
    segment,
    fta,
    ftaLibelle,
    utilisation,
    domaineTension,
    tensionLivraison: tensionLib,
    isHTA,
    calendrierFournisseur,
    puissanceSouscrite: puissanceMax ? parseFloat(puissanceMax) : null,
    puissanceRaccordement: puissanceRacc ? parseFloat(puissanceRacc) : null,
    /* EN C5, UNE SEULE PUISSANCE SOUSCRITE, rangée en BASE — la classe que le formulaire de création
       emploie déjà pour la « PS unique ». Elle était reçue et jetée. */
    puissancesParClasse: isHTA
      ? orderObj(puissancesParClasse, true)
      : puissanceMax && !Number.isNaN(parseFloat(puissanceMax)) ? { BASE: parseFloat(puissanceMax) } : null,
    adresse: adresseElec,
    codePostalSite: codePostalElec,
    ville: villeElec,
    consoParClasseMwh: orderObj(consoParClasseMwh, isHTA),
    consoTotaleMwh: Math.round(totalMwh * 1000) / 1000,
    consoTotaleKwh: Math.round(totalMwh * 1000),
    periodeDebut: uniqueMonths.length ? `${uniqueMonths[uniqueMonths.length - 1]}-01` : null,
    periodeFin: uniqueMonths.length ? `${uniqueMonths[0]}-01` : null,
    consoMensuelleMwh,
    diagnostic: {
      nbSeries: [...xmlMesures.matchAll(/<serie[^>]*>/g)].length,
      nbMesures: [...xmlMesures.matchAll(/<mesure>/g)].length,
      balises: [...new Set([...xmlMesures.matchAll(/<([a-zA-Z][\w:]*)[\s>]/g)].map((m) => m[1]))].slice(0, 80),
      exempleSerie,
      exempleMesure,
      calendriers: Object.keys(parCalendrier),
      calChoisi,
      douzeMois: [...douzeMois],
      periodes: (calChoisi ? mesuresParCalendrier[calChoisi] ?? [] : []).map((x) => `${x.classe} ${x.debut}→${x.fin}`).slice(-80),
      moisRetenus: consoMensuelleMwh.map((m) => m.mois),
    },
  }
}
