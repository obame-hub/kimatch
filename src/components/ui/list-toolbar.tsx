import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/form'

export function ListToolbar({
  query,
  onQueryChange,
  placeholder = 'Rechercher…',
  children,
}: {
  query: string
  onQueryChange: (value: string) => void
  placeholder?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" />
        <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={placeholder} className="pl-9" />
      </div>
      {children}
    </div>
  )
}
