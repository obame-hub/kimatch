import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarClock, ChevronRight } from 'lucide-react'
import type { ActionDuJour } from '@/lib/data/tableauDeBord'

/**
 * « MA JOURNÉE » — le bas de la maquette de Michel du 25/08/2026.
 *
 * Deux colonnes d'actions horodatées, chacune avec son heure, son titre, son contexte et un chevron.
 *
 * LA TABLE `actions` EST VIDE — zéro ligne au 25/08/2026, vérifié en base. Ce bloc affichera donc un
 * état vide, et c'est la seule chose honnête à faire : la remplir d'exemples serait donner à un
 * commercial une liste de rendez-vous qui n'existent pas. La structure est prête et suffit —
 * `date_prevue` est un timestamp, donc l'heure vient de la base — et le bloc se remplira de lui-même
 * dès que les commerciaux créeront des actions, ce qui est précisément ce que Michel leur demande de
 * faire à la main cette semaine.
 *
 * LE BADGE « DANS 45 MIN » DE SA MAQUETTE EST CALCULÉ, pas écrit : il apparaît sur une action prévue
 * dans l'heure. Une heure d'avance, c'est le moment où l'on cesse de planifier et où l'on se prépare.
 */
export function MaJournee({
  actions,
  chargement,
}: {
  actions: ActionDuJour[] | undefined
  chargement: boolean
}) {
  const navigate = useNavigate()
  const liste = actions ?? []

  return (
    <div className="rounded-kw-3xl border border-kw-border bg-white">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
        <div className="mr-auto">
          <h2 className="text-kw-h2 font-extrabold tracking-[-0.01em] text-kw-ink">Ma journée</h2>
          <p className="mt-0.5 text-kw-xs text-kw-meta">
            {chargement
              ? 'Chargement…'
              : liste.length === 0
                ? 'Aucune action planifiée aujourd’hui'
                : `${liste.length} action${liste.length > 1 ? 's' : ''} planifiée${liste.length > 1 ? 's' : ''} aujourd’hui`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/taches')}
          className="inline-flex items-center gap-1 text-kw-xs font-bold text-kw-green hover:underline"
        >
          Voir les tâches
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {liste.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-kw-border-faint px-5 py-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-kw-xl bg-kw-bloc text-kw-meta">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-kw-sm font-bold text-kw-ink">Votre journée est libre.</p>
            <p className="mt-0.5 text-kw-xs leading-relaxed text-kw-meta">
              Les actions apparaissent ici dès qu’elles sont planifiées, avec leur heure. Elles se
              créent depuis un signal, une opportunité ou une recommandation — c’est là qu’elles ont
              un objet.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 border-t border-kw-border-faint lg:grid-cols-2">
          {liste.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate('/taches/' + a.id)}
              className={
                'flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-kw-bloc ' +
                (i >= 2 ? 'border-t border-kw-border-faint ' : '') +
                (i % 2 === 1 ? 'lg:border-l lg:border-kw-border-faint' : '')
              }
            >
              <span className="w-10 shrink-0 font-mono text-kw-xs font-bold tabular-nums text-kw-meta">
                {a.heure ?? '—'}
              </span>
              <span
                className={
                  'h-2 w-2 shrink-0 rounded-full ' + (a.imminente ? 'bg-kw-green' : 'bg-kw-ghost')
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-kw-sm font-bold text-kw-ink">{a.titre}</span>
                {a.contexte && (
                  <span className="block truncate text-kw-xs text-kw-meta">{a.contexte}</span>
                )}
              </span>
              {a.imminente && a.minutesAvant != null && (
                <span className="shrink-0 rounded-kw-md bg-kw-green-tint px-2 py-0.5 text-kw-micro font-bold text-kw-green">
                  Dans {a.minutesAvant} min
                </span>
              )}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-kw-ghost" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
