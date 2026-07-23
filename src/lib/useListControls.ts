import { useMemo, useState } from 'react'

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
    const q = query.trim().toLowerCase()
    const filtered = q
      ? items.filter((item) => options.searchFields(item).some((f) => (f ?? '').toLowerCase().includes(q)))
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
