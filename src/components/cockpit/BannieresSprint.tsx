import { useEffect, useState } from 'react'
import { CalendarClock, FileCheck2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { acquitterAlerte, useAlertes, type Alerte } from '@/lib/data/alertes'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES BANNIÈRES DU SPRINT — ET ELLES NE FONT PAS LA MÊME CHOSE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026, en précisant le geste attendu de chacune :
 *
 *   « Le clic sur une bannière "Factures reçues" doit renvoyer vers l'enregistrement en question.
 *     Vu que ça quitte le sprint, une petite popup de confirmation de redirection me semble utile.
 *
 *     Le clic sur une bannière de rappel de rdv est juste informative. […] Si je suis déjà sur
 *     Cockpit, la bannière est une information et Cockpit doit positionner la fiche à rappeler
 *     automatiquement à la suite de la fiche en cours d'appel. Ainsi, simplement en passant à la
 *     prochaine étape, le commercial appellera la bonne personne à la bonne heure. »
 *
 * ══ DEUX NATURES, DEUX GESTES OPPOSÉS ══
 *
 *   FACTURES        elle SORT du sprint — on va lire ce qui vient d'arriver, et c'est un aller
 *                   simple. D'où la confirmation : une séance interrompue par mégarde ne se
 *                   reprend pas, on repart du début et l'élan est perdu.
 *   RAPPEL À L'HEURE  elle ne va NULLE PART. Le sprint a déjà rangé la fiche juste après celle en
 *                   cours (voir `SprintCockpit`) : il n'y a rien à cliquer, il suffit de finir
 *                   l'appel et de passer au suivant. La bannière le DIT, plutôt que d'offrir un
 *                   bouton qui ferait sauter l'appel en cours.
 *
 * ══ ELLES POUSSENT, ELLES NE RECOUVRENT PAS ══
 *
 * Le sprint est déjà un recouvrement plein écran ; une notification flottante par-dessus ferait un
 * troisième étage et cacherait le nom de celui à qui l'on parle. Deux au maximum : trois empilées,
 * c'est un mur — on cesse de les lire et on ferme tout.
 */
export function BannieresSprint({ actif, surRappel, onOuvrirFactures }: {
  actif: boolean
  /** Signale au sprint la fiche à rappeler, pour qu'il la place juste après celle en cours. */
  surRappel: (alerte: Alerte) => void
  /** Demande la sortie du sprint vers la fiche — après confirmation, qui est portée par le sprint. */
  onOuvrirFactures: (alerte: Alerte) => void
}) {
  /* QUINZE SECONDES DANS LE SPRINT, contre quarante-cinq ailleurs : ici on enchaîne les appels, et
     un rappel annoncé avec une minute de retard a manqué son créneau. */
  const { data: alertes } = useAlertes({ actif, cadenceMs: 15_000 })
  const [masquees, setMasquees] = useState<string[]>([])
  const [rangees, setRangees] = useState<string[]>([])

  const visibles = (alertes ?? []).filter((a) => !masquees.includes(a.cle))

  /* ══ LE RANGEMENT EST UN EFFET, PAS UN CALCUL ══
     Ma première version appelait `surRappel` pendant le rendu, dans une boucle : React n'y garantit
     rien — le rendu peut être rejoué, abandonné, doublé en mode strict — et le sprint se serait
     réordonné deux fois pour un seul rappel.

     ET LE RANGEMENT NE SE FAIT QU'UNE FOIS PAR RAPPEL. Sans cette mémoire, chaque relecture —
     toutes les quinze secondes — redéplacerait la fiche, y compris après que le commercial l'a
     lui-même remise ailleurs. Une automatisation qui se répète devient une automatisation qu'on
     subit. */
  useEffect(() => {
    for (const a of visibles) {
      if (a.nature !== 'RAPPEL_HEURE' || !a.cible_id || rangees.includes(a.cle)) continue
      setRangees((r) => (r.includes(a.cle) ? r : [...r, a.cle]))
      surRappel(a)
    }
    // `visibles` est reconstruit à chaque rendu : on ne dépend que de ce qui change vraiment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertes, masquees])

  if (visibles.length === 0) return null

  const affichees = visibles.slice(0, 2)
  const reste = visibles.length - affichees.length

  return (
    <div className="grid gap-1.5 px-4 pt-2 sm:px-8">
      {affichees.map((a) => {
        const facture = a.nature === 'FACTURES'
        return (
          <div
            key={a.cle}
            className={cn(
              'animate-km-fade-slide flex items-center gap-3 rounded-km border px-3.5 py-2.5',
              facture
                ? 'border-km-side-green/45 bg-km-side-green/12'
                : 'border-km-side-amber/45 bg-km-side-amber/12',
            )}
          >
            {facture
              ? <FileCheck2 className="h-4 w-4 shrink-0 text-km-side-green" aria-hidden="true" />
              : <CalendarClock className="h-4 w-4 shrink-0 text-km-side-amber" aria-hidden="true" />}

            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-km-name font-bold', facture ? 'text-km-side-green' : 'text-km-side-amber')}>
                {a.titre}
              </p>
              <p className="truncate text-km-label text-km-side-muted">
                {facture
                  ? a.detail
                  /* ON DIT CE QUI A ÉTÉ FAIT, on ne propose pas de le faire. La fiche est déjà
                     rangée : le commercial n'a qu'à finir son appel. */
                  : `${a.detail ? a.detail + ' — ' : ''}placé juste après la fiche en cours`}
              </p>
            </div>

            {facture && a.cible_id ? (
              <button
                onClick={() => onOuvrirFactures(a)}
                className="shrink-0 rounded-km border border-km-side-line px-3 py-1.5 text-km-label font-semibold text-km-side-text transition-colors hover:border-km-side-muted hover:bg-km-side-bas"
              >
                Voir les factures
              </button>
            ) : null}

            <button
              onClick={() => { setMasquees((m) => [...m, a.cle]); void acquitterAlerte(a.cle) }}
              aria-label="Masquer"
              title={facture ? 'Masquer — la notification est marquée lue' : 'Masquer — la tâche reste ouverte'}
              className="shrink-0 rounded-km-sm p-1 text-km-side-faint transition-colors hover:text-km-side-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}

      {reste > 0 ? (
        <p className="text-km-label text-km-side-faint">
          et {reste} autre{reste > 1 ? 's' : ''} notification{reste > 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  )
}
