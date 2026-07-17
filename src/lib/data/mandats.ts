import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockMandats } from '@/lib/mockData'
import type { Mandat } from '@/types/domain'

interface RawMandat {
  id: string
  compte_id: string
  date_signature: string | null
  compte: { nom: string } | null
  statut: { code: string } | null
}

async function fetchMandats(): Promise<Mandat[]> {
  if (!isSupabaseConfigured) return mockMandats
  try {
    const [mandatsRes, sitesRes] = await Promise.all([
      supabase.from('mandats').select('id, compte_id, date_signature, compte:comptes(nom), statut:statuts_mandats(code)'),
      supabase.from('mandats_sites').select('mandat_id'),
    ])
    if (mandatsRes.error || !mandatsRes.data || mandatsRes.data.length === 0) throw mandatsRes.error ?? new Error('empty')

    const sitesParMandat = new Map<string, number>()
    for (const ms of (sitesRes.data ?? []) as unknown as { mandat_id: string }[]) {
      sitesParMandat.set(ms.mandat_id, (sitesParMandat.get(ms.mandat_id) ?? 0) + 1)
    }

    return (mandatsRes.data as unknown as RawMandat[]).map((m) => ({
      id: m.id,
      compte_id: m.compte_id,
      compte_nom: m.compte?.nom ?? '',
      statut: m.statut?.code ?? '',
      date_signature: m.date_signature,
      nb_sites_couverts: sitesParMandat.get(m.id) ?? 0,
    }))
  } catch {
    return mockMandats
  }
}

export function useMandats() {
  return useQuery({ queryKey: ['mandats'], queryFn: fetchMandats })
}

interface CreateMandatInput {
  compte_id: string
  compte_nom: string
  site_ids: string[]
  date_signature: string | null
}

interface CreateMandatResult {
  mandat: Mandat
  persisted: boolean
}

export function useCreateMandat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateMandatInput): Promise<CreateMandatResult> => {
      let persisted = false
      let mandat: Mandat = {
        id: `local-${Date.now()}`,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        statut: 'A_PREPARER',
        date_signature: input.date_signature,
        nb_sites_couverts: input.site_ids.length,
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('mandats')
          .insert({ compte_id: input.compte_id, date_signature: input.date_signature })
          .select('id')
          .single()
        if (!error && data) {
          const mandatId = (data as { id: string }).id
          mandat = { ...mandat, id: mandatId }
          persisted = true
          if (input.site_ids.length > 0) {
            await supabase
              .from('mandats_sites')
              .insert(input.site_ids.map((site_id) => ({ mandat_id: mandatId, site_id })))
          }
        }
      }

      queryClient.setQueryData<Mandat[]>(['mandats'], (old) => (old ? [mandat, ...old] : [mandat]))
      return { mandat, persisted }
    },
  })
}
