import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE GLISSEUR DU SPRINT — DES PANNEAUX CÔTE À CÔTE, ET CE QUI DIT QU'ON PEUT GLISSER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Né dans la carte « Joignabilité » du volet de droite (William, 22/09/2026 : « une flèche cliquable
 * doit indiquer qu'on peut slide »). William, 28/09/2026, pour le numéro à appeler : « je propose de
 * réutiliser le concept de slider utilisé dans le score de joignabilité ».
 *
 * RÉUTILISÉ, PAS RECOPIÉ. Deux glisseurs écrits deux fois divergent au premier ajustement : une
 * flèche un pixel plus grande ici, une courbe d'animation différente là, et l'écran semble fait de
 * deux mains. Il n'existe qu'ici.
 *
 * ══ DEUX PIÈCES, PARCE QUE LES CARTES LES RANGENT À DEUX ENDROITS ══
 *
 * La joignabilité met les commandes en pied de carte ; la carte « Appeler », dont le pied est déjà
 * le bouton d'appel, les met en tête. La piste et ses commandes sont donc séparées, et partagent
 * seulement l'index du panneau affiché.
 */

/**
 * La piste : les panneaux, côte à côte, translatés d'un panneau par cran.
 *
 * DES PANNEAUX QUI GLISSENT, et non un seul qu'on remplace : le remplacement fait clignoter la
 * carte, le glissement dit d'où l'on vient.
 *
 * LE PANNEAU HORS CHAMP EST INERTE : on ne peut ni le lire au lecteur d'écran ni y tabuler. Sans ça,
 * la touche Tab emmènerait dans le champ du panneau invisible, et l'on taperait à l'aveugle.
 */
export function PisteGlisseur({ vue, panneaux, className }: {
  vue: number
  panneaux: { cle: string; contenu: ReactNode }[]
  className?: string
}) {
  const n = Math.max(1, panneaux.length)
  return (
    <div className={cn('overflow-hidden', className)}>
      <div
        className="flex transition-transform duration-500 [transition-timing-function:cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
        style={{ width: `${n * 100}%`, transform: `translateX(-${(vue * 100) / n}%)` }}
      >
        {panneaux.map((p, i) => (
          <div
            key={p.cle}
            className="shrink-0 px-1"
            style={{ width: `${100 / n}%` }}
            aria-hidden={vue !== i}
            {...(vue !== i ? { inert: '' } : {})}
          >
            {p.contenu}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Les commandes : deux flèches, et entre elles une pastille par panneau.
 *
 * DEUX PASTILLES SEULES NE DISENT PAS QU'ON PEUT GLISSER : elles se lisent comme un état. Une flèche
 * est la seule forme que personne n'a besoin d'apprendre. Elles restent DÉSACTIVÉES aux extrémités
 * plutôt que de disparaître : un bouton qui s'efface fait sauter la mise en page.
 */
export function CommandesGlisseur({ vue, onVue, libelles, sujet }: {
  vue: number
  onVue: (v: number) => void
  /** Un libellé par panneau, pour dire à chaque pastille ce qu'elle montre. */
  libelles: string[]
  /** Ce qu'on fait défiler, pour les libellés d'accessibilité — « la joignabilité », « le numéro ». */
  sujet: string
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Fleche sens="precedent" sujet={sujet} onClick={() => onVue(Math.max(0, vue - 1))} desactive={vue === 0} />
      <span className="flex items-center gap-1">
        {libelles.map((l, i) => (
          <button
            key={l}
            type="button"
            onClick={() => onVue(i)}
            aria-label={`Voir ${sujet} : ${l.toLowerCase()}`}
            aria-pressed={vue === i}
            className={cn(
              'h-1.5 rounded-full transition-all motion-reduce:transition-none',
              vue === i ? 'w-4 bg-km-side-green' : 'w-1.5 bg-km-side-line hover:bg-km-side-muted',
            )}
          />
        ))}
      </span>
      <Fleche sens="suivant" sujet={sujet} onClick={() => onVue(Math.min(libelles.length - 1, vue + 1))} desactive={vue === libelles.length - 1} />
    </div>
  )
}

/** Une flèche de glisseur : assez grande pour se cliquer, assez discrète pour ne pas voler l'œil. */
function Fleche({ sens, sujet, onClick, desactive }: {
  sens: 'precedent' | 'suivant'
  sujet: string
  onClick: () => void
  desactive: boolean
}) {
  const Icone = sens === 'precedent' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      aria-label={`${sens === 'precedent' ? 'Vue précédente' : 'Vue suivante'} — ${sujet}`}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
        desactive
          ? 'cursor-default border-km-side-line/60 text-km-side-line'
          : 'border-km-side-line text-km-side-muted hover:border-km-side-green hover:text-km-side-green',
      )}
    >
      <Icone className="h-3 w-3" aria-hidden="true" />
    </button>
  )
}
