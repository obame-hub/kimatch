import * as React from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * LA CARTE, dans la palette de la maquette de Michel (31/08/2026) — son `.km-card` :
 * bordure `km-line`, rayon 9 px, fond blanc, et une ombre volontairement à peine perceptible.
 *
 * L'OMBRE EST DISCRÈTE PARCE QUE C'EST LA BORDURE QUI DÉTACHE. Son dossier le dit : « cartes à
 * bordure légère, rayon 8 à 12 px et ombre très subtile ». Sur un fond presque blanc (#FCFCFB),
 * une ombre marquée donnerait un effet de relief flottant qui vieillit vite ; une bordure d'un
 * pixel suffit à poser la carte.
 *
 * UNE CARTE QUI MÈNE À UNE FICHE PREND `to` ET DEVIENT UN LIEN.
 *
 * Avec `onClick`, elle restait un <div> : pas de clic du milieu, pas de Ctrl+clic, aucune adresse
 * en bas de la fenêtre avant de cliquer, et — le plus gênant — aucune tabulation possible. Un
 * <div> cliquable ne reçoit pas le focus clavier : ces listes étaient littéralement inatteignables
 * sans souris, et un lecteur d'écran n'annonçait rien du tout.
 *
 * `block` est posé avant les classes de l'appelant pour que celles qui imposent déjà un affichage
 * — les cartes en `flex` de Documents et Interactions — continuent de gagner.
 */
export function Card({
  className,
  to,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { to?: string }) {
  const classes = cn(
    'rounded-km-md border border-km-line bg-km-surface shadow-km-card',
    to && 'block',
    className,
  )
  if (to) {
    return <Link to={to} className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />
  }
  return <div className={classes} {...props} />
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between px-4 pt-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-km-name font-semibold text-km-text', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4 pt-3', className)} {...props} />
}
