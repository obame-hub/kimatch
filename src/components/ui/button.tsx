import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * LE BOUTON, DANS LA PALETTE DE LA MAQUETTE DE MICHEL (31/08/2026).
 *
 * Ses trois variantes, relevées dans son code :
 *
 *   .km-button          bordure `km-line`, fond `km-surface` — l'action neutre, la plus courante
 *   .km-button.primary  fond `km-green`, texte blanc — UNE SEULE par page, dit son dossier
 *   .km-button.danger   fond `km-red-soft`, texte `km-red`, sans bordure — jamais un rouge plein
 *
 * DEUX CHOSES À REMARQUER, parce qu'elles vont à l'encontre de l'habitude.
 *
 * L'ACTION NEUTRE EST LE DÉFAUT, pas l'action verte. Son dossier dit « une action principale au
 * maximum » par page : si le bouton vert était le défaut, chaque écran en aurait quatre et le vert
 * cesserait de dire quoi que ce soit.
 *
 * LE BOUTON DESTRUCTEUR N'EST PAS UN RECTANGLE ROUGE. Un fond rouge pâle avec un texte rouge se
 * remarque autant, sans transformer « Supprimer » en l'élément le plus voyant de l'écran.
 *
 * `focus-visible` et non `focus` : l'anneau apparaît à la tabulation, pas au clic à la souris —
 * où il ressemble à un défaut d'affichage.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-km font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        /** L'action neutre. C'est le défaut : voir le commentaire ci-dessus. */
        default: 'border border-km-line bg-km-surface text-km-text hover:bg-km-soft',
        /** L'action principale de la page. Une seule. */
        primary: 'border border-km-green bg-km-green text-white hover:bg-[#0a6650]',
        /** Une action destructrice, annoncée sans crier. */
        danger: 'border border-transparent bg-km-red-soft text-km-red hover:bg-km-red hover:text-white',
        /** Sans fond ni bordure : pour les actions de second plan dans une barre déjà chargée. */
        ghost: 'text-km-muted hover:bg-km-soft hover:text-km-text',
        /** Conservée le temps de la refonte : de nombreux écrans l'appellent encore. */
        outline: 'border border-km-line bg-km-surface text-km-text hover:bg-km-soft',
        subtle: 'bg-km-soft text-km-text hover:bg-km-line',
      },
      size: {
        default: 'h-8 px-3 text-km-body',
        sm: 'h-7 px-2.5 text-km-label',
        lg: 'h-9 px-4 text-km-name',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
