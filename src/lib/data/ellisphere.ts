import { useMutation } from '@tanstack/react-query'

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

export interface EllisphereScore {
  siren: string
  score: string | null
  scale: string | null
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data as T
}

function isIdentifier(query: string) {
  const digits = query.replace(/\s/g, '')
  return /^\d{9}$|^\d{14}$/.test(digits)
}

export function useEllisphereSearch() {
  return useMutation({
    mutationFn: async (query: string): Promise<EllisphereCompany[]> => {
      const trimmed = query.trim()
      if (isIdentifier(trimmed)) {
        const { company } = await fetchJson<{ company: EllisphereCompany | null }>(
          `/api/ellisphere/search?siret=${encodeURIComponent(trimmed)}`,
        )
        return company ? [company] : []
      }
      const { companies } = await fetchJson<{ companies: EllisphereCompany[] }>(
        `/api/ellisphere/search?name=${encodeURIComponent(trimmed)}`,
      )
      return companies
    },
  })
}

export function useEllisphereScore() {
  return useMutation({
    mutationFn: (siren: string) => fetchJson<EllisphereScore>(`/api/ellisphere/score?siren=${encodeURIComponent(siren)}`),
  })
}
