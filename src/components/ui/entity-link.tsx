import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Lien vers une autre fiche, utilisable à l'intérieur d'une ligne/carte déjà cliquable
 * sans déclencher la navigation du parent (stopPropagation). */
export function EntityLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  const navigate = useNavigate()
  if (!children) return <span className="text-navy-300">—</span>
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        navigate(to)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          navigate(to)
        }
      }}
      className={cn('cursor-pointer text-navy-700 underline decoration-navy-200 underline-offset-2 hover:text-kiwi-700 hover:decoration-kiwi-400', className)}
    >
      {children}
    </span>
  )
}
