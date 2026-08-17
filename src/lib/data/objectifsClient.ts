import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Objectifs du client sur une recommandation — l'onglet « Commande du client » de la maquette.
 *
 * Huit objectifs cochables, dont UN peut être désigné prioritaire. Les libellés viennent de
 * `types_objectifs_client`, alimentée par la migration 20260816180000 avec les mots exacts du
 * design (« Maximiser les économies », etc.) : ils ne sont pas recopiés ici, sinon l'écran et la
 * base diraient deux choses différentes le jour où la liste évolue.
 *
 * Pourquoi la contrainte d'unicité du prioritaire est tenue par la base et pas ici : deux
 * conseillers sur deux postes peuvent cocher « prioritaire » au même instant. L'index partiel
 * `idx_reco_objectif_prioritaire_unique` les arbitre ; le code ci-dessous se contente de retirer
 * l'ancien avant de poser le nouveau, ce qui évite de tomber sur l'erreur dans le cas normal.
 */

export interface TypeObjectifClient {
  id: string
  code: string
  libelle: string
  ordre: number
}

export interface ObjectifRecommandation {
  type_objectif_id: string
  code: string
  libelle: string
  ordre: number
  prioritaire: boolean
}

/** Les huit objectifs de référence, dans l'ordre du design. */
export function useTypesObjectifsClient() {
  return useQuery({
    queryKey: ['types_objectifs_client'],
    // Table de référence : elle ne change qu'à la main, une heure de cache évite de la relire à
    // chaque montage de la fiche.
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<TypeObjectifClient[]> => {
      const { data, error } = await supabase
        .from('types_objectifs_client')
        .select('id, code, libelle, ordre')
        .eq('actif', true)
        .order('ordre')
      if (error) {
        console.error('useTypesObjectifsClient', error)
        return []
      }
      return data ?? []
    },
  })
}

/** Ce que ce client-ci a demandé. Liste vide = rien n'a encore été coché. */
export function useObjectifsRecommandation(recoId: string | undefined) {
  return useQuery({
    queryKey: ['recommandations', 'objectifs', recoId],
    enabled: !!recoId,
    queryFn: async (): Promise<ObjectifRecommandation[]> => {
      const { data, error } = await supabase
        .from('recommandations_objectifs')
        .select('type_objectif_id, prioritaire, type_objectif:types_objectifs_client(code, libelle, ordre)')
        .eq('recommandation_id', recoId as string)
      if (error) {
        console.error('useObjectifsRecommandation', error)
        return []
      }
      type Ligne = {
        type_objectif_id: string
        prioritaire: boolean
        type_objectif: { code: string; libelle: string; ordre: number } | null
      }
      return ((data ?? []) as unknown as Ligne[])
        .map((o) => ({
          type_objectif_id: o.type_objectif_id,
          code: o.type_objectif?.code ?? '',
          libelle: o.type_objectif?.libelle ?? '',
          ordre: o.type_objectif?.ordre ?? 0,
          prioritaire: o.prioritaire,
        }))
        .sort((a, b) => a.ordre - b.ordre)
    },
  })
}

function invalider(queryClient: ReturnType<typeof useQueryClient>, recoId: string) {
  return queryClient.invalidateQueries({ queryKey: ['recommandations', 'objectifs', recoId] })
}

/** Coche ou décoche un objectif. Décocher retire aussi la priorité : un objectif que le client
 *  n'a pas exprimé ne peut pas être son objectif prioritaire. */
export function useBasculerObjectifClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { recommandationId: string; typeObjectifId: string; actif: boolean }) => {
      if (!input.actif) {
        const { error } = await supabase
          .from('recommandations_objectifs')
          .delete()
          .eq('recommandation_id', input.recommandationId)
          .eq('type_objectif_id', input.typeObjectifId)
        if (error) throw new Error(error.message)
        return
      }
      const { error } = await supabase
        .from('recommandations_objectifs')
        .insert({ recommandation_id: input.recommandationId, type_objectif_id: input.typeObjectifId })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, input) => invalider(queryClient, input.recommandationId),
  })
}

/**
 * Désigne l'objectif prioritaire, ou le retire si c'était déjà lui.
 *
 * L'ancien prioritaire est remis à `false` AVANT de poser le nouveau, dans cet ordre : l'index
 * unique partiel de la base refuserait deux `prioritaire` simultanés sur la même recommandation.
 */
export function useDesignerObjectifPrioritaire() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { recommandationId: string; typeObjectifId: string | null }) => {
      const { error: eRetrait } = await supabase
        .from('recommandations_objectifs')
        .update({ prioritaire: false })
        .eq('recommandation_id', input.recommandationId)
        .eq('prioritaire', true)
      if (eRetrait) throw new Error(eRetrait.message)

      if (!input.typeObjectifId) return

      const { error } = await supabase
        .from('recommandations_objectifs')
        .update({ prioritaire: true })
        .eq('recommandation_id', input.recommandationId)
        .eq('type_objectif_id', input.typeObjectifId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, input) => invalider(queryClient, input.recommandationId),
  })
}
