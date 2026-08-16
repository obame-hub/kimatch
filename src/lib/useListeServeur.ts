import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useFrappePosee } from '@/lib/useFrappePosee'

/** Première tranche affichée, puis pas d'agrandissement — mêmes valeurs que les listes en mémoire. */
const TRANCHE_INITIALE = 100
const TRANCHE_SUIVANTE = 200

/** Quatre mots suffisent à identifier une ligne ; au-delà on empilerait des filtres pour rien. */
const MOTS_MAX = 4

function mots(query: string): string[] {
  return query
    .replace(/[,()%]/g, ' ')
    .split(/\s+/)
    .filter((m) => m.length > 0)
    .slice(0, MOTS_MAX)
}

export interface OptionsListeServeur {
  /** Nom de la vue à interroger, par exemple `v_comptes_liste`. */
  vue: string
  /** Colonnes sur lesquelles porte la recherche. Chaque mot devra apparaître dans au moins une. */
  colonnesRecherche: string[]
  /** Colonne de tri par défaut. */
  triParDefaut: string
  /** Sens par défaut. */
  sensParDefaut?: 'asc' | 'desc'
  /** Filtres d'égalité additionnels, appliqués tels quels (un filtre par entrée non nulle). */
  filtres?: Record<string, string | null | undefined>
}

/**
 * Liste servie par la base : la vue filtre, trie et pagine, le navigateur affiche.
 *
 * POURQUOI UN SEUL CROCHET POUR TOUTES LES PAGES. Les listes chargeaient chacune leur table
 * entière avant de trier et filtrer en mémoire — 6459 documents, 3384 contacts, 2762 comptes.
 * Plutôt que d'écrire une fonction SQL par page (comme `liste_sites`, justifiée là-bas par le
 * calcul de santé), chaque page s'appuie sur une VUE qui aplatit ses jointures. PostgREST sait
 * paginer, trier et filtrer une vue exactement comme une table : il ne reste qu'à l'appeler, et
 * ce fichier est le seul endroit qui le fait.
 *
 * LA RECHERCHE PORTE SUR CHAQUE MOT. Comme dans les listes en mémoire et la recherche globale :
 * chaque mot de la saisie doit se retrouver dans au moins une des colonnes, et les mots se
 * combinent par ET. Chercher « romain hebrard » ne rendait rien tant que la saisie entière était
 * comparée à chaque colonne prise isolément. Les appels successifs à `.or()` sont combinés par ET
 * par PostgREST, ce qui donne exactement « (mot1 quelque part) ET (mot2 quelque part) ».
 *
 * LE TOTAL vient de `count: 'exact'` : il compte côté base sans rapatrier les lignes, et alimente
 * le pied de liste sans requête supplémentaire.
 */
export function useListeServeur<T>(options: OptionsListeServeur) {
  const [query, setQuery] = useState('')
  const [tri, setTri] = useState(options.triParDefaut)
  const [sens, setSens] = useState<'asc' | 'desc'>(options.sensParDefaut ?? 'asc')
  const [limite, setLimite] = useState(TRANCHE_INITIALE)

  // Chaque lettre relancerait sinon une requête complète.
  const recherche = useFrappePosee(query)

  // Revenir à la première tranche dès que la liste change de nature : sans cela, une nouvelle
  // recherche continuerait de demander les 500 lignes chargées pour la précédente.
  const signature = `${recherche}|${tri}|${sens}|${JSON.stringify(options.filtres ?? {})}`
  useEffect(() => {
    setLimite(TRANCHE_INITIALE)
  }, [signature])

  const resultat = useQuery({
    queryKey: ['liste-serveur', options.vue, recherche.trim(), tri, sens, limite, options.filtres],
    queryFn: async () => {
      let req = supabase.from(options.vue).select('*', { count: 'exact' })

      for (const [colonne, valeur] of Object.entries(options.filtres ?? {})) {
        if (valeur != null && valeur !== '') req = req.eq(colonne, valeur)
      }

      for (const mot of mots(recherche)) {
        req = req.or(options.colonnesRecherche.map((c) => `${c}.ilike.%${mot}%`).join(','))
      }

      const { data, error, count } = await req
        .order(tri, { ascending: sens === 'asc', nullsFirst: false })
        .range(0, limite - 1)

      if (error) throw new Error(error.message)
      return { lignes: (data ?? []) as T[], total: count ?? 0 }
    },
    // Garder l'affichage précédent pendant qu'une nouvelle tranche arrive évite que la table
    // clignote à chaque frappe ou changement de tri.
    placeholderData: (precedent) => precedent,
  })

  function trierPar(colonne: string) {
    if (colonne === tri) setSens((s) => (s === 'asc' ? 'desc' : 'asc'))
    else { setTri(colonne); setSens('asc') }
  }

  const lignes = resultat.data?.lignes ?? []
  const total = resultat.data?.total ?? 0

  return {
    lignes,
    total,
    reste: Math.max(0, total - lignes.length),
    isLoading: resultat.isLoading,
    erreur: resultat.error instanceof Error ? resultat.error.message : null,
    query,
    setQuery,
    tri,
    sens,
    trierPar,
    afficherPlus: () => setLimite((n) => n + TRANCHE_SUIVANTE),
    tailleTrancheSuivante: TRANCHE_SUIVANTE,
  }
}
