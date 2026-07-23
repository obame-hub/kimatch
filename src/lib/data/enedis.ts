import { useMutation } from '@tanstack/react-query'

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
}

export function useEnedisFetch() {
  return useMutation({
    mutationFn: async (pdlId: string): Promise<EnedisElecResult> => {
      const res = await fetch('/api/enedis/fetch-elec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdlId }),
      })
      const data = (await res.json()) as EnedisElecResult
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
      return data
    },
  })
}
