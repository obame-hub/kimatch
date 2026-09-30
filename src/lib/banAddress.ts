// Autocomplétion d'adresse via la BAN (Base Adresse Nationale, api-adresse.data.gouv.fr) --
// API publique gratuite de l'État, sans clé. Confirmé en lisant le code de Tools : malgré ce qui
// a été dit en réunion, ce n'est PAS Google Maps/Places qui est utilisé pour ça.

export interface BanAddress {
  label: string
  rue: string | null
  codePostal: string | null
  ville: string | null
  latitude: number | null
  longitude: number | null
}

interface BanFeature {
  properties: { label: string; name?: string; postcode?: string; city?: string; score?: number; type?: string }
  geometry: { coordinates: [number, number] }
}

export async function searchAddressBAN(query: string, signal?: AbortSignal): Promise<BanAddress[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const json = await res.json()
  const features = (json.features ?? []) as BanFeature[]
  return features.map((f) => ({
    label: f.properties.label,
    rue: f.properties.name ?? null,
    codePostal: f.properties.postcode ?? null,
    ville: f.properties.city ?? null,
    latitude: f.geometry.coordinates?.[1] ?? null,
    longitude: f.geometry.coordinates?.[0] ?? null,
  }))
}

/**
 * ══ LOCALISER UNE ADRESSE, SEULEMENT SI LA BAN EN EST SÛRE ══
 *
 * Fiche compteur v4 (30/09/2026) : 879 compteurs n'ont pas de coordonnées, et la carte restait vide.
 * On demande la position à la BAN au moment de l'afficher — mais un point ne se pose que si la
 * réponse désigne un NUMÉRO ou une RUE (pas le centre de la commune) avec un score d'au moins 0,6,
 * dans le code postal du compteur. Une carte qui pointe le mauvais immeuble est pire qu'une carte
 * vide.
 */
export async function geocoderPrecis(
  adresse: string | null | undefined,
  codePostal: string | null | undefined,
  ville: string | null | undefined,
): Promise<{ latitude: number; longitude: number } | null> {
  const rue = (adresse ?? '').trim()
  const cp = (codePostal ?? '').trim()
  if (!rue || !/^\d{5}$/.test(cp)) return null
  const q = [rue, cp, (ville ?? '').trim()].filter(Boolean).join(' ')
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&postcode=${cp}&limit=1`)
  if (!res.ok) return null
  const json = await res.json()
  const f = ((json.features ?? []) as BanFeature[])[0]
  if (!f || (f.properties.score ?? 0) < 0.6 || !['housenumber', 'street'].includes(f.properties.type ?? '')) return null
  const [lon, lat] = f.geometry.coordinates ?? []
  return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null
}
