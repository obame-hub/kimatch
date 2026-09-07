import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LA CORBEILLE ══
 *
 * Naoëlle, 07/09/2026 : « mets en place une corbeille visible pour les admin et super admin où on
 * aurait la possibilité de récupérer les données et de vider la corbeille si besoin, et aussi il
 * faut qu'on voie qui a supprimé quoi et quand. »
 *
 * Elle lit le journal des suppressions (migration 20260907120000) : chaque ligne supprimée y est
 * conservée entière, en jsonb, avec son auteur et un identifiant partagé par tout ce qu'un même
 * clic a emporté. La restauration et la purge vivent en base — `fn_restaurer_suppression` et
 * `fn_vider_corbeille`, migration 20260907160000 — parce qu'elles réinsèrent des lignes en
 * contournant RLS et doivent le faire d'un seul bloc.
 *
 * ══ ELLE SE TAIT PLUTÔT QUE DE CASSER L'ÉCRAN ══
 *
 * Comme `useMontantCalcule` : entre le déploiement et l'application des migrations, la vue n'existe
 * pas et PostgREST répond 404. On rend une corbeille vide et un drapeau `pretMigration: false`, que
 * l'écran affiche en clair — plutôt qu'une page en erreur qu'on ne saurait pas interpréter.
 */

export interface EntreeCorbeille {
  correlation_id: string
  supprime_le: string
  auteur_id: string | null
  auteur_nom: string | null
  /** La table de l'objet principal du geste — `comptes`, `sites`… */
  entite_type: string
  entite_id: string
  /** « Compte », « Site », « Compteur »… le mot que l'utilisateur reconnaît. */
  libelle_type: string
  /** Le nom de l'objet supprimé, tel qu'il était. `null` quand la table n'en porte pas. */
  nom: string | null
  nb_lignes: number
  nb_tables: number
  tables_touchees: string
}

export interface LigneCorbeille {
  correlation_id: string
  entite_type: string
  entite_id: string
  date_modification: string
  nom: string | null
  ancienne_valeur: Record<string, unknown>
}

const ABSENTE = /does not exist|schema cache|404|relation .* does not exist/i

export interface Corbeille {
  entrees: EntreeCorbeille[]
  /** Faux quand les migrations ne sont pas appliquées : l'écran le dit au lieu d'afficher « vide ». */
  pretMigration: boolean
}

export function useCorbeille(actif: boolean) {
  return useQuery({
    queryKey: ['corbeille'],
    enabled: actif,
    retry: false,
    // Elle doit refléter ce qui vient d'être supprimé, pas l'état d'il y a cinq minutes.
    staleTime: 0,
    queryFn: async (): Promise<Corbeille> => {
      const { data, error } = await supabase
        .from('v_corbeille')
        .select('*')
        .order('supprime_le', { ascending: false })
        .limit(200)
      if (error) {
        if (ABSENTE.test(error.message)) return { entrees: [], pretMigration: false }
        throw new Error(error.message)
      }
      return { entrees: (data ?? []) as EntreeCorbeille[], pretMigration: true }
    },
  })
}

/** Le détail d'un geste : chaque ligne emportée, pour lire avant de décider. */
export function useDetailCorbeille(correlationId: string | null) {
  return useQuery({
    queryKey: ['corbeille', 'detail', correlationId],
    enabled: Boolean(correlationId),
    retry: false,
    queryFn: async (): Promise<LigneCorbeille[]> => {
      const { data, error } = await supabase
        .from('v_corbeille_detail')
        .select('*')
        .eq('correlation_id', correlationId)
        .order('entite_type')
      if (error) {
        if (ABSENTE.test(error.message)) return []
        throw new Error(error.message)
      }
      return (data ?? []) as LigneCorbeille[]
    },
  })
}

export interface ResultatRestauration {
  entite_type: string
  lignes_remises: number
}

/**
 * Remet en place tout ce qu'un geste de suppression a emporté.
 *
 * TOUT OU RIEN : la fonction en base travaille dans une transaction et lève une exception dès qu'une
 * ligne ne peut pas revenir. Une restauration à moitié faite laisserait un compte sans ses sites, ce
 * qui est plus difficile à démêler qu'une suppression franche.
 */
export function useRestaurerSuppression() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (correlationId: string): Promise<ResultatRestauration[]> => {
      const { data, error } = await supabase.rpc('fn_restaurer_suppression', {
        p_correlation_id: correlationId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as ResultatRestauration[]
    },
    // Les lignes reviennent dans toutes les tables : on invalide large plutôt que de deviner
    // lesquelles, une restauration étant rare et jamais dans un chemin sensible à la vitesse.
    onSuccess: () => { void queryClient.invalidateQueries() },
  })
}

/**
 * Efface définitivement des entrées de la corbeille.
 *
 * C'est la seule opération de Kimatch sans recours, puisqu'elle détruit le filet lui-même. La
 * fonction en base refuse d'être appelée sans argument, pour qu'on ne vide pas tout par accident.
 */
export function useViderCorbeille() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      cible: { correlationId: string } | { avant: string },
    ): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_vider_corbeille', {
        p_correlation_id: 'correlationId' in cible ? cible.correlationId : null,
        p_avant: 'avant' in cible ? cible.avant : null,
      })
      if (error) throw new Error(error.message)
      return (data ?? 0) as number
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['corbeille'] }) },
  })
}
