import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Consommation } from '@/types/domain'

async function fetchConsommations(): Promise<Consommation[]> {
  try {
    const { data, error } = await supabase
      .from('consommations')
      .select('id, compteur_id, date_debut_periode, date_fin_periode, quantite, unite, poste_tarifaire, type_valeur, source, commentaire')
      .order('date_debut_periode', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as Consommation[]
  } catch (error) {
    console.error('fetchConsommations', error)
    return []
  }
}

export function useConsommations() {
  return useQuery({ queryKey: ['consommations'], queryFn: fetchConsommations })
}

interface CreateConsommationInput {
  compteur_id: string
  date_debut_periode: string
  date_fin_periode: string
  quantite: number
  unite: string
  poste_tarifaire: string
  type_valeur: string
  source: string | null
  commentaire: string | null
}

interface CreateConsommationResult {
  consommation: Consommation
  persisted: boolean
}

export function useCreateConsommation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateConsommationInput): Promise<CreateConsommationResult> => {
      let persisted = false
      let consommation: Consommation = { id: `local-${Date.now()}`, ...input }

      const { data, error } = await supabase.from('consommations').insert(input).select('id').single()
      if (!error && data) {
        consommation = { ...consommation, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<Consommation[]>(['consommations'], (old) => (old ? [consommation, ...old] : [consommation]))
      return { consommation, persisted }
    },
  })
}
