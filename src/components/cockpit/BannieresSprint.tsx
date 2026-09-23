import { useState } from 'react'
import { CalendarClock, FileCheck2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { acquitterAlerte, useAlertesSprint, type AlerteSprint } from '@/lib/data/alertesSprint'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES BANNIÈRES DU SPRINT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « des bannières de notifications qui s'affichent pendant le sprint,
 * notamment pour prévenir d'un rappel à heure précise ou d'une réception de factures ».
 *
 * ══ ELLES NE RECOUVRENT RIEN ══
 *
 * Le sprint est déjà un recouvrement plein écran ; une notification flottante par-dessus ferait un
 * troisième étage et cacherait le nom de celui à qui on parle. Les bannières s'insèrent donc dans
 * le flux, sous la barre de séance, et POUSSENT le contenu. On perd quarante pixels, on ne perd
 * jamais le fil.
 *
 * ══ DEUX SEULEMENT, ET LA PLUS RÉCENTE EN HAUT ══
 *
 * Trois bannières empilées, c'est un mur : on cesse de les lire et on ferme tout. Au-delà de deux,
 * on dit combien il en reste plutôt que de les montrer.
 *
 * ══ « PLUS TARD » N'EST PAS « JAMAIS » ══
 *
 * Fermer une bannière de FACTURES marque la notification lue : elle a fait son office, l'information
 * est passée. Fermer un RAPPEL ne touche pas la tâche — elle reste ouverte, et la bannière
 * reviendra tant que l'heure est dans la fenêtre. C'est voulu : on ne fait pas disparaître un
 * rendez-vous téléphonique d'un clic distrait.
 */
export function BannieresSprint({ actif, onOuvrir }: {
  actif: boolean
  /** Ouvrir la fiche concernée dans le sprint si elle y est, sinon dans un nouvel onglet. */
  onOuvrir: (alerte: AlerteSprint) => void
}) {
  const { data: alertes } = useAlertesSprint(actif)
  const [masquees, setMasquees] = useState<string[]>([])

  const visibles = (alertes ?? []).filter((a) => !masquees.includes(a.cle))
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
              {a.detail ? <p className="truncate text-km-label text-km-side-muted">{a.detail}</p> : null}
            </div>

            {a.cible_id ? (
              <button
                onClick={() => onOuvrir(a)}
                className="shrink-0 rounded-km border border-km-side-line px-3 py-1.5 text-km-label font-semibold text-km-side-text transition-colors hover:border-km-side-muted hover:bg-km-side-bas"
              >
                {facture ? 'Voir les factures' : 'Ouvrir la fiche'}
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
