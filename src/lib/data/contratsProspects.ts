import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ContratProspect } from '@/types/domain'

/**
 * LES CONTRATS PROSPECTS D'UN COMPTEUR — lecture, enregistrement, suppression.
 *
 * Voir la migration `les_contrats_prospects` : une table à part, que rien d'autre que la fiche
 * compteur ne lit. Aucun automatisme (suivi, Slack, DocuSign, commissions) ne la connaît.
 */

interface RawProspect {
  id: string
  compteur_id: string
  fournisseur_compte_id: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois: number | null
  date_creation: string
  date_modification: string
  fournisseur: { nom: string } | null
  cree_par: { prenom: string; nom: string } | null
  modifie_par: { prenom: string; nom: string } | null
}

const nomDe = (p: { prenom: string; nom: string } | null) => (p ? `${p.prenom} ${p.nom}`.trim() : null)

export function useContratsProspects(compteurId: string | undefined) {
  return useQuery({
    queryKey: ['contrats_prospects', compteurId],
    enabled: !!compteurId,
    queryFn: async (): Promise<ContratProspect[]> => {
      const { data, error } = await supabase
        .from('contrats_prospects')
        .select('id, compteur_id, fournisseur_compte_id, date_debut, date_fin, duree_mois, date_creation, date_modification, fournisseur:comptes!contrats_prospects_fournisseur_compte_id_fkey(nom), cree_par:profils!contrats_prospects_cree_par_id_fkey(prenom, nom), modifie_par:profils!contrats_prospects_modifie_par_id_fkey(prenom, nom)')
        .eq('compteur_id', compteurId as string)
        .order('date_fin', { ascending: true, nullsFirst: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as RawProspect[]).map((r) => ({
        id: r.id,
        compteur_id: r.compteur_id,
        fournisseur_compte_id: r.fournisseur_compte_id,
        fournisseur_nom: r.fournisseur?.nom ?? null,
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        duree_mois: r.duree_mois,
        cree_par_nom: nomDe(r.cree_par),
        modifie_par_nom: nomDe(r.modifie_par),
        date_creation: r.date_creation,
        date_modification: r.date_modification,
      }))
    },
  })
}

/** Les comptes fournisseurs, pour le choix du fournisseur : 53 lignes, pas les 2 700 comptes. */
export function useFournisseursChoix() {
  return useQuery({
    queryKey: ['comptes', 'fournisseurs', 'choix'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ id: string; nom: string }[]> => {
      const { data, error } = await supabase
        .from('comptes')
        .select('id, nom')
        .eq('type_compte', 'fournisseur')
        .eq('actif', true)
        .order('nom')
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; nom: string }[]
    },
  })
}

export interface SaisieContratProspect {
  id?: string
  compteur_id: string
  fournisseur_compte_id: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois: number | null
}

export function useEnregistrerContratProspect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...champs }: SaisieContratProspect) => {
      const requete = id
        ? supabase.from('contrats_prospects').update(champs).eq('id', id).select('id').single()
        : supabase.from('contrats_prospects').insert(champs).select('id').single()
      const { data, error } = await requete
      if (error) throw new Error(error.message)
      return (data as { id: string }).id
    },
    /* Le compteur aussi : la base vient peut-être de le faire passer Client ↔ Prospect. */
    onSuccess: (_id, v) => {
      void queryClient.invalidateQueries({ queryKey: ['contrats_prospects', v.compteur_id] })
      void queryClient.invalidateQueries({ queryKey: ['compteurs'] })
    },
  })
}

export function useSupprimerContratProspect() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; compteur_id: string }) => {
      const { error, count } = await supabase.from('contrats_prospects').delete({ count: 'exact' }).eq('id', id)
      if (error) throw new Error(error.message)
      if (!count) throw new Error('Ce contrat n’a pas pu être supprimé.')
    },
    onSuccess: (_r, v) => {
      void queryClient.invalidateQueries({ queryKey: ['contrats_prospects', v.compteur_id] })
      void queryClient.invalidateQueries({ queryKey: ['compteurs'] })
    },
  })
}
