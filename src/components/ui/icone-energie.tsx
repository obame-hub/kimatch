import { Flame, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * L'ÉNERGIE D'UN DOSSIER, EN ICÔNE.
 *
 * Naoëlle, 31/08/2026 : « remplace tous les emojis comme celui du gaz et élec qui font pas pro du
 * tout, remplace-les par des icônes gaz et élec minimalistes ».
 *
 * POURQUOI LUCIDE ET PAS UNE AUTRE BIBLIOTHÈQUE. Elle m'a laissé le choix, et le bon choix est celui
 * qui est déjà là. Toute l'application dessine ses icônes avec `lucide-react` : même grille de
 * 24 px, même épaisseur de trait, mêmes extrémités arrondies. Introduire un second jeu — Phosphor,
 * Tabler, Remix — mettrait deux traits différents côte à côte sur la même carte, et c'est
 * exactement le genre d'écart qui fait « pas fini » sans qu'on sache dire pourquoi.
 *
 * `Flame` et `Zap` sont les deux tracés minimalistes de ce jeu pour le gaz et l'électricité. Un
 * emoji, lui, est dessiné par le système : il change d'aspect entre Windows, macOS et Android, il
 * arrive en couleurs pleines au milieu d'une interface en traits fins, et il ne prend pas la couleur
 * du texte qui l'entoure. Ces trois raisons suffisent — c'est ce qu'elle voyait comme « pas pro ».
 *
 * LES COULEURS SONT CELLES DE L'IDENTITÉ, pas des couleurs d'emoji : l'ambre du gaz et le bleu de
 * l'électricité, déjà employés partout ailleurs pour ces deux énergies.
 */
export function IconeEnergie({ type, className }: {
  /** Le code de `types_energies` — ELECTRICITE ou GAZ — ou sa forme minuscule héritée. */
  type: string | null | undefined
  className?: string
}) {
  if (!type) return null
  const gaz = type.toUpperCase().startsWith('GAZ')
  const Icone = gaz ? Flame : Zap
  return (
    <Icone
      className={cn('h-3.5 w-3.5 shrink-0', gaz ? 'text-km-amber' : 'text-km-blue', className)}
      aria-label={gaz ? 'Gaz' : 'Électricité'}
    />
  )
}
