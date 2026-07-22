import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { mockSignaux } from '@/lib/mockData'
import type { Signal } from '@/types/domain'

interface RawSignal {
  id: string
  site_id: string
  date_creation: string
  commentaire: string | null
  proprietaire_id: string | null
  type_signal: { libelle: string } | null
  statut: { code: string } | null
  site: { nom: string } | null
  responsable: { prenom: string; nom: string } | null
}

async function fetchSignaux(): Promise<Signal[]> {
  if (isDemoMode()) return mockSignaux

  try {
    const { data, error } = await supabase
      .from('signaux')
      .select(
        'id, site_id, date_creation, commentaire, proprietaire_id, type_signal:types_signaux(libelle), statut:statuts_signaux(code), site:sites(nom), responsable:profils(prenom, nom)',
      )
      .order('date_creation', { ascending: false })
    if (error) throw error

    return ((data ?? []) as unknown as RawSignal[]).map((s) => ({
      id: s.id,
      site_id: s.site_id,
      site_nom: s.site?.nom ?? '',
      type_signal: s.type_signal?.libelle ?? '',
      statut: s.statut?.code ?? '',
      conseiller: s.responsable ? `${s.responsable.prenom} ${s.responsable.nom}` : '',
      date_creation: s.date_creation,
      description: s.commentaire ?? '',
      proprietaire_id: s.proprietaire_id ?? null,
    }))
  } catch (error) {
    console.error('fetchSignaux', error)
    return []
  }
}

export function useSignaux() {
  return useQuery({ queryKey: ['signaux'], queryFn: fetchSignaux })
}

interface CreateSignalInput {
  site_id: string
  site_nom: string
  type_signal_id: string | null
  type_signal_libelle: string
  statut_id: string | null
  description: string
}

interface CreateSignalResult {
  signal: Signal
  persisted: boolean
}

export function useCreateSignal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSignalInput): Promise<CreateSignalResult> => {
      const now = new Date().toISOString()
      let persisted = false
      let signal: Signal = {
        id: `local-${Date.now()}`,
        site_id: input.site_id,
        site_nom: input.site_nom,
        type_signal: input.type_signal_libelle,
        statut: 'NOUVEAU',
        conseiller: '',
        date_creation: now,
        description: input.description,
        proprietaire_id: null,
      }

      if (!isDemoMode()) {
        const { data, error } = await supabase
          .from('signaux')
          .insert({
            site_id: input.site_id,
            commentaire: input.description,
            ...(input.type_signal_id ? { type_signal_id: input.type_signal_id } : {}),
            ...(input.statut_id ? { statut_id: input.statut_id } : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          signal = { ...signal, id: (data as { id: string }).id }
          persisted = true
        }
      }

      queryClient.setQueryData<Signal[]>(['signaux'], (old) => (old ? [signal, ...old] : [signal]))
      return { signal, persisted }
    },
  })
}
