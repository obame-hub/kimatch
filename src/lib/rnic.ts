// Recherche RNIC (Registre National d'Immatriculation des Copropriétés), API publique gratuite
// de l'Etat, sans cle -- utilisee pour le type de compte "Syndic non professionnel" (residences),
// exactement comme dans Tools (src/lib/account-actions.ts). Aucun equivalent Salesforce/Ellisphere
// pour ce type de compte : les residences n'ont pas de SIREN.

export interface RnicResult {
  numero: string
  nom: string
  adresse: string | null
  ville: string | null
  codePostal: string | null
  nombreLots: number | null
  nombreLotsHabitation: number | null
  nombreLotsCommerces: number | null
  nombreLotsStationnement: number | null
  dateCreation: string | null
  periodeConstruction: string | null
  typeSyndic: string | null
  syndicNom: string | null
  mandatEnCours: boolean | null
  dateFinMandat: string | null
}

interface RnicRaw {
  numero_immatriculation?: string | null
  nom_usage_copropriete?: string | null
  adresse_reference?: string | null
  code_postal_adresse?: string | null
  commune_adresse?: string | null
  nombre_total_lots?: string | number | null
  nombre_lots_habitation?: string | number | null
  nombre_lots_habitation_bureaux_commerces?: string | number | null
  nombre_lots_stationnement?: string | number | null
  date_immatriculation?: string | null
  date_reglement_copropriete?: string | null
  date_fin_dernier_mandat?: string | null
  mandat_en_cours?: string | null
  raison_sociale_representant_legal?: string | null
  type_syndic?: string | null
  periode_construction?: string | null
}

const RNIC_RESOURCE_ID = '3ea8e2c3-0038-464a-b17e-cd5c91f65ce2'
const RNIC_BASE = `https://tabular-api.data.gouv.fr/api/resources/${RNIC_RESOURCE_ID}/data/`

const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}
const formatPeriode = (v?: string | null): string | null => {
  if (!v) return null
  const m = v.match(/DE_(\d{4})_A_(\d{4})/)
  if (m) return `${m[1]} – ${m[2]}`
  if (v.startsWith('AVANT_')) return `Avant ${v.replace('AVANT_', '')}`
  if (v.startsWith('APRES_')) return `Après ${v.replace('APRES_', '')}`
  return v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function mapRnic(r: RnicRaw): RnicResult {
  const mandat = (r.mandat_en_cours ?? '').toLowerCase()
  return {
    numero: r.numero_immatriculation ?? '',
    nom: r.nom_usage_copropriete ?? '—',
    adresse: r.adresse_reference ?? null,
    ville: r.commune_adresse ?? null,
    codePostal: r.code_postal_adresse ?? null,
    nombreLots: toInt(r.nombre_total_lots),
    nombreLotsHabitation: toInt(r.nombre_lots_habitation),
    nombreLotsCommerces: toInt(r.nombre_lots_habitation_bureaux_commerces),
    nombreLotsStationnement: toInt(r.nombre_lots_stationnement),
    dateCreation: r.date_reglement_copropriete ?? r.date_immatriculation ?? null,
    periodeConstruction: formatPeriode(r.periode_construction),
    typeSyndic: r.type_syndic ?? null,
    syndicNom: r.raison_sociale_representant_legal ?? null,
    mandatEnCours: mandat.includes('pas de mandat') ? false : mandat ? true : null,
    dateFinMandat: r.date_fin_dernier_mandat ?? null,
  }
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export async function searchRnic(query: string, signal?: AbortSignal): Promise<RnicResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const isImmat = /^[A-Za-z]{1,3}\d{3,}$/.test(q.replace(/\s+/g, ''))

  const fetchRows = async (qs: string): Promise<RnicRaw[]> => {
    try {
      const res = await fetch(`${RNIC_BASE}?${qs}`, { signal })
      if (!res.ok) return []
      const json = await res.json()
      return (json.data ?? []) as RnicRaw[]
    } catch {
      return []
    }
  }

  if (isImmat) {
    const rows = await fetchRows(`numero_immatriculation__contains=${encodeURIComponent(q.toUpperCase())}&page_size=8`)
    return rows.map(mapRnic)
  }

  const normalized = stripAccents(q.toLowerCase()).replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim()
  const postcodeMatch = normalized.match(/\b(\d{5})\b/)
  const postcode = postcodeMatch?.[1] ?? null
  const withoutPostcode = postcode ? normalized.replace(postcode, '').trim() : normalized

  const tokens = withoutPostcode.split(/\s+/).filter((t) => t.length >= 2)
  const pivot = [...tokens].sort((a, b) => b.length - a.length)[0] ?? null

  const queries: string[] = []
  const nameUpper = withoutPostcode.toLocaleUpperCase('fr-FR').trim()
  if (postcode && nameUpper) queries.push(`code_postal_adresse__exact=${postcode}&nom_usage_copropriete__contains=${encodeURIComponent(nameUpper)}&page_size=30`)
  if (nameUpper) queries.push(`nom_usage_copropriete__contains=${encodeURIComponent(nameUpper)}&page_size=30`)
  if (postcode && pivot) queries.push(`code_postal_adresse__exact=${postcode}&adresse_reference__contains=${encodeURIComponent(pivot)}&page_size=30`)

  const settled = await Promise.all(queries.map(fetchRows))
  const seen = new Map<string, { r: RnicRaw; score: number }>()
  for (const rows of settled) {
    for (const r of rows) {
      const key = r.numero_immatriculation ?? `${r.nom_usage_copropriete}|${r.adresse_reference}`
      const name = stripAccents((r.nom_usage_copropriete ?? '').toLowerCase())
      const addr = stripAccents((r.adresse_reference ?? '').toLowerCase())
      let score = 0
      for (const t of tokens) {
        if (name.includes(t)) score += t.length * 2
        if (addr.includes(t)) score += 1
      }
      if (postcode && r.code_postal_adresse === postcode) score += 20
      const prev = seen.get(key)
      if (!prev || prev.score < score) seen.set(key, { r, score })
    }
  }

  return [...seen.values()]
    .filter((x) => x.score > 0 || !pivot)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => mapRnic(x.r))
}
