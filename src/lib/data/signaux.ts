import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockSignaux } from '@/lib/mockData'
import type { Signal } from '@/types/domain'

interface RawSignal {
  id: string
  site_id: string
  date_detection: string
  commentaire: string | null
  severite: 'basse' | 'normale' | 'haute' | 'critique' | null
  date_snooze: string | null
  type_signal: { libelle: string } | null
  statut: { code: string } | null
  site: { nom: string } | null
  responsable: { prenom: string; nom: string } | null
}

async function fetchSignaux(): Promise<Signal[]> {
  if (!isSupabaseConfigured) return mockSignaux

  try {
    const { data, error } = await supabase
      .from('signaux')
      .select(
        'id, site_id, date_detection, commentaire, severite, date_snooze, type_signal:types_signaux(libelle), statut:statuts_signaux(code), site:sites(nom), responsable:profils(prenom, nom)',
      )
      .order('date_detection', { ascending: false })
    if (error) throw error

    return ((data ?? []) as unknown as RawSignal[]).map((s) => ({
      id: s.id,
      site_id: s.site_id,
      site_nom: s.site?.nom ?? '',
      type_signal: s.type_signal?.libelle ?? '',
      statut: s.statut?.code ?? '',
      severite: s.severite ?? 'normale',
      date_snooze: s.date_snooze,
      conseiller: s.responsable ? `${s.responsable.prenom} ${s.responsable.nom}` : '',
      date_creation: s.date_detection,
      description: s.commentaire ?? '',
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
  severite: 'basse' | 'normale' | 'haute' | 'critique'
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
        severite: input.severite,
        date_snooze: null,
        conseiller: '',
        date_creation: now,
        description: input.description,
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('signaux')
          .insert({
            site_id: input.site_id,
            commentaire: input.description,
            date_detection: now,
            severite: input.severite,
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

interface SnoozeSignalResult {
  persisted: boolean
}

export function useSnoozeSignal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, date_snooze }: { id: string; date_snooze: string | null }): Promise<SnoozeSignalResult> => {
      let persisted = false

      if (isSupabaseConfigured) {
        const { error } = await supabase.from('signaux').update({ date_snooze }).eq('id', id)
        persisted = !error
      }

      queryClient.setQueryData<Signal[]>(['signaux'], (old) =>
        old ? old.map((s) => (s.id === id ? { ...s, date_snooze } : s)) : old,
      )
      return { persisted }
    },
  })
}
