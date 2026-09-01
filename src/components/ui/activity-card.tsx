import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Un type d'activité = un fond teinté + une ligne de couleur à gauche (référence : fil
// d'activité de la fiche Site). Toute liste d'activités/tâches dans l'app doit réutiliser
// ce composant pour rester visuellement cohérente.
export type ActivityStyleKey = 'action' | 'note' | 'appel' | 'email' | 'signal' | 'document'

export const ACTIVITY_STYLE: Record<ActivityStyleKey, { bg: string; border: string; accent: string; plate: string; fg: string }> = {
  action: { bg: '#fdf9f0', border: '#f0e4cd', accent: '#b57a24', plate: '#f3e3c8', fg: '#8a6420' },
  note: { bg: '#fbf8f3', border: '#f0e9de', accent: '#8a6d3b', plate: '#efe6d4', fg: '#8a6d3b' },
  appel: { bg: '#f7fbf9', border: '#dcece5', accent: '#0d7a5f', plate: '#eaf4f0', fg: '#0d7a5f' },
  email: { bg: '#ffffff', border: '#e7e6e2', accent: '#3b5f8a', plate: '#eef0f4', fg: '#3b5f8a' },
  signal: { bg: '#fdf2ef', border: '#f5d9d0', accent: '#c2452d', plate: '#fbeae5', fg: '#c2452d' },
  document: { bg: '#f6f6f4', border: '#e7e6e2', accent: '#5c5f66', plate: '#f0efec', fg: '#5c5f66' },
}

export function ActivityCard({
  styleKey,
  icon: Icon,
  leading,
  title,
  subtitle,
  body,
  trailing,
  onClick,
  href,
  className,
}: {
  styleKey: ActivityStyleKey
  icon?: LucideIcon
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Le texte de l'activité elle-même — le contenu d'une note, par exemple. Le `subtitle` dit qui a
   *  fait quoi, `body` dit ce qui a été écrit. Ajouté le 16/08/2026 : le fil annonçait « Untel a
   *  ajouté une note » sans jamais montrer la note. */
  body?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  href?: string
  className?: string
}) {
  const style = ACTIVITY_STYLE[styleKey]
  /**
   * Depliage du corps de l'activite — « chaque activite est cliquable et dépliable : résumé IA
   * d'appel, corps du mail, commentaires de tâche » (brief de William).
   *
   * Le clic sur « Voir tout le message » arrete la propagation : sans cela il declencherait aussi
   * la navigation vers la fiche de l'interaction, et l'on n'aurait jamais le temps de lire.
   */
  const [deplie, setDeplie] = useState(false)
  const content = (
    <div
      className={cn('flex items-start gap-2.5 rounded-lg px-2.5 py-3 transition-colors', (onClick || href) && 'cursor-pointer', className)}
      style={{ background: style.bg, border: `1px solid ${style.border}`, borderLeft: `3px solid ${style.accent}` }}
    >
      {leading ?? (Icon && (
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: style.plate, color: style.fg }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      ))}
      <div className="min-w-0 flex-1">
        {/* Couleurs fixes (pas les classes text-navy-*) : le fond de la carte est un lavis
            pastel toujours clair, quel que soit le thème — le texte doit rester sombre dessus
            même en mode sombre (où text-km-text/500 basculeraient en clair et deviendraient illisibles). */}
        <p className="truncate text-km-label font-semibold" style={{ color: '#16181d' }}>{title}</p>
        {subtitle && <p className="mt-0.5 line-clamp-2 text-km-label" style={{ color: '#83868f' }}>{subtitle}</p>}
        {body && (
          <p
            className={cn(
              'mt-1.5 whitespace-pre-line rounded-md px-2 py-1.5 text-km-label',
              // Deplie : tout le texte. Replie : trois lignes, et on n'annonce « voir plus » que
              // s'il y a vraiment quelque chose de cache — un compte rendu de deux lignes ne doit
              // pas proposer un depliage qui ne montrerait rien.
              !deplie && 'line-clamp-3',
            )}
            style={{ background: style.plate, color: '#16181d' }}
          >
            {body}
          </p>
        )}
        {body && typeof body === 'string' && body.length > 180 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDeplie((v) => !v) }}
            className="mt-0.5 text-km-xs font-semibold underline-offset-2 hover:underline"
            style={{ color: style.fg }}
          >
            {deplie ? 'Réduire' : 'Voir tout le message'}
          </button>
        )}
      </div>
      {trailing && <span className="shrink-0 text-km-xs font-medium" style={{ color: style.accent }}>{trailing}</span>}
    </div>
  )
  if (href) return <a href={href} target="_blank" rel="noreferrer">{content}</a>
  if (onClick) return <div role="button" tabIndex={0} onClick={onClick}>{content}</div>
  return content
}
