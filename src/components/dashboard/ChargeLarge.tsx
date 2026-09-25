import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { CaseJour, MOIS_COURTS } from '@/components/dashboard/MatriceCharge'
import { depuisIso, PLAFOND_JOURNALIER } from '@/lib/data/tachesDuJour'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CHARGE À VENIR, SUR SIX MOIS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « utilise la hauteur des cards, les contenus doivent utiliser toute la
 * largeur et hauteur mise à disposition, inspire-toi de l'autre composant ».
 *
 * ══ CE QUE J'AVAIS FAIT DE TRAVERS ══
 *
 * Une rangée de cases à hauteur FIXE — 62 px — dans une tuile qui en offrait 186. Résultat : des
 * cases écrasées en haut d'un grand vide, et des nombres qui débordaient de leur case. La matrice
 * des commerciaux ne calcule aucune hauteur : ses deux lignes se partagent la place par `flex-1`,
 * ses cinq colonnes la largeur par la grille. C'est ce qui la fait tenir dans n'importe quelle
 * tuile — et c'était la réponse ici aussi.
 *
 * ══ DES PAGES, PAS UN DÉFILEMENT ══
 *
 * Reste à loger cent quatre-vingts jours. Un défilement horizontal imposait des cases de largeur
 * fixe, donc de revenir à des cases calculées à la main. On pagine : VINGT JOURS à la fois, deux
 * lignes de dix, et les flèches avancent d'un mois de travail. Chaque page remplit toute la place,
 * comme la matrice d'à côté.
 *
 * L'ordre reste celui de la lecture — dix jours en haut, dix en dessous — alors qu'un défilement
 * colonne par colonne aurait fait zigzaguer l'œil entre deux rangées.
 */

const COLONNES = 10
const LIGNES = 2
const PAR_PAGE = COLONNES * LIGNES

export function ChargeLarge({ jours, chargement, jourChoisi, onChoisirJour }: {
  jours: { jour: string; taches: number }[] | undefined
  chargement: boolean
  /** Le jour sur lequel les tableaux du dessous sont arrêtés, `null` quand ils montrent tout. */
  jourChoisi: string | null
  onChoisirJour: (jour: string | null) => void
}) {
  const cases = useMemo(() => jours ?? [], [jours])
  const [page, setPage] = useState(0)

  const pages = Math.max(1, Math.ceil(cases.length / PAR_PAGE))
  const pageSure = Math.min(page, pages - 1)
  const debut = pageSure * PAR_PAGE
  const visibles = cases.slice(debut, debut + PAR_PAGE)

  /* L'intervalle couvert par la page : c'est lui qui dit où l'on est dans les six mois, mieux
     qu'un numéro de page qui ne renvoie à rien. */
  const intervalle = useMemo(() => {
    if (visibles.length === 0) return ''
    const a = depuisIso(visibles[0].jour)
    const b = depuisIso(visibles[visibles.length - 1].jour)
    const mois = (d: Date) => MOIS_COURTS[d.getMonth()]
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${mois(b)}`
      : `${a.getDate()} ${mois(a)} – ${b.getDate()} ${mois(b)}`
  }, [visibles])

  const total = cases.reduce((s, c) => s + c.taches, 0)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] bg-[#1B211D] px-3.5 pb-3.5 pt-3 shadow-[0_14px_34px_-22px_rgba(10,20,16,.8)]">
      <div className="flex shrink-0 items-baseline gap-2.5">
        <h3 className="truncate text-km-name font-semibold text-white">Charge à venir</h3>
        <span className="truncate text-km-label text-white/45">{intervalle}</span>
        <span className="flex-1" />

        {/* LE JOUR CHOISI PREND LA PLACE DU TOTAL : c'est lui qui compte à ce moment-là, et la
            croix est le seul chemin de retour vers la vue complète. */}
        {jourChoisi ? (
          <button
            type="button"
            onClick={() => onChoisirJour(null)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-km-pill bg-white/15 px-2.5 py-0.5 text-km-label font-semibold text-white transition-colors hover:bg-white/25"
          >
            {depuisIso(jourChoisi).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
            <X className="h-3 w-3" strokeWidth={2.6} />
          </button>
        ) : (
          <span className="shrink-0 text-km-label text-white/45">
            {chargement ? '—' : `${total} tâches · obj. ${PLAFOND_JOURNALIER}/j`}
          </span>
        )}

        <span className="ml-1 flex shrink-0 items-center gap-1">
          <BoutonPage sens="precedent" disponible={pageSure > 0} onClick={() => setPage(pageSure - 1)} />
          <BoutonPage sens="suivant" disponible={pageSure < pages - 1} onClick={() => setPage(pageSure + 1)} />
        </span>
      </div>

      {/* LES DEUX LIGNES SE PARTAGENT LA HAUTEUR RESTANTE PAR `flex-1`, et les dix colonnes la
          largeur par la grille. Aucune hauteur de case n'est calculée à la main : la tuile peut
          grandir ou rétrécir, les cases suivent. C'est la règle de la matrice voisine. */}
      <div className="mt-2.5 grid min-h-0 flex-1 gap-2" style={{ gridTemplateRows: `repeat(${LIGNES}, minmax(0, 1fr))` }}>
        {Array.from({ length: LIGNES }, (_, ligne) => (
          <div key={ligne} className="grid min-h-0 gap-2" style={{ gridTemplateColumns: `repeat(${COLONNES}, minmax(0, 1fr))` }}>
            {Array.from({ length: COLONNES }, (_, colonne) => {
              const i = ligne * COLONNES + colonne
              const c = visibles[i]
              if (chargement) return <div key={i} className="animate-pulse rounded-[10px] bg-white/5" />
              /* Une case sans jour reste VIDE et sans fond : dessiner une case grise pour une
                 journée qui n'existe pas ferait croire à un jour sans tâche. */
              if (!c) return <div key={i} />
              return (
                <CaseJour
                  key={c.jour}
                  jour={c.jour}
                  taches={c.taches}
                  rang={i}
                  choisi={c.jour === jourChoisi}
                  onChoisir={() => onChoisirJour(c.jour === jourChoisi ? null : c.jour)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function BoutonPage({ sens, disponible, onClick }: {
  sens: 'precedent' | 'suivant'
  disponible: boolean
  onClick: () => void
}) {
  const Icone = sens === 'precedent' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      disabled={!disponible}
      onClick={onClick}
      aria-label={sens === 'precedent' ? 'Vingt jours plus tôt' : 'Vingt jours plus tard'}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
        disponible ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'cursor-default bg-white/5 text-white/20',
      )}
    >
      <Icone className="h-3.5 w-3.5" strokeWidth={2.4} />
    </button>
  )
}
