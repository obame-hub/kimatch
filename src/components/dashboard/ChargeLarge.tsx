import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CHARGE À VENIR, SUR SIX MOIS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « les 5 cards à droite du montant doivent disparaître et être remplacées
 * par le composant "Charge à venir". Ce composant doit prendre toute la place et ainsi proposer
 * plus de jours que pour les commerciaux. Ce composant est slidable afin de visualiser les jours
 * futurs (limite à M+6). »
 *
 * ══ POURQUOI PAS `MatriceCharge` ══
 *
 * La matrice des commerciaux tient dans une colonne étroite, à hauteur imposée, sur dix jours
 * ouvrés. Ses proportions viennent de là : « réduis à 10 jours ouvrés », parce qu'à quinze les
 * vignettes tombaient à 65 px et qu'il fallait les déchiffrer.
 *
 * Ici la contrainte s'inverse — toute la largeur, cent quatre-vingts jours — et rien de ce qui
 * faisait la matrice ne s'y transpose. Un composant qui aurait servi les deux aurait porté deux
 * jeux de proportions et un drapeau pour choisir entre eux.
 *
 * ══ LE MOIS EST LE REPÈRE, PAS LE JOUR ══
 *
 * Sur six mois, une suite de cent quatre-vingts colonnes datées ne se lit pas. Les jours restent
 * les barres — c'est la charge réelle — mais ce sont les MOIS qui portent les étiquettes et les
 * séparateurs. On cherche « quand ai-je de la place en janvier », pas « combien le 14 ».
 */

const HAUTEUR_BARRE = 58

/** Au-delà, la journée est saturée — le même seuil que la matrice des commerciaux. */
const SATURATION = 70

export function ChargeLarge({ jours, chargement, jourChoisi, onChoisirJour }: {
  jours: { jour: string; taches: number }[] | undefined
  chargement: boolean
  /** Le jour sur lequel les tableaux du dessous sont arrêtés, `null` quand ils montrent tout. */
  jourChoisi: string | null
  onChoisirJour: (jour: string | null) => void
}) {
  const piste = useRef<HTMLDivElement>(null)
  const [reste, setReste] = useState({ gauche: false, droite: false })

  const cases = useMemo(() => jours ?? [], [jours])
  const max = useMemo(() => Math.max(SATURATION, ...cases.map((c) => c.taches)), [cases])

  /* Le voile n'apparaît que s'il y a vraiment quelque chose au-delà : promettre du contenu qui
     n'existe pas est pire que de ne rien promettre. */
  const mesurer = useCallback(() => {
    const el = piste.current
    if (!el) return
    setReste({
      gauche: el.scrollLeft > 4,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])

  useEffect(() => {
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => window.removeEventListener('resize', mesurer)
  }, [mesurer, cases])

  function glisser(sens: -1 | 1) {
    piste.current?.scrollBy({ left: sens * 360, behavior: 'smooth' })
  }

  /* Les jours groupés par mois : c'est le mois qui porte l'étiquette et la frontière. */
  const parMois = useMemo(() => {
    const groupes: { cle: string; libelle: string; jours: typeof cases }[] = []
    for (const c of cases) {
      const d = new Date(`${c.jour}T12:00:00`)
      const cle = `${d.getFullYear()}-${d.getMonth()}`
      const dernier = groupes[groupes.length - 1]
      if (dernier?.cle === cle) dernier.jours.push(c)
      else groupes.push({ cle, libelle: d.toLocaleDateString('fr-FR', { month: 'long' }), jours: [c] })
    }
    return groupes
  }, [cases])

  const total = cases.reduce((s, c) => s + c.taches, 0)

  return (
    <section className="relative flex flex-col overflow-hidden rounded-[20px] bg-[#1B211D] px-4 pb-4 pt-3 shadow-[0_14px_34px_-22px_rgba(10,20,16,.8)]">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-km-name font-semibold text-white">Charge à venir</h3>
        <span className="text-km-label text-white/45">jusqu’à six mois · jours ouvrés</span>
        <span className="flex-1" />
        {/* LE RETOUR EST TOUJOURS VISIBLE quand un jour est choisi. Sans lui, la seule façon de
            revenir à la vue complète serait de retrouver la barre exacte sur laquelle on a cliqué,
            parmi cent quatre-vingts. */}
        {jourChoisi ? (
          <button
            type="button"
            onClick={() => onChoisirJour(null)}
            className="inline-flex items-center gap-1.5 rounded-km-pill bg-white/15 px-2.5 py-1 text-km-label font-semibold text-white transition-colors hover:bg-white/25"
          >
            {new Date(`${jourChoisi}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            <X className="h-3 w-3" strokeWidth={2.6} />
          </button>
        ) : (
          <span className="text-km-label text-white/60">
            {chargement ? '—' : <><strong className="font-bold text-white">{total}</strong> tâche{total > 1 ? 's' : ''} planifiée{total > 1 ? 's' : ''}</>}
          </span>
        )}
      </div>

      {chargement ? (
        <p className="flex items-center gap-2 py-8 text-km-body text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Lecture de la charge…
        </p>
      ) : cases.length === 0 ? (
        <p className="py-8 text-km-body text-white/50">Aucune tâche planifiée sur les six prochains mois.</p>
      ) : (
        <div className="relative mt-3">
          <div
            ref={piste}
            onScroll={mesurer}
            className="flex items-end gap-4 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar]:h-1.5"
          >
            {parMois.map((mois, iMois) => (
              <div key={mois.cle} className={cn('flex shrink-0 flex-col gap-1.5', iMois > 0 && 'border-l border-white/10 pl-4')}>
                <div className="flex items-end gap-[3px]" style={{ height: HAUTEUR_BARRE }}>
                  {mois.jours.map((c) => (
                    <BarreJour
                      key={c.jour}
                      jour={c.jour}
                      taches={c.taches}
                      max={max}
                      choisi={c.jour === jourChoisi}
                      onChoisir={() => onChoisirJour(c.jour === jourChoisi ? null : c.jour)}
                    />
                  ))}
                </div>
                <span className="truncate text-km-micro font-bold uppercase tracking-[0.08em] text-white/40">
                  {mois.libelle}
                </span>
              </div>
            ))}
          </div>

          {reste.gauche && (
            <>
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#1B211D] to-transparent" />
              <button
                type="button" onClick={() => glisser(-1)} aria-label="Voir les jours précédents"
                className="absolute left-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </>
          )}
          {reste.droite && (
            <>
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#1B211D] to-transparent" />
              <button
                type="button" onClick={() => glisser(1)} aria-label="Voir les jours suivants"
                className="absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Un jour, une barre.
 *
 * LA HAUTEUR PORTE LA CHARGE, la couleur ne fait que signaler la saturation — même partage que la
 * matrice des commerciaux depuis qu'elle a abandonné le dégradé. Un jour vide garde un trait de
 * deux pixels : sans lui, une semaine creuse ressemblerait à une semaine absente.
 */
function BarreJour({ jour, taches, max, choisi, onChoisir }: {
  jour: string
  taches: number
  max: number
  choisi: boolean
  onChoisir: () => void
}) {
  const d = new Date(`${jour}T12:00:00`)
  const hauteur = taches === 0 ? 2 : Math.max(4, Math.round((taches / max) * HAUTEUR_BARRE))
  const sature = taches >= SATURATION

  /* UN JOUR VIDE N'EST PAS CLIQUABLE : arrêter les tableaux sur une journée sans tâche ne
     donnerait qu'un écran vide, et le chemin du retour serait à retrouver. */
  const cliquable = taches > 0

  return (
    <button
      type="button"
      disabled={!cliquable}
      onClick={onChoisir}
      aria-pressed={choisi}
      title={
        `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — ${taches} tâche${taches > 1 ? 's' : ''}`
        + (cliquable ? (choisi ? ' — cliquer pour revenir à tout' : ' — cliquer pour n’afficher que ce jour') : '')
      }
      /* La zone de clic monte sur toute la hauteur de la rangée : viser une barre de 4 px de haut
         serait impossible. La barre, elle, garde sa hauteur au bas de ce rectangle. */
      style={{ height: HAUTEUR_BARRE }}
      className={cn('group flex w-[7px] shrink-0 items-end', cliquable ? 'cursor-pointer' : 'cursor-default')}
    >
      <span
        style={{ height: hauteur }}
        className={cn(
          'w-full rounded-[2px] transition-all',
          taches === 0 ? 'bg-white/12' : sature ? 'bg-km-side-red' : 'bg-km-side-green',
          choisi && 'ring-2 ring-white ring-offset-1 ring-offset-[#1B211D]',
          cliquable && !choisi && 'group-hover:brightness-125',
        )}
      />
    </button>
  )
}
