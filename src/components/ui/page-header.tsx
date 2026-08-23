import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * L'en-tête d'un écran de liste.
 *
 * LA PASTILLE PORTE LA COULEUR DE L'OBJET, comme chez William : chacun de ses écrans s'ouvre sur une
 * pastille au dégradé de sa famille — bleu pour le compte, violet pour le contact, vert pour le
 * site, magenta pour l'opportunité. Sans elle, deux listes se ressemblent trait pour trait et on ne
 * sait plus où l'on est. Le paramètre est optionnel : les écrans qui ne l'ont pas encore gardent
 * exactement l'apparence d'avant.
 */
export function PageHeader({ title, description, actions, icone, teinte }: {
  title: string
  description?: string
  actions?: ReactNode
  icone?: ReactNode
  /** Classes du dégradé de la pastille, par exemple `from-opp-600 to-opp-400`. */
  teinte?: string
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icone && (
          <span
            className={cn(
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br text-white shadow-[0_4px_12px_rgba(22,24,29,.14)]',
              teinte ?? 'from-navy-700 to-navy-500',
            )}
          >
            {icone}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-navy-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  )
}
