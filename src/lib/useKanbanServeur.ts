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
 *
 * ET IL SAIT SOMMER UNE COLONNE, depuis le 26/08/2026. Michel a envoyé six maquettes, et elles
 * partagent un motif : chaque page reçoit un bandeau chiffré en haut, DÉCOUPÉ SELON LES COLONNES du
 * tableau qui est en dessous — la marge pour les recommandations, le volume pour les opportunités.
 *
 * CE TOTAL NE PEUT PAS SE CALCULER SUR LES CARTES REÇUES. On en demande dix par colonne ; une colonne
 * peut en compter six cents. Sommer ce qu'on a sous la main donnerait le total de dix dossiers
 * présenté comme celui de la colonne — exactement l'erreur que `count: exact` évite déjà pour le
 * nombre de cartes. La somme part donc en base, avec LES MÊMES filtres que la colonne : le bandeau et
 * les colonnes doivent additionner la même population, sinon l'un démentira l'autre à l'écran.
 *
 * PostgREST ne fait pas de SUM : on rapporte la colonne numérique seule — un nombre par ligne, rien
 * d'autre — et on additionne. Six cents nombres pèsent quelques kilo-octets, sans commune mesure avec
 * les lignes complètes.
 */

export interface ColonneServeur {
  code: string
  libelle: string
  /**
   * PLUSIEURS STATUTS SOUS UNE SEULE COLONNE, quand le métier les regroupe.
   *
   * Michel, 26/08/2026, sur les recommandations : garder les huit étapes, et « acceptée, refusée et
   * abandonnée sont dans clôturé comme d'hab ». Même geste que sur les requêtes, où résolue et
   * abandonnée partagent « Clôturé ».
   *
   * C'EST UN REGROUPEMENT D'AFFICHAGE, JAMAIS DE DONNÉE. Les huit étapes restent huit en base : ce
   * qui sépare une affaire acceptée d'une abandonnée ne se réécrit pas après coup, et la carte le
   * dit. Une colonne unique évite en revanche trois colonnes terminales qui, à elles seules,
   * portent 1 574 dossiers sur 1 707 et noient le travail en cours.
   *
   * Absent, la colonne ne vaut que pour son propre `code`.
   */
  codes?: string[]
}

export interface ResultatColonne<T> {
  code: string
  libelle: string
  /** Le total réel de la colonne, rendu par la base. */
  total: number
  /** Les premières lignes seulement — de quoi remplir la colonne à l'écran. */
  lignes: T[]
  /**
   * La somme de `colonneSomme` sur TOUTE la colonne, `null` si aucune somme n'est demandée.
   *
   * Zéro et `null` ne disent pas la même chose : zéro est une colonne dont les dossiers ne rapportent
   * rien, `null` une colonne dont on n'a rien demandé. Le bandeau les affiche différemment.
   */
  somme: number | null
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
  /**
   * Filtres supplémentaires appliqués à toutes les colonnes — la visibilité, par exemple.
   *
   * Le booléen est accepté depuis le 27/08/2026 : la page Pricing ne montre que les recommandations
   * en cours, et un `true` écrit `'true'` aurait été un booléen déguisé en texte — le genre de détail
   * qui se relit mal six mois plus tard.
   */
  filtres?: Record<string, string | boolean | null>
  /** Colonne numérique à additionner sur chaque colonne du tableau — la marge, un volume. */
  colonneSomme?: string
  /**
   * L'ORDRE DES CARTES, RENDU PAR LA BASE.
   *
   * Michel, 27/08/2026, sur le Pricing : « les en retard et avec date de cotation souhaitée proche
   * sont les premiers visibles ».
   *
   * CE TRI NE PEUT PAS SE FAIRE À L'ARRIVÉE. On ne demande que dix cartes par colonne : trier ces
   * dix-là remettrait dans l'ordre un échantillon pris au hasard, et la carte la plus en retard
   * resterait invisible parce qu'elle était onzième. Même raison que pour `count: exact` et pour la
   * somme — ce qui décide de ce qu'on voit doit se décider en base.
   */
  ordre?: { colonne: string; ascendant?: boolean }
  actif: boolean
}) {
  const { vue, colonneStatut, colonnes, colonnesRecherche, recherche, filtres, colonneSomme, ordre, actif } = options

  return useQuery({
    queryKey: ['kanban-serveur', vue, colonneStatut, colonnes.map((c) => c.codes?.join('+') ?? c.code), recherche.trim(), filtres, colonneSomme, ordre],
    enabled: actif,
    queryFn: async (): Promise<ResultatColonne<T>[]> => {
      const mots = recherche.trim().split(/\s+/).filter(Boolean)

      // UN SEUL ENDROIT POUR LES FILTRES. La somme doit porter exactement la même sélection que la
      // colonne ; deux chaînes de filtres écrites côte à côte finissent toujours par diverger.
      const filtrer = (codes: string[], colonnesLues: string, avecCompte: boolean) => {
        let req = avecCompte
          ? supabase.from(vue).select(colonnesLues, { count: 'exact' })
          : supabase.from(vue).select(colonnesLues)
        // `in` même pour un seul code : une seule chaîne de filtres à maintenir, et PostgREST rend
        // exactement le même résultat qu'un `eq` sur un tableau d'un élément.
        req = req.in(colonneStatut, codes)
        for (const [colonne, valeur] of Object.entries(filtres ?? {})) {
          if (valeur != null && valeur !== '') req = req.eq(colonne, valeur)
        }
        // Chaque mot doit se retrouver dans au moins une colonne cherchée — même règle que la
        // liste, pour que « rue victor » trouve autant que « victor rue ».
        for (const mot of mots) {
          req = req.or(colonnesRecherche.map((c) => `${c}.ilike.%${mot}%`).join(','))
        }
        return req
      }

      return Promise.all(
        colonnes.map(async (col) => {
          const codes = col.codes && col.codes.length > 0 ? col.codes : [col.code]
          // Le tri porte sur les cartes seules : ordonner la lecture de la somme ne changerait pas
          // le total et ferait trier la base pour rien.
          let requeteCartes = filtrer(codes, '*', true)
          if (ordre) {
            requeteCartes = requeteCartes.order(ordre.colonne, {
              ascending: ordre.ascendant !== false,
              nullsFirst: false,
            })
          }
          const [cartes, agregat] = await Promise.all([
            requeteCartes.range(0, CARTES_PAR_COLONNE - 1),
            colonneSomme ? filtrer(codes, colonneSomme, false) : Promise.resolve(null),
          ])

          if (cartes.error) throw new Error(cartes.error.message)

          let somme: number | null = null
          if (agregat && !agregat.error) {
            somme = 0
            for (const ligne of (agregat.data ?? []) as unknown as Record<string, unknown>[]) {
              const v = ligne[colonneSomme as string]
              if (typeof v === 'number') somme += v
            }
          }

          return {
            code: col.code,
            libelle: col.libelle,
            total: cartes.count ?? 0,
            lignes: (cartes.data ?? []) as T[],
            somme,
          }
        }),
      )
    },
  })
}
