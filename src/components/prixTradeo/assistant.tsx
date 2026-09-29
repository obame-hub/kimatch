import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES BRIQUES D'UN ASSISTANT PAS À PAS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : « il y a trop d'informations, c'est illisible. Quand on ne sait pas ce qu'il
 * faut faire, on ne comprend pas » — et Michel « ne comprenait rien ». Elle demande « tout en modal,
 * étape par étape, en expliquant à chaque fois ce que c'est, sans trop d'informations ».
 *
 * TROIS RÈGLES, tenues par ces briques plutôt que par la bonne volonté de chaque écran :
 *   · on voit OÙ l'on en est (étape 2 sur 4) et ce qui vient ensuite ;
 *   · chaque étape commence par UNE phrase qui dit ce qu'elle fait et pourquoi ;
 *   · il n'y a qu'UN bouton principal, en bas à droite : ce qu'il faut faire maintenant.
 */

export function EnteteEtapes({ titres, courante }: { titres: string[]; courante: number }) {
  return (
    <div className="mb-4">
      <ol className="flex items-center gap-1.5">
        {titres.map((t, i) => (
          <li key={t} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-km-label font-bold',
                i < courante ? 'bg-km-green text-white' : i === courante ? 'bg-km-green-soft text-km-green ring-2 ring-km-green' : 'bg-km-soft text-km-muted',
              )}
              aria-current={i === courante ? 'step' : undefined}
            >
              {i < courante ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {i < titres.length - 1 && <span className={cn('h-0.5 flex-1 rounded', i < courante ? 'bg-km-green' : 'bg-km-line')} />}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-km-label text-km-muted">
        Étape {courante + 1} sur {titres.length} · <span className="font-semibold text-km-text">{titres[courante]}</span>
      </p>
    </div>
  )
}

/** La phrase qui ouvre chaque étape : ce qu'on fait, et pourquoi. Une ou deux phrases, pas plus. */
export function Explication({ children }: { children: ReactNode }) {
  return <p className="mb-4 rounded-km bg-km-soft px-3 py-2.5 text-km-body text-km-text">{children}</p>
}

/** Le pied : « Retour » à gauche, l'unique action principale à droite. */
export function PiedAssistant({ onRetour, children }: { onRetour?: () => void; children?: ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-km-line pt-4">
      {onRetour ? (
        <button type="button" onClick={onRetour} className="text-km-body text-km-muted hover:text-km-text">← Retour</button>
      ) : <span />}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

/** Une ligne « libellé : valeur » pour les récapitulatifs, lisible d'un coup d'œil. */
export function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-km-line py-2 last:border-b-0">
      <span className="w-[120px] shrink-0 text-km-label text-km-muted">{libelle}</span>
      <span className="min-w-0 flex-1 text-km-body text-km-text">{children}</span>
    </div>
  )
}
