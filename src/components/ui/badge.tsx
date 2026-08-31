import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * LA PASTILLE DE STATUT, dans la palette de la maquette de Michel (31/08/2026) — son `.km-tag`.
 *
 * Cinq tons, chacun sur un fond pâle de sa propre teinte : neutre, vert, bleu, ambre, rouge. Le
 * fond plein n'existe pas ici — une pastille dit un état, elle ne réclame pas l'attention comme
 * un bouton.
 *
 * LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE. C'est un critère de recette de son dossier :
 * « les couleurs de statut ont un libellé texte ; la couleur seule ne porte jamais
 * l'information ». Une pastille sans texte est donc une pastille cassée — pour quelqu'un qui
 * distingue mal le vert du rouge, elle ne dit rien du tout.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-km-pill px-[7px] py-[3px] text-km-label font-semibold',
  {
    variants: {
      tone: {
        neutral: 'bg-km-soft text-km-muted',
        green: 'bg-km-green-soft text-km-green',
        blue: 'bg-km-blue-soft text-km-blue',
        amber: 'bg-km-amber-soft text-km-amber',
        red: 'bg-km-red-soft text-km-red',
        /* `kiwi` était le nom du vert avant la refonte. Gardé en alias : une soixantaine
           d'appels l'utilisent, et les renommer d'un coup ferait un commit illisible où la
           refonte visuelle se mélangerait à un renommage. */
        kiwi: 'bg-km-green-soft text-km-green',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
