import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'

interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  tone?: 'kiwi' | 'amber' | 'navy' | 'red'
  hint?: string
}

const toneStyles: Record<string, string> = {
  kiwi: 'bg-kiwi-gradient text-white shadow-[0_8px_20px_-6px_rgba(116,181,36,0.55)]',
  amber: 'bg-amber-gradient text-white shadow-[0_8px_20px_-6px_rgba(201,146,46,0.5)]',
  navy: 'bg-ink-800 text-white shadow-[0_8px_20px_-6px_rgba(15,23,42,0.45)]',
  red: 'bg-red-500 text-white shadow-[0_8px_20px_-6px_rgba(239,68,68,0.5)]',
}

export function StatCard({ label, value, icon: Icon, tone = 'navy', hint }: StatCardProps) {
  const animated = useCountUp(value)

  return (
    <Card className="group relative overflow-hidden p-5 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="absolute inset-0 bg-glow-radial opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-400">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-navy-900 tabular-nums">{animated}</p>
          {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', toneStyles[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}
