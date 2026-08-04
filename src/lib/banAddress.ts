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
  properties: { label: string; name?: string; postcode?: string; city?: string }
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
