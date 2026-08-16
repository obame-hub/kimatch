import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type TypeDemandeSupport = 'bug' | 'evolution'
export type StatutDemandeSupport = 'NOUVELLE' | 'EN_COURS' | 'RESOLUE' | 'REJETEE'

export interface DemandeSupport {
  id: string
  type: TypeDemandeSupport
  titre: string
  description: string | null
  statut: StatutDemandeSupport
  auteur_id: string | null
  auteur_nom: string | null
  date_creation: string
}

async function fetchDemandesSupport(): Promise<DemandeSupport[]> {
  const { data, error } = await supabase
    .from('demandes_support')
    .select('id, type, titre, description, statut, auteur_id, auteur_nom, date_creation')
    .order('date_creation', { ascending: false })
  if (error || !data) return []
  return data as unknown as DemandeSupport[]
}

export function useDemandesSupport() {
  return useQuery({ queryKey: ['demandes-support'], queryFn: fetchDemandesSupport })
}

export function useCreateDemandeSupport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      type,
      titre,
      description,
      auteurId,
      auteurNom,
    }: {
      type: TypeDemandeSupport
      titre: string
      description: string
      auteurId: string | null
      auteurNom: string
    }) => {
      const demande: DemandeSupport = {
        id: `local-${Date.now()}`,
        type,
        titre: titre.trim(),
        description: description.trim() || null,
        statut: 'NOUVELLE',
        auteur_id: auteurId,
        auteur_nom: auteurNom,
        date_creation: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('demandes_support')
        .insert({
          type: demande.type,
          titre: demande.titre,
          description: demande.description,
          auteur_id: demande.auteur_id,
          auteur_nom: demande.auteur_nom,
        })
        .select('id, date_creation')
        .single()
      if (!error && data) {
        demande.id = (data as { id: string }).id
        demande.date_creation = (data as { date_creation: string }).date_creation
      }

      queryClient.setQueryData<DemandeSupport[]>(['demandes-support'], (old) => (old ? [demande, ...old] : [demande]))
      return demande
    },
  })
}

export function useUpdateStatutDemandeSupport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: StatutDemandeSupport }) => {
      const { error } = await supabase.from('demandes_support').update({ statut }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['demandes-support'] }) },
  })
}
