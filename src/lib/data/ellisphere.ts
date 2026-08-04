import { useMutation } from '@tanstack/react-query'

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

export function useEllisphereScore() {
  return useMutation({
    mutationFn: (siren: string) => fetchJson<EllisphereScore>(`/api/ellisphere/score?siren=${encodeURIComponent(siren)}`),
  })
}
