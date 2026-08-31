import { cn } from '@/lib/utils'
import { useMarketTicker } from '@/lib/data/marche'

/**
 * LES COURS PEG (gaz) ET BASE (électricité).
 *
 * Retiré de la barre du haut le 31/08/2026 à la demande de Naoëlle — « enlève le bloc PEG BASE pour
 * le moment » — et déplacé ici entier plutôt que supprimé : « pour le moment » veut dire qu'il
 * reviendra peut-être, pas qu'il faudra le réécrire. Le remettre tient en un import et une ligne
 * dans `Topbar`.
 */
// Bandeau PEG (gaz) / BASE (élec), visible en permanence dans le header (demande design William) --
// vert quand le prix baisse, rouge quand il monte (point de vue conseil énergie : une baisse est
// une bonne nouvelle pour le client, pas un signal "négatif" comme en finance classique).
export function CoursMarche() {
  const data = useMarketTicker()

  function line(label: string, value: { price: number; changePct: number } | undefined) {
    const down = (value?.changePct ?? 0) < 0
    return (
      <span>
        {label} Cal27{' '}
        <b className={cn('font-bold', !value ? 'text-km-faint' : down ? 'text-km-green' : 'text-km-red')}>
          {value ? `${value.price.toLocaleString('fr-FR')} ${down ? '▾' : '▴'}${Math.abs(value.changePct).toLocaleString('fr-FR')}%` : '—'}
        </b>
      </span>
    )
  }

  /* CE BANDEAU FAISAIT DÉBORDER TOUTE LA PAGE. Constaté en production le 31/08/2026 : la barre
        latérale était coupée à gauche, le bouton d'action à droite, sur les 38 écrans.

        La cause : ma passe de refonte l'a passé de 11,5 à 13 px. JetBrains Mono à 13 px est
        sensiblement plus large qu'à 11,5, et cet élément est en `shrink-0` — il ne se comprime
        pas, il pousse. Un demi-point de taille sur une police à chasse fixe suffit à décaler une
        application entière.

        Il redescend à 11 px. Un cours de marché est une information de contexte, pas le sujet de
        l'écran : le plancher de 11 px de son dossier vise « l'information essentielle ». */
  return (
    <div className="hidden shrink-0 items-center gap-3 rounded-[7px] border border-km-line bg-km-bg px-3 py-[5px] font-mono text-km-label text-km-muted lg:flex">
      {line('PEG', data?.peg)}
      <span className="text-[#d5d4cf]">│</span>
      {line('BASE', data?.base)}
    </div>
  )
}
