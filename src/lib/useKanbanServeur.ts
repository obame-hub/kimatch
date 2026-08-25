import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * UN KANBAN SERVI PAR LA BASE, une requête par colonne.
 *
 * Pour les objets dont la LISTE est déjà paginée côté serveur — les recommandations, 1 707 lignes —
 * on ne peut pas construire un tableau à partir de la tranche chargée : les colonnes compteraient
 * les cent lignes reçues et non la réalité, et une colonne apparaîtrait vide simplement parce que sa
 * page n'a pas encore été demandée. Un tableau qui se trompe sur ses nombres est pire qu'une liste.
 *
 * D'où une requête par colonne : `count: exact` donne le total vrai, `limit` ne rapporte que les
 * quelques cartes qu'on affiche. Six colonnes font six requêtes minuscules, exécutées en parallèle —
 * sans commune mesure avec le chargement complet de la table.
 *
 * LES FILTRES DE LA PAGE SUIVENT, recherche comprise : sinon le tableau et la liste montreraient deux
 * populations différentes sous le même bandeau de recherche, et on ne saurait plus laquelle croire.
 */

export interface ColonneServeur {
  code: string
  libelle: string
}

export interface ResultatColonne<T> {
  code: string
  libelle: string
  /** Le total réel de la colonne, rendu par la base. */
  total: number
  /** Les premières lignes seulement — de quoi remplir la colonne à l'écran. */
  lignes: T[]
}

/** Nombre de cartes demandées par colonne. Le tableau en affiche huit et annonce le reste. */
const CARTES_PAR_COLONNE = 10

export function useKanbanServeur<T>(options: {
  vue: string
  /** La colonne de la vue qui porte le statut — celle qui décide de la répartition. */
  colonneStatut: string
  colonnes: readonly ColonneServeur[]
  /** Colonnes de recherche, comme pour la liste. */
  colonnesRecherche: string[]
  recherche: string
  /** Filtres supplémentaires appliqués à toutes les colonnes — la visibilité, par exemple. */
  filtres?: Record<string, string | null>
  actif: boolean
}) {
  const { vue, colonneStatut, colonnes, colonnesRecherche, recherche, filtres, actif } = options

  return useQuery({
    queryKey: ['kanban-serveur', vue, colonneStatut, colonnes.map((c) => c.code), recherche.trim(), filtres],
    enabled: actif,
    queryFn: async (): Promise<ResultatColonne<T>[]> => {
      const mots = recherche.trim().split(/\s+/).filter(Boolean)

      return Promise.all(
        colonnes.map(async (col) => {
          let req = supabase.from(vue).select('*', { count: 'exact' }).eq(colonneStatut, col.code)

          for (const [colonne, valeur] of Object.entries(filtres ?? {})) {
            if (valeur != null && valeur !== '') req = req.eq(colonne, valeur)
          }
          // Chaque mot doit se retrouver dans au moins une colonne cherchée — même règle que la
          // liste, pour que « rue victor » trouve autant que « victor rue ».
          for (const mot of mots) {
            req = req.or(colonnesRecherche.map((c) => `${c}.ilike.%${mot}%`).join(','))
          }

          const { data, error, count } = await req.range(0, CARTES_PAR_COLONNE - 1)
          if (error) throw new Error(error.message)
          return { code: col.code, libelle: col.libelle, total: count ?? 0, lignes: (data ?? []) as T[] }
        }),
      )
    },
  })
}
