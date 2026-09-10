import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCheck, X } from 'lucide-react'
import { useMarquerLue, useNotifications, type Notification } from '@/lib/data/notifications'
import { cn } from '@/lib/utils'

/**
 * ══ LE VOLET DES NOTIFICATIONS, À DROITE ══
 *
 * Naoëlle, 10/09/2026 : « quand je clique dessus ça ouvre un volet à droite avec toutes les
 * notifs ». C'était une boîte flottante posée au-dessus de la barre latérale, en bas à gauche —
 * elle recouvrait la fiche qu'on était en train de lire, à l'endroit précis où l'on venait de
 * cliquer. Un volet à droite se range du côté opposé au geste, laisse la fiche lisible, et prend
 * la même place que le volet Allo : deux tiroirs, un seul bord.
 *
 *
 * Naoëlle, 09/09/2026 : « ce serait bien d'avoir des notifs sur l'app direct, pour les principaux
 * concernés de l'action ».
 *
 * ── ELLE NE SE MARQUE PAS LUE À L'OUVERTURE ──
 *
 * C'est le choix inverse de la fenêtre Nouveautés, et pour une raison de fond : une nouveauté est
 * une annonce, on l'a lue dès qu'on l'a vue passer. Une notification est un RELAIS — « le contrat
 * est validé, revérifie-le » — et l'avoir vue n'est pas l'avoir traitée.
 *
 * Tout éteindre à l'ouverture ferait disparaître une demande de revérification parce que quelqu'un
 * a cliqué la cloche en cherchant autre chose. On marque donc lue CELLE QU'ON OUVRE, et un bouton
 * « tout marquer comme lu » reste là pour vider délibérément.
 *
 * ── SAUF SI ON N'A RIEN À TRAITER ──
 *
 * Une boîte entièrement lue n'a pas de pastille : dans ce cas l'ouverture ne change rien, et le
 * comportement ci-dessus ne se remarque pas.
 */

function quand(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.round(heures / 24)
  if (jours < 7) return `il y a ${jours} j`
  return d.toLocaleDateString('fr-FR')
}

export function PanneauNotifications({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const { data: notifications, isLoading } = useNotifications()
  const marquerLue = useMarquerLue()
  const liste = notifications ?? []
  const nonLues = liste.filter((n) => !n.lu_le)

  // Échap ferme, comme partout ailleurs dans l'application.
  useEffect(() => {
    if (!ouvert) return
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [ouvert, onFermer])

  if (!ouvert) return null

  const ouvrir = (n: Notification) => {
    if (!n.lu_le) marquerLue.mutate([n.id])
    onFermer()
  }

  return (
    <>
      {/* Le voile ferme au clic à côté. `z` sous le panneau, au-dessus du reste. */}
      <div className="fixed inset-0 z-[66] bg-ink-950/10" onClick={onFermer} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="Notifications"
        className="fixed bottom-0 right-0 top-0 z-[67] flex w-[min(24rem,100vw)] flex-col border-l border-km-line bg-white shadow-km-pop animate-km-slide-in-r"
      >
        <div className="flex items-center gap-2 border-b border-km-line px-3.5 py-2.5">
          <p className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Notifications</p>
          {nonLues.length > 0 && (
            <span className="font-mono text-km-xs text-km-muted">{nonLues.length} à traiter</span>
          )}
          <span className="flex-1" />
          {nonLues.length > 0 && (
            <button
              type="button"
              onClick={() => marquerLue.mutate(nonLues.map((n) => n.id))}
              className="flex items-center gap-1 text-km-xs font-semibold text-km-green hover:underline"
            >
              <CheckCheck className="h-3 w-3" />
              tout marquer comme lu
            </button>
          )}
          {/* UN VOLET SE FERME PAR UNE CROIX. La boîte flottante se fermait au clic à côté, ce qui
              se devine quand elle flotte au milieu ; collée au bord de l'écran, plus personne ne
              l'essaie. Le voile continue de fermer, la croix le dit. */}
          <button
            type="button"
            onClick={onFermer}
            title="Fermer"
            aria-label="Fermer les notifications"
            className="-mr-1 flex h-7 w-7 items-center justify-center rounded-km-sm text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="px-3.5 py-6 text-center text-km-label text-km-faint">Chargement…</p>
          ) : liste.length === 0 ? (
            /* LE VIDE DIT CE QU'IL SIGNIFIE. « Aucune notification » laisserait croire à une panne ;
               on dit plutôt à quoi cette boîte sert, pour qu'on sache quoi en attendre. */
            <div className="px-3.5 py-6 text-center">
              <p className="text-km-body font-semibold text-km-text">Rien à traiter</p>
              <p className="mt-1 text-km-label leading-snug text-km-muted">
                Vous serez prévenu ici quand quelque chose vous attend — un contrat validé à
                revérifier, par exemple.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {liste.map((n) => {
                const contenu = (
                  <>
                    <div className="flex items-start gap-2">
                      {/* La pastille tient lieu de gras : elle dit « pas encore traité » sans
                          alourdir le texte, et laisse le titre lisible une fois lu. */}
                      <span
                        className={cn(
                          'mt-[6px] h-[7px] w-[7px] flex-none rounded-full',
                          n.lu_le ? 'bg-transparent' : 'bg-km-green',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-km-body leading-snug',
                            n.lu_le ? 'text-km-muted' : 'font-bold text-km-text',
                          )}
                        >
                          {n.titre}
                        </p>
                        {n.message && (
                          <p className="mt-0.5 text-km-label leading-snug text-km-muted">{n.message}</p>
                        )}
                        <p className="mt-1 font-mono text-km-xs text-km-faint">{quand(n.date_creation)}</p>
                      </div>
                    </div>
                  </>
                )

                return (
                  <li key={n.id} className="border-b border-km-line last:border-b-0">
                    {n.lien ? (
                      <Link
                        to={n.lien}
                        onClick={() => ouvrir(n)}
                        className="block px-3.5 py-2.5 transition-colors hover:bg-km-bg/60"
                      >
                        {contenu}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => ouvrir(n)}
                        className="block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-km-bg/60"
                      >
                        {contenu}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
