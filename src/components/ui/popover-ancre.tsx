import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * ══ UN PANNEAU FLOTTANT ACCROCHÉ À SON BOUTON ══
 *
 * Le petit bout de mécanique que trois composants de l'application refaisaient déjà à l'identique :
 * `MenuChoix`, `MenuFiltres`, et maintenant le menu de report d'une tâche. Il n'a l'air de rien et
 * il a quatre pièges, tous rencontrés en vrai :
 *
 *   LE PORTAIL. Sans lui, le panneau est coupé net par le premier parent en `overflow: hidden` —
 *   et un bouton de ligne de tableau vit toujours dans un conteneur qui défile.
 *
 *   LA POSITION AVANT PEINTURE. Mesurée après (`useEffect`), le panneau apparaît une image en haut
 *   à gauche de la page avant de sauter à sa place. `useLayoutEffect` le pose avant qu'on le voie.
 *
 *   LA BASCULE VERS LE HAUT. Ouvert près du bas de la fenêtre, un panneau qui descend déborde sous
 *   l'écran et devient illisible. Il s'ouvre alors au-dessus du bouton.
 *
 *   LA FERMETURE AU DÉFILEMENT. La position est figée à l'ouverture : laisser le panneau flotter
 *   pendant qu'on fait défiler la page le détacherait de ce qu'il commande.
 *
 * ── IL NE DESSINE RIEN, IL PLACE ──
 *
 * Pas de cadre, pas de fond, pas de titre : ces choix appartiennent à ce qu'on y met. Un composant
 * de placement qui imposerait aussi une apparence obligerait à la défaire à chaque usage.
 */
export function PopoverAncre({
  ouvert,
  onFermer,
  ancre,
  aligne = 'droite',
  largeur = 260,
  ariaLabel,
  children,
  className,
}: {
  ouvert: boolean
  onFermer: () => void
  /** Le bouton auquel le panneau s'accroche. */
  ancre: React.RefObject<HTMLElement>
  aligne?: 'gauche' | 'droite'
  largeur?: number
  ariaLabel: string
  children: React.ReactNode
  className?: string
}) {
  const [cadre, setCadre] = useState<{ haut: number; bord: number; versLeHaut: boolean } | null>(null)
  const panneau = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!ouvert || !ancre.current) return
    const r = ancre.current.getBoundingClientRect()
    /* 280 px est une estimation volontairement large : mieux vaut basculer vers le haut à tort que
       de laisser un panneau déborder sous l'écran, où il serait simplement inatteignable. */
    const placeEnDessous = window.innerHeight - r.bottom
    const versLeHaut = placeEnDessous < 296 && r.top > 280
    setCadre({
      haut: versLeHaut ? r.top - 6 : r.bottom + 6,
      bord: aligne === 'droite' ? r.right : r.left,
      versLeHaut,
    })
  }, [ouvert, ancre, aligne])

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      const c = e.target as Node
      if (!ancre.current?.contains(c) && !panneau.current?.contains(c)) onFermer()
    }
    const bouge = () => onFermer()
    const clavier = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', clavier)
    window.addEventListener('scroll', bouge, true)
    window.addEventListener('resize', bouge)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', clavier)
      window.removeEventListener('scroll', bouge, true)
      window.removeEventListener('resize', bouge)
    }
  }, [ouvert, ancre, onFermer])

  if (!ouvert || !cadre) return null

  return createPortal(
    <div
      ref={panneau}
      role="dialog"
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: cadre.versLeHaut ? undefined : cadre.haut,
        bottom: cadre.versLeHaut ? window.innerHeight - cadre.haut : undefined,
        left: aligne === 'gauche' ? cadre.bord : undefined,
        right: aligne === 'droite' ? window.innerWidth - cadre.bord : undefined,
        width: largeur,
      }}
      className={cn('animate-km-hub-pop z-50', className)}
    >
      {children}
    </div>,
    document.body,
  )
}
