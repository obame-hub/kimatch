import { useMemo, useRef, useState } from 'react'

/** Minuscules et sans accent : « HÉBRARD » et « hebrard » doivent se rencontrer. */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function useListControls<T>(
  items: T[] | undefined,
  options: {
    searchFields: (item: T) => (string | null | undefined)[]
    sorters: Record<string, (a: T, b: T) => number>
    defaultSort: string
  },
) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState(options.defaultSort)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  /**
   * ══ LE `useMemo` PLUS BAS NE MÉMORISAIT RIEN ══
   *
   * Audit du 13/09/2026, constat FRT-01. C'était le défaut de performance le plus coûteux du
   * projet, et le plus discret : le code avait l'air juste.
   *
   * `options` figurait dans son tableau de dépendances. Or les huit appelants passent un OBJET
   * LITTÉRAL, reconstruit à chaque rendu — voir `Contacts.tsx:430` :
   *
   *     useListControls(contactsDuPerimetre, {
   *       searchFields: (c) => [c.prenom, c.nom, c.fonction, c.compte_nom, c.email, c.telephone],
   *       sorters: { nom: (a, b) => a.nom.localeCompare(b.nom), … },
   *       defaultSort: 'nom',
   *     })
   *
   * Sa référence changeait donc toujours, et le calcul repartait toujours. Ce qui repartait, sur
   * la page Contacts : une normalisation Unicode NFD avec suppression des diacritiques sur SIX
   * CHAMPS × 3 401 LIGNES, puis un tri complet au `localeCompare` — environ 40 000 comparaisons.
   * À chaque lettre tapée, à chaque ouverture de menu, à chaque changement d'état du parent.
   *
   * ── POURQUOI UNE RÉFÉRENCE PLUTÔT QUE RETIRER `options` DU TABLEAU ──
   *
   * Retirer la dépendance suffirait à corriger le défaut, mais laisserait un piège : le corps du
   * calcul lit `options`, et une règle ESLint le signalerait à juste titre. Pire, quelqu'un qui
   * rétablirait la dépendance en croyant réparer un oubli réintroduirait le défaut sans le voir.
   *
   * La référence dit ce qui est vrai : les options ne changent JAMAIS d'un rendu à l'autre —
   * seule leur identité change. On garde donc la dernière version reçue, et on ne la met pas dans
   * les dépendances parce qu'elle n'est pas une donnée d'entrée du calcul.
   *
   * ── CE QUI RESTE VRAI ──
   *
   * `searchFields` et `sorters` sont des fonctions pures des éléments : deux définitions
   * successives se comportent à l'identique. Si un jour l'une d'elles devait capturer un état du
   * composant appelant, il faudrait l'ajouter explicitement au tableau — c'est ce que ce
   * commentaire doit rappeler à ce moment-là.
   */
  const optionsRef = useRef(options)
  optionsRef.current = options

  const result = useMemo(() => {
    if (!items) return items

    /**
     * Chaque MOT de la saisie doit se retrouver dans AU MOINS UN des champs.
     *
     * La saisie entiere etait auparavant cherchee dans chaque champ pris isolement. Taper
     * « romain hebrard » dans la liste des contacts ne rendait donc rien : le prenom vaut
     * « Romain » et le nom « HEBRARD », aucun des deux ne contient la chaine complete. Le meme
     * travers touchait toutes les listes des lors que les mots vivaient dans des colonnes
     * differentes — un site et sa ville, un contrat et son fournisseur.
     *
     * Chercher mot a mot rend aussi l'ordre indifferent : « hebrard romain » trouve autant que
     * « romain hebrard ».
     */
    const { searchFields, sorters } = optionsRef.current

    const mots = normaliser(query).split(/\s+/).filter((m) => m.length > 0)
    const filtered = mots.length
      ? items.filter((item) => {
          const champs = searchFields(item).map((f) => normaliser(f ?? ''))
          return mots.every((mot) => champs.some((champ) => champ.includes(mot)))
        })
      : items

    const sorter = sorters[sortKey]
    if (!sorter) return filtered
    const sorted = [...filtered].sort(sorter)
    return sortDir === 'asc' ? sorted : sorted.reverse()
    /* `optionsRef` n'a pas à figurer dans les dépendances, et ESLint le sait : une référence est
       stable par construction. C'est bien tout l'intérêt — son CONTENU change à chaque rendu sans
       déclencher de recalcul, ce qui est exactement la correction. */
  }, [items, query, sortKey, sortDir])

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return { query, setQuery, sortKey, setSortKey, sortDir, toggleSort, items: result }
}
