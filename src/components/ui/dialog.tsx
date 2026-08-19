import { useEffect } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * Une fenêtre modale, montée à la racine du document.
 *
 * LE PORTAIL N'EST PAS UN DÉTAIL. Signalé par Naoëlle le 19/08/2026 : « ce serait bien si tu grises
 * tout l'écran, là on ne sait pas où regarder ». Un `position: fixed` se place par rapport au
 * viewport SAUF si un ancêtre porte une transformation — et l'application en est pleine, ne serait-ce
 * que par ses animations d'apparition (`animate-kw-fade-slide` anime `transform`). Un tel ancêtre
 * devient le référentiel du voile, qui ne couvre alors que sa boîte : la fenêtre s'ouvrait avec une
 * partie de l'écran restée nette, sans qu'aucun réglage d'opacité n'y change quoi que ce soit.
 *
 * `createPortal` vers `document.body` supprime la question à la source : le voile n'a plus d'ancêtre
 * susceptible de le contraindre, où que la fenêtre soit appelée depuis l'arbre.
 *
 * LE VOILE EST FRANC — 65 % de noir et un flou léger. Un voile discret laisse l'œil hésiter entre
 * deux plans, ce qui est exactement le reproche fait à la version d'avant. Une fenêtre modale demande
 * l'attention : autant le dire clairement.
 */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="animate-kw-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/65 p-4 py-10 backdrop-blur-[3px]"
      // Un clic sur le voile ferme, comme partout ailleurs. `currentTarget` et non `target` : un clic
      // dans la fenêtre ne doit pas la refermer.
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={cn(
          'animate-fade-up my-auto w-full max-w-lg rounded-xl border border-navy-100 bg-white p-6 shadow-2xl',
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
    </div>,
    document.body,
  )
}
