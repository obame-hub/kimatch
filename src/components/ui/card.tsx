import * as React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * UNE CARTE QUI MENE A UNE FICHE PREND `to` ET DEVIENT UN LIEN.
 *
 * Avec `onClick`, elle restait un <div> : pas de clic du milieu, pas de Ctrl+clic, aucune adresse
 * en bas de la fenetre avant de cliquer, et — le plus genant — aucune tabulation possible. Un <div>
 * cliquable ne recoit pas le focus clavier : ces listes etaient litteralement inatteignables sans
 * souris, et un lecteur d'ecran n'annoncait rien du tout.
 *
 * `block` est pose avant les classes de l'appelant pour que celles qui imposent deja un affichage
 * — les cartes en `flex` de Documents et Interactions — continuent de gagner.
 */
export function Card({
  className,
  to,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { to?: string }) {
  const classes = cn('rounded-xl border border-navy-100 bg-white shadow-card', to && 'block', className)
  if (to) {
    return <Link to={to} className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />
  }
  return <div className={classes} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between px-5 pt-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold text-navy-800', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5 pt-3', className)} {...props} />
}
