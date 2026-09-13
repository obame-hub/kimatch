import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Consommation } from '@/types/domain'
import { replierOuRelancer } from '@/lib/data/erreurLecture'

async function fetchConsommations(): Promise<Consommation[]> {
  try {
    const { data, error } = await supabase
      .from('consommations')
      .select('id, compteur_id, date_debut_periode, date_fin_periode, quantite, unite, poste_tarifaire, type_valeur, source, commentaire')
      .order('date_debut_periode', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as Consommation[]
  } catch (error) {
    /* Audit 13/09/2026, ERR-02 : un échec ne se déguise plus en absence de données.
       Seul un schéma pas encore migré rend un résultat vide ; le reste remonte. */
    return replierOuRelancer(error, { ou: 'fetchConsommations' }, [])
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
    /* Audit 13/09/2026, CAC-01 : le patch ci-dessus ne touche que la clé de LISTE, alors que
       les fiches lisent une clé dérivée (['consommations', 'compte', id] et compagnie). Sans cette
       ligne, ce qu'on vient de créer n'apparaissait qu'après un rechargement complet — le
       staleTime est à cinq minutes et le rafraîchissement au focus est coupé. Invalider le
       PRÉFIXE atteint la liste et toutes ses dérivées d'un coup. */
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['consommations'] }) },
  })
}
