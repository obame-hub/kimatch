import { useMutation } from '@tanstack/react-query'
import { authHeaderJson } from '@/lib/data/authHeader'

export interface GrdGazResult {
  success: boolean
  error?: string
  pce?: string
  carMwh?: number | null
  profil?: string | null
  tarif?: string | null
  nomSite?: string | null
  adresse?: string | null
  codePostalSite?: string | null
  ville?: string | null
}

export function useGrdFetch() {
  return useMutation({
    mutationFn: async ({ pce, codePostal }: { pce: string; codePostal: string }): Promise<GrdGazResult> => {
      const res = await fetch('/api/grd/fetch-gaz', {
        method: 'POST',
        headers: await authHeaderJson(),
        body: JSON.stringify({ pce, codePostal }),
      })
      const data = (await res.json()) as GrdGazResult
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
      return data
    },
  })
}
