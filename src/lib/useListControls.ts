import { useMemo, useState } from 'react'

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
    const mots = normaliser(query).split(/\s+/).filter((m) => m.length > 0)
    const filtered = mots.length
      ? items.filter((item) => {
          const champs = options.searchFields(item).map((f) => normaliser(f ?? ''))
          return mots.every((mot) => champs.some((champ) => champ.includes(mot)))
        })
      : items

    const sorter = options.sorters[sortKey]
    if (!sorter) return filtered
    const sorted = [...filtered].sort(sorter)
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [items, query, sortKey, sortDir, options])

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
