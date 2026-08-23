import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * La frise de statut de l'opportunité, reprise de la maquette « Fiche Opportunite » de William
 * (23/08/2026) — jalons, segments, et l'animation qui distingue l'étape en cours.
 *
 * RELEVÉ DANS SON FICHIER SOURCE, pas sur une capture d'écran. Les valeurs viennent de sa fonction
 * `railVals()` : jalon de 30 px (34 px pour l'étape courante), dégradé `#8c2168 → #c14e9c` dès qu'il
 * est atteint, cercle blanc à bordure tiretée `2px dashed` tant qu'il ne l'est pas ; segment de 5 px
 * de haut, plein en dégradé derrière soi, HACHURÉ ET DÉFILANT devant. Les deux animations sont les
 * siennes : `ringPulse` (le jalon courant respire) et `stripeMove` (les hachures avancent de 36 px).
 *
 * POURQUOI L'ANIMATION COMPTE. Une frise inerte dit « voici les étapes » ; celle-ci dit « vous êtes
 * ici, et voilà ce qui reste à franchir ». C'est le seul élément de l'écran qui donne le sens de la
 * marche, et c'est précisément ce qui manquait à ma première version.
 *
 * `prefers-reduced-motion` coupe les deux animations : une pulsation permanente est pénible pour
 * qui y est sensible, et l'information reste lisible sans elle (taille, couleur, coche).
 */
export interface JalonFrise {
  code: string
  libelle: string
}

export function FriseStatut({ jalons, courant, finalite }: {
  jalons: JalonFrise[]
  /** Code du palier atteint. Les jalons précédents sont « franchis ». */
  courant: string
  /** Qualification finale, quand l'opportunité est clôturée : elle ferme la frise. */
  finalite?: { libelle: string; perdue: boolean } | null
}) {
  const indexCourant = Math.max(0, jalons.findIndex((j) => j.code === courant))
  // Une opportunité clôturée a tout franchi : la frise s'arrête sur sa qualification finale.
  const atteint = finalite ? jalons.length : indexCourant

  return (
    <div className="flex items-center px-1.5 pb-1.5 pt-4">
      {jalons.map((jalon, i) => {
        const etat = i < atteint ? 'franchi' : i === atteint ? 'courant' : 'a_venir'
        // Le segment qui SUIT immédiatement l'étape courante est celui qu'il reste à franchir : on
        // l'affiche hachuré et défilant. Les autres sont pleins ou éteints.
        const segmentEnCours = i === atteint + 1 && !finalite
        return (
          <div key={jalon.code} className="flex min-w-0 flex-1 items-center">
            {i > 0 && (
              <div
                className={cn(
                  '-mx-2.5 h-[5px] flex-1 rounded-[3px]',
                  i <= atteint
                    ? 'bg-gradient-to-r from-opp-600 to-opp-400'
                    : segmentEnCours
                      ? 'animate-kw-stripe bg-[repeating-linear-gradient(90deg,#e8c3dc_0px,#e8c3dc_7px,#f4eef1_7px,#f4eef1_14px)] bg-[length:36px_100%] motion-reduce:animate-none'
                      : 'bg-[#eceae6]',
                )}
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <div
                className={cn(
                  'z-[1] flex shrink-0 items-center justify-center rounded-full',
                  etat === 'courant' ? 'h-[34px] w-[34px]' : 'h-[30px] w-[30px]',
                  etat === 'a_venir'
                    ? 'border-2 border-dashed border-[#dcdad5] bg-white text-[#c0c2bd]'
                    : 'bg-gradient-to-br from-opp-600 to-opp-400 text-white',
                  etat === 'courant' && 'shadow-[0_5px_14px_rgba(168,49,127,.34)]',
                  etat === 'franchi' && 'shadow-[0_2px_6px_rgba(168,49,127,.2)]',
                  etat === 'courant' && !finalite && 'animate-kw-opp-pulse motion-reduce:animate-none',
                )}
              >
                {etat === 'franchi'
                  ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  : <span className={cn('rounded-full bg-current', etat === 'courant' ? 'h-1.5 w-1.5' : 'h-1 w-1')} />}
              </div>
              <p
                className={cn(
                  'mt-2 text-center text-[11.5px] leading-tight tracking-tight',
                  etat === 'a_venir' ? 'font-semibold text-[#b6b8b3]' : 'font-extrabold text-navy-800',
                )}
              >
                {jalon.libelle}
              </p>
            </div>
          </div>
        )
      })}

      {finalite && (
        <div className="flex min-w-0 flex-1 items-center">
          <div
            className={cn(
              '-mx-2.5 h-[5px] flex-1 rounded-[3px] bg-gradient-to-r',
              finalite.perdue ? 'from-red-300 to-red-600' : 'from-kiwi-300 to-kiwi-600',
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <div
              className={cn(
                'z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white',
                finalite.perdue ? 'bg-red-600 shadow-[0_5px_16px_rgba(194,69,45,.35)]' : 'bg-kiwi-600 shadow-[0_5px_16px_rgba(13,122,95,.35)]',
              )}
            >
              <Check className="h-4 w-4" strokeWidth={2.6} />
            </div>
            <p className={cn('mt-2 text-center text-[11.5px] font-extrabold tracking-tight', finalite.perdue ? 'text-red-700' : 'text-kiwi-700')}>
              {finalite.libelle}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
