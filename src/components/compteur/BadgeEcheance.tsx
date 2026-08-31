import { Badge } from '@/components/ui/badge'
import { SENS_NATURE_ECHEANCE, type EcheanceCompteur } from '@/lib/echeance'

/**
 * La nature d'une échéance, dite à l'écran : prouvée, estimée, ou absente.
 *
 * Diapositive 6 de Michel (24/08/2026). Le mot compte : un commercial qui lance une prospection sur
 * une date estimée ne joue pas la même partie que sur une date prouvée par un contrat. Aujourd'hui
 * l'écran affiche « Échéance : 31/12/2028 » sans distinction, et 6 275 des 7 311 échéances de la base
 * sont des déclarations — la très grande majorité de ce qu'on lit n'est pas prouvé.
 *
 * LA CONTRADICTION EST DITE, PAS ARBITRÉE. 144 compteurs portent un contrat en cours dont la fin
 * contredit la date déclarée de plus d'un mois, parfois de quatre ans. On affiche les deux dates :
 * trancher à la place du commercial ferait disparaître le problème de l'écran sans le résoudre.
 */
export function BadgeEcheance({ e, dense = false }: { e: EcheanceCompteur; dense?: boolean }) {
  const dateFr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR')

  if (e.nature === 'ABSENTE') {
    return (
      <Badge tone="neutral" title={SENS_NATURE_ECHEANCE.ABSENTE} className={dense ? 'px-2 py-0 text-km-xs' : undefined}>
        Sans échéance
      </Badge>
    )
  }

  const prouvee = e.nature === 'PROUVEE'
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge
        tone={prouvee ? 'kiwi' : 'amber'}
        title={SENS_NATURE_ECHEANCE[e.nature]}
        className={dense ? 'px-2 py-0 text-km-xs' : undefined}
      >
        {prouvee ? 'Prouvée' : 'Estimée'}
      </Badge>
      {e.contredit && e.dateDeclaree && e.datePreuve && (
        <Badge
          tone="red"
          className={dense ? 'px-2 py-0 text-km-xs' : undefined}
          title={`Le contrat rattaché finit le ${dateFr(e.datePreuve)}, mais la date déclarée est le ${dateFr(e.dateDeclaree)}. À vérifier auprès du client — la date retenue ici est celle du contrat.`}
        >
          Contredit la date déclarée
        </Badge>
      )}
    </span>
  )
}
