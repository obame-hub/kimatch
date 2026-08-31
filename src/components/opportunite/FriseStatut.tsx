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
 *
 * ══ ELLE SERT MAINTENANT À TOUS LES OBJETS ══
 *
 * Naoëlle, 27/08/2026 : « il y a plusieurs objets qui n'ont pas l'animation que William a faite dans
 * la frise des statuts, les traits qui bougent entre deux statuts — il faut que tous les statuts des
 * objets aient cette animation ».
 *
 * Elle était réservée à l'opportunité. Le contrat avait une frise inerte, la recommandation aucune,
 * le signal et le mandat non plus. Le composant prend donc une TEINTE : le montage, les tailles et
 * les deux animations de William ne bougent pas d'un pixel, seule la couleur suit l'objet — magenta
 * pour l'opportunité comme avant, et sa propre famille pour les autres.
 *
 * POURQUOI LA COULEUR ET RIEN D'AUTRE : c'est le seul endroit où la frise doit parler de l'objet
 * qu'elle décrit. Le reste — le jalon qui respire, les hachures qui avancent — dit « vous êtes ici,
 * voilà ce qui reste », et ça se dit de la même façon partout.
 */

/** Les familles de couleur d'une frise. Chacune reprend les jetons déjà utilisés par son objet. */
export interface TeinteFrise {
  /** Dégradé des jalons franchis et des segments derrière soi. */
  gradient: string
  /** Ombre portée du jalon courant. */
  ombreCourant: string
  /** Ombre portée d'un jalon franchi. */
  ombreFranchi: string
  /** Les deux teintes des hachures du segment en cours : trait, puis fond. */
  hachures: [string, string]
  /** Animation de pulsation du jalon courant, ou `null` pour ne pas en mettre. */
  pulsation: string | null
}

export const TEINTES_FRISE: Record<string, TeinteFrise> = {
  /** L'opportunité — le magenta de William, inchangé au pixel près. */
  opportunite: {
    gradient: 'from-opp-600 to-opp-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(168,49,127,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(168,49,127,.2)]',
    hachures: ['#e8c3dc', '#f4eef1'],
    pulsation: 'animate-km-opp-pulse',
  },
  /** La recommandation — le vert de Kiwee, sa couleur dans tout le reste de l'app. */
  recommandation: {
    gradient: 'from-kiwi-600 to-kiwi-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(13,122,95,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(13,122,95,.2)]',
    hachures: ['#c3ddd4', '#eef5f2'],
    pulsation: 'animate-km-soft-pulse',
  },
  /** Le signal — l'ambre de la détection, comme sa tuile du tableau de bord. */
  signal: {
    gradient: 'from-amber-600 to-amber-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(181,122,36,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(181,122,36,.2)]',
    hachures: ['#e8d5b4', '#f6f1e6'],
    pulsation: 'animate-km-soft-pulse',
  },
  /** Le contrat et le mandat — le bleu des engagements. */
  contrat: {
    gradient: 'from-sky-600 to-sky-400',
    ombreCourant: 'shadow-[0_5px_14px_rgba(59,95,138,.34)]',
    ombreFranchi: 'shadow-[0_2px_6px_rgba(59,95,138,.2)]',
    hachures: ['#c2d0e0', '#eef1f6'],
    pulsation: 'animate-km-soft-pulse',
  },
}
export interface JalonFrise {
  code: string
  libelle: string
}

export function FriseStatut({ jalons, courant, finalite, teinte = 'opportunite' }: {
  jalons: JalonFrise[]
  /** Code du palier atteint. Les jalons précédents sont « franchis ». */
  courant: string
  /** Qualification finale, quand l'objet est clôturé : elle ferme la frise. */
  finalite?: { libelle: string; perdue: boolean } | null
  /** La famille de couleur. Par défaut celle de l'opportunité, pour ne rien changer à l'existant. */
  teinte?: keyof typeof TEINTES_FRISE
}) {
  const t = TEINTES_FRISE[teinte] ?? TEINTES_FRISE.opportunite
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
                /* LES HACHURES PASSENT PAR LE STYLE EN LIGNE, et c'est obligé : Tailwind compile
                   les classes qu'il LIT dans le source, donc une classe construite à l'exécution
                   (`bg-[…${couleur}…]`) n'existerait jamais dans la feuille produite. Le motif est
                   celui de William au pixel près — 7 px de trait, 7 px de fond, défilement de 36. */
                style={
                  segmentEnCours
                    ? {
                        backgroundImage: `repeating-linear-gradient(90deg,${t.hachures[0]} 0px,${t.hachures[0]} 7px,${t.hachures[1]} 7px,${t.hachures[1]} 14px)`,
                      }
                    : undefined
                }
                className={cn(
                  '-mx-2.5 h-[5px] flex-1 rounded-[3px]',
                  i <= atteint
                    ? 'bg-gradient-to-r ' + t.gradient
                    : segmentEnCours
                      ? 'animate-km-stripe bg-[length:36px_100%] motion-reduce:animate-none'
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
                    : 'bg-gradient-to-br text-white ' + t.gradient,
                  etat === 'courant' && t.ombreCourant,
                  etat === 'franchi' && t.ombreFranchi,
                  etat === 'courant' && !finalite && t.pulsation && t.pulsation + ' motion-reduce:animate-none',
                )}
              >
                {etat === 'franchi'
                  ? <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  : <span className={cn('rounded-full bg-current', etat === 'courant' ? 'h-1.5 w-1.5' : 'h-1 w-1')} />}
              </div>
              <p
                className={cn(
                  'mt-2 text-center text-km-label leading-tight tracking-tight',
                  etat === 'a_venir' ? 'font-semibold text-[#b6b8b3]' : 'font-extrabold text-km-text',
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
                finalite.perdue ? 'bg-red-600 shadow-[0_5px_16px_rgba(194,69,45,.35)]' : 'bg-km-green shadow-[0_5px_16px_rgba(13,122,95,.35)]',
              )}
            >
              <Check className="h-4 w-4" strokeWidth={2.6} />
            </div>
            <p className={cn('mt-2 text-center text-km-label font-extrabold tracking-tight', finalite.perdue ? 'text-red-700' : 'text-km-green')}>
              {finalite.libelle}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
