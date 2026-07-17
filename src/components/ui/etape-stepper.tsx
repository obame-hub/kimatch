import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReferenceRow } from '@/lib/data/referenceTables'

// Piloté par les vraies étapes de etapes_recommandation (ordre + libellé réels) plutôt
// que par une liste codée en dur — voir useReferenceTable('etapes_recommandation').

const TERMINAL_NEGATIVE_CODES = ['REFUSEE']

export function EtapeStepper({ steps, currentCode }: { steps: ReferenceRow[]; currentCode: string }) {
  if (TERMINAL_NEGATIVE_CODES.includes(currentCode)) {
    const step = steps.find((s) => s.code === currentCode)
    return (
      <div className="flex items-center gap-2 text-sm text-navy-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100">
          <X className="h-3.5 w-3.5" />
        </span>
        {step?.libelle ?? currentCode}
      </div>
    )
  }

  const visibleSteps = steps.filter((s) => !TERMINAL_NEGATIVE_CODES.includes(s.code))
  const currentIndex = visibleSteps.findIndex((s) => s.code === currentCode)

  return (
    <div className="flex items-center">
      {visibleSteps.map((step, i) => {
        const done = currentIndex >= 0 && i < currentIndex
        const active = i === currentIndex
        return (
          <div key={step.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                  done ? 'bg-kiwi-gradient text-white' : active ? 'bg-navy-900 text-white' : 'bg-navy-100 text-navy-400',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('whitespace-nowrap text-[10px] font-medium', active ? 'text-navy-800' : 'text-navy-400')}>
                {step.libelle}
              </span>
            </div>
            {i < visibleSteps.length - 1 && (
              <div className={cn('mx-1 h-0.5 flex-1 rounded-full transition-colors', done ? 'bg-kiwi-500' : 'bg-navy-100')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function EtapeCompact({ steps, currentCode }: { steps: ReferenceRow[]; currentCode: string }) {
  if (TERMINAL_NEGATIVE_CODES.includes(currentCode)) {
    return <div className="h-1.5 w-full rounded-full bg-navy-100" />
  }
  const visibleSteps = steps.filter((s) => !TERMINAL_NEGATIVE_CODES.includes(s.code))
  const currentIndex = Math.max(
    visibleSteps.findIndex((s) => s.code === currentCode),
    0,
  )
  const pct = Math.round(((currentIndex + 1) / visibleSteps.length) * 100)
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
      <div className="h-full rounded-full bg-kiwi-gradient transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}
