import { useMutation } from '@tanstack/react-query'
import { authHeader } from '@/lib/data/authHeader'

export interface EllisphereScore {
  siren: string
  score: string | null
  scale: string | null
  /** Classe de risque en clair, ex. « Risque moyen à élevé (classe C) ». Absent si seul le
   * repli « liste de surveillance » a répondu (il ne porte que la note brute). */
  creditOpinion: string | null
  /** Points faibles / commentaire du score. Même réserve que creditOpinion. */
  paymentIncidents: string | null
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: await authHeader() })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data as T
}

export function useEllisphereScore() {
  return useMutation({
    mutationFn: (siren: string) => fetchJson<EllisphereScore>(`/api/ellisphere/score?siren=${encodeURIComponent(siren)}`),
  })
}
