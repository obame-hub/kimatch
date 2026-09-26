import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, CheckCheck, LifeBuoy, X, type LucideIcon } from 'lucide-react'
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

/**
 * ══ LE BANDEAU DE TYPE ══
 *
 * William, 26/09/2026 : « Tu as mon go pour le style B. » Fabien ne reçoit que deux sortes de
 * notification, et le volet les distingue avant toute lecture — une bande de couleur sur le bord
 * gauche, puis une étiquette qui NOMME le type.
 *
 * LE TITRE EST LE SUJET, PAS LE TYPE. « Contrat à revérifier — CT-01626 » mettait en gras ce que
 * l'étiquette dit déjà, et reléguait le seul mot qu'on cherche du regard — le compte — dans la
 * phrase du dessous. Ici le gras porte PLISSON IMMOBILIER, et la référence descend dans un jeton à
 * chasse fixe, qu'on parcourt sans le lire.
 *
 * ── CE QUI ARRIVE AUX AUTRES ──
 *
 * Une notification sans dessin propre — les treize déjà en base, les factures déposées — garde
 * l'affichage d'avant, titre et message, dans la même structure à bande. Rien ne disparaît en
 * attendant qu'on lui donne un dessin.
 */
const TYPES: Record<string, { libelle: string; Icone: LucideIcon; bande: string; etiquette: string }> = {
  validation_contrat: {
    libelle: 'Contrat validé',
    Icone: Check,
    bande: 'bg-km-green',
    etiquette: 'bg-km-green-soft text-km-green',
  },
  nouvelle_requete: {
    libelle: 'Nouvelle requête',
    Icone: LifeBuoy,
    bande: 'bg-km-blue',
    etiquette: 'bg-km-blue-soft text-km-blue',
  },
}

/**
 * La teinte de la pastille, écrite à la source plutôt que devinée ici.
 *
 * LE GAZ EST BLEU ET L'ÉLECTRICITÉ AMBRE dans tout Kimatch — c'est contre-intuitif la première
 * fois, mais c'est la convention de l'application, et une notification qui en prendrait une autre
 * ferait douter du reste.
 */
const TEINTES: Record<string, string> = {
  gaz: 'bg-km-gaz-soft text-km-gaz',
  elec: 'bg-km-elec-soft text-km-elec',
  alerte: 'bg-km-red-soft text-km-red',
  neutre: 'bg-km-soft text-km-muted',
}

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
                const lu = !!n.lu_le
                const type = TYPES[n.categorie]

                /* LA BANDE S'ÉTEINT UNE FOIS LUE, elle ne disparaît pas : c'est le seul repère de
                   type qui reste quand la couleur se retire du reste. */
                const contenu = (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn('w-[3px] flex-none', lu || !type ? 'bg-km-line' : type.bande)}
                    />
                    <span className="min-w-0 flex-1 px-3.5 py-2.5">
                      <Corps n={n} />
                    </span>
                  </>
                )

                return (
                  <li key={n.id} className="border-b border-km-line last:border-b-0">
                    {n.lien ? (
                      <Link
                        to={n.lien}
                        onClick={() => ouvrir(n)}
                        className="flex transition-colors hover:bg-km-bg/60"
                      >
                        {contenu}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => ouvrir(n)}
                        className="flex w-full text-left transition-colors hover:bg-km-bg/60"
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

/**
 * Le corps d'une ligne.
 *
 * TOUT EST EN `span` : ce bloc vit aussi bien dans un `<a>` que dans un `<button>`, et un bouton
 * n'accepte que du contenu de phrase. Un `<p>` là-dedans est du HTML invalide, que le navigateur
 * répare en sortant le paragraphe du bouton — la mise en page saute sans prévenir.
 */
function Corps({ n }: { n: Notification }) {
  const lu = !!n.lu_le
  const type = TYPES[n.categorie]
  const d = n.donnees

  /* SANS DESSIN PROPRE OU SANS DONNÉES, on retombe sur le titre et le message. C'est le cas des
     treize notifications écrites avant le 26/09 et des factures déposées. */
  if (!type || !d?.sujet) {
    return (
      <>
        <span className="flex items-baseline gap-2">
          <span className={cn('flex-1 text-km-body leading-snug', lu ? 'text-km-muted' : 'font-bold text-km-text')}>
            {n.titre}
          </span>
          <span className="shrink-0 font-mono text-km-xs text-km-faint">{quand(n.date_creation)}</span>
        </span>
        {n.message && (
          <span className="mt-0.5 block text-km-label leading-snug text-km-muted">{n.message}</span>
        )}
      </>
    )
  }

  const { Icone } = type
  return (
    <>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex min-w-0 items-center gap-1 rounded-km-pill px-2 py-[2px] text-km-xs font-extrabold uppercase tracking-wide',
            lu ? 'bg-km-soft text-km-faint' : type.etiquette,
          )}
        >
          <Icone className="h-2.5 w-2.5 flex-none" strokeWidth={2.8} />
          <span className="truncate">{type.libelle}</span>
        </span>
        <span className="flex-1" />
        <span className="shrink-0 font-mono text-km-xs text-km-faint">{quand(n.date_creation)}</span>
      </span>

      {/* DEUX LIGNES AU PLUS POUR LE SUJET : « Syndicat des copropriétaires du 10 rue Coquelin »
          ne tient pas sur la largeur du volet, et le couper à un mot le rendrait méconnaissable. */}
      <span
        className={cn(
          'mt-1.5 line-clamp-2 text-km-name font-bold leading-snug tracking-tight',
          lu ? 'font-semibold text-km-muted' : 'text-km-text',
        )}
      >
        {d.sujet}
      </span>

      {(d.reference || d.jeton || d.precision) && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {d.reference && (
            <span className="rounded-km-sm border border-km-line px-1.5 py-px font-mono text-km-label text-km-muted">
              {d.reference}
            </span>
          )}
          {d.jeton && (
            <span
              className={cn(
                'rounded-km-pill px-2 py-px text-km-label font-bold',
                lu ? 'bg-km-soft text-km-faint' : (TEINTES[d.ton ?? 'neutre'] ?? TEINTES.neutre),
              )}
            >
              {d.jeton}
            </span>
          )}
          {d.precision && <span className="truncate text-km-label text-km-muted">{d.precision}</span>}
        </span>
      )}

      {d.sous_titre && (
        <span className="mt-1 block truncate text-km-label text-km-muted">{d.sous_titre}</span>
      )}
    </>
  )
}
