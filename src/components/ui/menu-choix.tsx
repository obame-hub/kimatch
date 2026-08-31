import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * UN SÉLECTEUR QUI NE RESSEMBLE PLUS À 2005.
 *
 * Naoëlle, 31/08/2026, capture à l'appui : « il y a des sélecteurs comme ça, des composants qui ont
 * l'air très vieillots ; il faut que l'app soit rendu UI/UX 2026, pas 2000 ».
 *
 * CE QU'ELLE A PHOTOGRAPHIÉ. Un `<select>` natif ouvert : liste blanche à coins droits, ligne
 * survolée en bleu système, police du système d'exploitation. Aucune de ces trois choses n'est
 * stylable — le navigateur dessine cette liste lui-même, en dehors de la page. Un `<select>` peut
 * avoir l'air correct FERMÉ ; ouvert, il trahit toujours son époque. C'est le seul composant de
 * l'application dont l'apparence ne nous appartient pas.
 *
 * D'OÙ UN BOUTON ET UNE LISTE À NOUS. Ce qui se perd en le remplaçant, c'est l'accessibilité que le
 * natif donne gratuitement — et c'est précisément ce qu'il faut réécrire, pas décorer :
 *
 *   rôle       `listbox` + `option`, avec `aria-selected` et `aria-activedescendant`
 *   clavier    ↑ ↓ pour parcourir, Début / Fin, Entrée ou Espace pour choisir, Échap pour fermer
 *   focus      le focus revient sur le bouton à la fermeture, jamais perdu dans le vide
 *   souris     un clic dehors ferme, comme partout ailleurs
 *
 * LA LISTE PASSE PAR UN PORTAIL. Sans lui, elle est coupée par le premier parent en `overflow:
 * hidden` — et une barre de travail vit presque toujours dans un conteneur qui défile. Sa position
 * est calculée au moment de l'ouverture, et elle bascule au-dessus du bouton quand le bas de la
 * fenêtre est trop proche : un menu qui déborde sous l'écran ne se lit pas.
 */
export interface ChoixMenu {
  valeur: string
  libelle: string
  /** Une ligne de contexte sous le libellé — le nombre d'éléments, une précision. */
  detail?: string
}

export function MenuChoix({
  valeur,
  onChange,
  choix,
  ariaLabel,
  className,
  aligne = 'gauche',
}: {
  valeur: string
  onChange: (v: string) => void
  choix: ChoixMenu[]
  ariaLabel: string
  className?: string
  /** Sur quel bord la liste s'aligne, quand elle est plus large que le bouton. */
  aligne?: 'gauche' | 'droite'
}) {
  const [ouvert, setOuvert] = useState(false)
  const [survol, setSurvol] = useState(0)
  const [cadre, setCadre] = useState<{ haut: number; gauche: number; largeur: number; versLeHaut: boolean } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const liste = useRef<HTMLDivElement>(null)

  const actuel = choix.find((c) => c.valeur === valeur)
  const index = Math.max(0, choix.findIndex((c) => c.valeur === valeur))

  // La position se calcule AVANT la peinture : mesurée après, la liste apparaîtrait une image en
  // haut à gauche de la page avant de sauter à sa place.
  useLayoutEffect(() => {
    if (!ouvert || !bouton.current) return
    const r = bouton.current.getBoundingClientRect()
    const hauteurEstimee = Math.min(choix.length * 34 + 12, 320)
    const placeEnDessous = window.innerHeight - r.bottom
    const versLeHaut = placeEnDessous < hauteurEstimee + 16 && r.top > hauteurEstimee
    setCadre({
      haut: versLeHaut ? r.top - 6 : r.bottom + 6,
      gauche: r.left,
      largeur: Math.max(r.width, 180),
      versLeHaut,
    })
    setSurvol(index)
  }, [ouvert, choix.length, index])

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      const c = e.target as Node
      if (!bouton.current?.contains(c) && !liste.current?.contains(c)) setOuvert(false)
    }
    // Un menu ouvert doit suivre son bouton ou disparaître : sa position est figée à l'ouverture,
    // donc le laisser flotter pendant un défilement le détacherait de ce qu'il commande.
    const bouge = () => setOuvert(false)
    document.addEventListener('mousedown', dehors)
    window.addEventListener('scroll', bouge, true)
    window.addEventListener('resize', bouge)
    return () => {
      document.removeEventListener('mousedown', dehors)
      window.removeEventListener('scroll', bouge, true)
      window.removeEventListener('resize', bouge)
    }
  }, [ouvert])

  function choisir(i: number) {
    const c = choix[i]
    if (c) onChange(c.valeur)
    setOuvert(false)
    bouton.current?.focus()
  }

  function auClavier(e: React.KeyboardEvent) {
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOuvert(true)
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOuvert(false); bouton.current?.focus() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSurvol((i) => (i + 1) % choix.length) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSurvol((i) => (i - 1 + choix.length) % choix.length) }
    if (e.key === 'Home') { e.preventDefault(); setSurvol(0) }
    if (e.key === 'End') { e.preventDefault(); setSurvol(choix.length - 1) }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(survol) }
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((v) => !v)}
        onKeyDown={auClavier}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-[32px] shrink-0 items-center gap-1.5 rounded-km border px-2.5 text-km-label font-semibold transition-colors',
          ouvert
            ? 'border-km-green bg-km-surface text-km-text'
            : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft hover:text-km-text',
          className,
        )}
      >
        <span className="truncate">{actuel?.libelle ?? ariaLabel}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', ouvert && 'rotate-180')}
        />
      </button>

      {ouvert && cadre && createPortal(
        <div
          ref={liste}
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={`choix-${survol}`}
          tabIndex={-1}
          onKeyDown={auClavier}
          style={{
            position: 'fixed',
            top: cadre.versLeHaut ? undefined : cadre.haut,
            bottom: cadre.versLeHaut ? window.innerHeight - cadre.haut : undefined,
            left: aligne === 'gauche' ? cadre.gauche : undefined,
            right: aligne === 'droite' ? window.innerWidth - cadre.gauche - cadre.largeur : undefined,
            minWidth: cadre.largeur,
          }}
          className="z-50 max-h-[320px] overflow-y-auto rounded-km-md border border-km-line bg-km-surface p-1 shadow-km-pop"
        >
          {choix.map((c, i) => {
            const choisi = c.valeur === valeur
            return (
              <button
                key={c.valeur}
                id={`choix-${i}`}
                role="option"
                aria-selected={choisi}
                type="button"
                onMouseEnter={() => setSurvol(i)}
                onClick={() => choisir(i)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-km-sm px-2 py-1.5 text-left text-km-body transition-colors',
                  // Le survol est un fond vert très pâle, pas le bleu du système : c'est tout ce que
                  // le `<select>` natif ne savait pas faire.
                  i === survol ? 'bg-km-green-soft text-km-text' : 'text-km-muted',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.libelle}</span>
                  {c.detail && <span className="block truncate text-km-tiny text-km-faint">{c.detail}</span>}
                </span>
                {choisi && <Check className="h-3.5 w-3.5 shrink-0 text-km-green" />}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
