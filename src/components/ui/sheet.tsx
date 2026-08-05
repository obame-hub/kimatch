import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

/** Panneau latéral (glisse depuis la droite), reste ouvert au-dessus de la page en cours --
 * contrairement à Dialog, ne remplace jamais le contenu de la page, juste une couche par-dessus.
 * Utilisé pour les actions "rapides" qu'on veut enchaîner sans perdre le contexte (ex. ajouter un
 * contact depuis l'écran "que faire ensuite" post-création de compte, comme dans Tools). */
export function Sheet({ open, onClose, title, description, children, className }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <div className={cn('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-ink-950/40 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-y-auto border-l border-navy-100 bg-white p-6 shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
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
