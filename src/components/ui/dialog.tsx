import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 pt-16 backdrop-blur-sm">
      <div
        className={cn(
          'animate-fade-up w-full max-w-lg rounded-xl border border-navy-100 bg-white p-6 shadow-xl',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-navy-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
