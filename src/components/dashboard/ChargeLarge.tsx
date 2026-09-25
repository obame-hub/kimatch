import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { CaseJour, MOIS_COURTS } from '@/components/dashboard/MatriceCharge'
import { depuisIso } from '@/lib/data/tachesDuJour'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CHARGE À VENIR, SUR SIX MOIS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « reprends la même logique que sur l'autre vue d'ensemble, avec des cards
 * correspondant au jour, un remplissage et le nombre à l'intérieur. Adapte-le juste à cette
 * nouvelle largeur. »
 *
 * ══ LA CASE EST CELLE DE LA MATRICE, PAS UNE COPIE ══
 *
 * `CaseJour` vient de `MatriceCharge`. Ses quatre paliers de couleur, son trait de plafond, sa
 * jauge qui monte depuis le bas : tout cela a été réglé à l'écran le 11/09/2026, après un « trop
 * de couleurs, ça complexifie la lecture ». Deux jauges à accorder auraient fini par diverger.
 *
 * ══ CE QUI CHANGE, C'EST LA DISPOSITION ══
 *
 * La matrice des commerciaux range dix jours en deux lignes de cinq — une ligne, une semaine. Sur
 * cent quatre-vingts jours, ce pliage n'a plus de sens : il ferait dix-huit lignes. Ici les cases
 * défilent sur UNE ligne, groupées par mois, et c'est le mois qui porte l'étiquette. On cherche
 * « où ai-je de la place en janvier », pas « quelle semaine ».
 */

const LARGEUR_CASE = 46
const HAUTEUR_CASE = 62

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
  const total = cases.reduce((s, c) => s + c.taches, 0)

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
    piste.current?.scrollBy({ left: sens * LARGEUR_CASE * 7, behavior: 'smooth' })
  }

  /* Les jours groupés par mois : c'est le mois qui porte l'étiquette et la frontière. */
  const parMois = useMemo(() => {
    const groupes: { cle: string; libelle: string; jours: { jour: string; taches: number; rang: number }[] }[] = []
    cases.forEach((c, rang) => {
      const d = depuisIso(c.jour)
      const cle = `${d.getFullYear()}-${d.getMonth()}`
      const dernier = groupes[groupes.length - 1]
      const entree = { ...c, rang }
      if (dernier?.cle === cle) dernier.jours.push(entree)
      else groupes.push({ cle, libelle: MOIS_COURTS[d.getMonth()], jours: [entree] })
    })
    return groupes
  }, [cases])

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] bg-[#1B211D] px-4 pb-3 pt-3 shadow-[0_14px_34px_-22px_rgba(10,20,16,.8)]">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-km-name font-semibold text-white">Charge à venir</h3>
        <span className="text-km-label text-white/45">jusqu’à six mois · jours ouvrés</span>
        <span className="flex-1" />
        {/* LE RETOUR EST TOUJOURS VISIBLE quand un jour est choisi. Sans lui, la seule façon de
            revenir à la vue complète serait de retrouver la case exacte parmi cent quatre-vingts. */}
        {jourChoisi ? (
          <button
            type="button"
            onClick={() => onChoisirJour(null)}
            className="inline-flex items-center gap-1.5 rounded-km-pill bg-white/15 px-2.5 py-1 text-km-label font-semibold text-white transition-colors hover:bg-white/25"
          >
            {depuisIso(jourChoisi).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            <X className="h-3 w-3" strokeWidth={2.6} />
          </button>
        ) : (
          <span className="text-km-label text-white/60">
            {chargement ? '—' : <><strong className="font-bold text-white">{total}</strong> tâche{total > 1 ? 's' : ''} planifiée{total > 1 ? 's' : ''}</>}
          </span>
        )}
      </div>

      {chargement ? (
        <p className="flex items-center gap-2 py-6 text-km-body text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Lecture de la charge…
        </p>
      ) : cases.length === 0 ? (
        <p className="py-6 text-km-body text-white/50">Aucune tâche planifiée sur les six prochains mois.</p>
      ) : (
        <div className="relative mt-auto pt-2.5">
          <div
            ref={piste}
            onScroll={mesurer}
            className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar]:h-1.5"
          >
            {parMois.map((mois, iMois) => (
              <div key={mois.cle} className={cn('flex shrink-0 flex-col gap-1.5', iMois > 0 && 'border-l border-white/10 pl-3')}>
                <div className="flex gap-1.5" style={{ height: HAUTEUR_CASE }}>
                  {mois.jours.map((c) => (
                    <div key={c.jour} className="shrink-0" style={{ width: LARGEUR_CASE }}>
                      <CaseJour
                        jour={c.jour}
                        taches={c.taches}
                        /* L'ANIMATION EN CASCADE S'ARRÊTE À LA PREMIÈRE QUINZAINE. À 45 ms par case
                           et cent quatre-vingts cases, le rideau durerait huit secondes ; au-delà
                           de ce qui est visible au premier regard, tout monte ensemble. */
                        rang={Math.min(c.rang, 14)}
                        choisi={c.jour === jourChoisi}
                        onChoisir={() => onChoisirJour(c.jour === jourChoisi ? null : c.jour)}
                      />
                    </div>
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
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#1B211D] to-transparent" />
              <button
                type="button" onClick={() => glisser(-1)} aria-label="Voir les jours précédents"
                className="absolute left-0 top-[31px] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </>
          )}
          {reste.droite && (
            <>
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#1B211D] to-transparent" />
              <button
                type="button" onClick={() => glisser(1)} aria-label="Voir les jours suivants"
                className="absolute right-0 top-[31px] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
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
