import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import type { Remuneration } from '@/types/domain'

/**
 * La RÉMUNÉRATION : le bout de la chaîne.
 *
 * Mémo de Michel, 23/08/2026 : « Une Recommandation est considérée comme acceptée lorsqu'un contrat
 * issu de cette Recommandation est signé. Deux cas : Contrat via KiWee → Recommandation acceptée →
 * Rémunération. Contrat hors KiWee → Recommandation acceptée mais pas de rémunération KiWee, sauf
 * exception. »
 *
 * DEUX MONTANTS ET NON UN. L'attendu et le perçu : l'écart entre les deux EST le suivi. Un seul
 * champ ne dirait pas si une commission est en retard ou si elle a été versée pour un autre montant
 * que prévu, ce qui est justement ce qu'on surveille.
 *
 * `hors_kiwee` PORTE L'EXCEPTION. Un contrat signé hors Kiwee ne donne normalement rien ; « sauf
 * exception » veut dire qu'il faut pouvoir dire laquelle, d'où le motif à côté de la case.
 *
 * PAS DE MAQUETTE pour cet écran : ce qui suit s'en tient au mémo.
 */

export const STATUTS_REMUNERATION = [
  { code: 'ATTENDUE', libelle: 'Attendue' },
  { code: 'FACTUREE', libelle: 'Facturée' },
  { code: 'PERCUE', libelle: 'Perçue' },
  { code: 'ANNULEE', libelle: 'Annulée' },
] as const

interface RawRemuneration {
  id: string
  reference: string | null
  contrat_id: string | null
  recommandation_id: string | null
  compte_id: string | null
  fournisseur_compte_id: string | null
  montant_attendu_ht: number | null
  montant_percu_ht: number | null
  date_attendue: string | null
  date_perception: string | null
  hors_kiwee: boolean | null
  motif_exception: string | null
  commentaire: string | null
  statut: string | null
  proprietaire_id: string | null
  date_creation: string
  compte: { nom: string } | null
  fournisseur: { nom: string } | null
}

export function useRemunerations() {
  return useQuery({
    queryKey: ['remunerations'],
    queryFn: async (): Promise<Remuneration[]> => {
      try {
        const lignes = await fetchAllRows<RawRemuneration>(
          'remunerations',
          // Deux embeds vers `comptes` : il faut nommer la clé étrangère, sinon PostgREST renvoie
          // une relation ambiguë (PGRST201) et tout le chargement échoue. Même piège que sur les
          // signaux et les contrats.
          '*, compte:comptes!remunerations_compte_id_fkey(nom), fournisseur:comptes!remunerations_fournisseur_compte_id_fkey(nom)',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q: any) => q.order('date_creation', { ascending: false }),
        )
        const comptesVisibles = await fetchComptesVisibles()
        return filterVisibles(lignes, comptesVisibles, (r) => r.compte_id ?? '').map((r) => ({
          id: r.id,
          reference: r.reference,
          contrat_id: r.contrat_id,
          recommandation_id: r.recommandation_id,
          compte_id: r.compte_id,
          compte_nom: r.compte?.nom ?? '',
          fournisseur_compte_id: r.fournisseur_compte_id,
          fournisseur_nom: r.fournisseur?.nom ?? '',
          montant_attendu_ht: r.montant_attendu_ht,
          montant_percu_ht: r.montant_percu_ht,
          date_attendue: r.date_attendue,
          date_perception: r.date_perception,
          hors_kiwee: r.hors_kiwee ?? false,
          motif_exception: r.motif_exception,
          commentaire: r.commentaire,
          statut: r.statut,
          proprietaire_id: r.proprietaire_id,
          date_creation: r.date_creation,
        }))
      } catch (error) {
        console.error('useRemunerations', error)
        return []
      }
    },
  })
}

export function useCreerRemuneration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      compte_id: string | null
      contrat_id: string | null
      recommandation_id: string | null
      fournisseur_compte_id: string | null
      montant_attendu_ht: number | null
      date_attendue: string | null
      hors_kiwee: boolean
      motif_exception: string | null
    }) => {
      const { data, error } = await supabase
        .from('remunerations')
        .insert({ ...input, statut: 'ATTENDUE' })
        .select('id')
        .single()
      if (error) throw new Error(messageDErreur(error.message))
      return (data as { id: string }).id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['remunerations'] }) },
  })
}

export type PatchRemuneration = Partial<{
  montant_attendu_ht: number | null
  montant_percu_ht: number | null
  date_attendue: string | null
  date_perception: string | null
  statut: string | null
  hors_kiwee: boolean
  motif_exception: string | null
  commentaire: string | null
}>

export function useMajRemuneration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchRemuneration }) => {
      const { error } = await supabase
        .from('remunerations')
        .update({ ...patch, date_modification: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(messageDErreur(error.message))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['remunerations'] }) },
  })
}

function messageDErreur(brut: string): string {
  if (/relation .* does not exist|42P01/i.test(brut)) {
    return `La table des rémunérations n'existe pas encore : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
    return `Colonne absente : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  return brut
}
