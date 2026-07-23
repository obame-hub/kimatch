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
      className={cn('cursor-pointer select-none px-5 py-3 font-medium hover:text-navy-600', className)}
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
