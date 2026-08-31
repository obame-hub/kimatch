import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: string
  activeKey: string
  dir: 'asc' | 'desc'
  onSort: (key: string) => void
  className?: string
}) {
  const active = sortKey === activeKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      /* Le remplissage et la couleur viennent desormais du <thead> partage (voir tableau.tsx) :
         les redeclarer ici ferait diverger les colonnes triables des autres. */
      className={cn('cursor-pointer select-none transition-colors hover:text-km-text', className)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  )
}
