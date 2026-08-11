import { useNavigate } from 'react-router-dom'
import { Activity, Building2, FileText, ShieldCheck, Sparkle, TrendingDown, TrendingUp } from 'lucide-react'
import { useFilPortefeuille, grouperParJour, type EvenementFil } from '@/lib/data/filPortefeuille'

/** Icône et teinte par famille d'objet, reprises de la maquette (constante IC). */
const FAMILLES = {
  mandat: { icone: ShieldCheck, couleur: '#9a7a0d', fond: '#faf0cd' },
  contrat: { icone: FileText, couleur: '#2f7d8c', fond: '#e4f1f3' },
  opportunite: { icone: Sparkle, couleur: '#8a4b2a', fond: '#f7ece3' },
  compte: { icone: Building2, couleur: '#3b5f8a', fond: '#e9eff6' },
} as const

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function Evenement({ evenement, dernier }: { evenement: EvenementFil; dernier: boolean }) {
  const navigate = useNavigate()
  const famille = FAMILLES[evenement.categorie]
  const Icone = famille.icone
  const Tendance = evenement.ton === 'favorable' ? TrendingUp : TrendingDown

  return (
    <div
      onClick={() => evenement.to && navigate(evenement.to)}
      className={`flex gap-2.5 px-3 py-2.5 transition-colors ${evenement.to ? 'cursor-pointer hover:bg-navy-50/60' : ''}`}
    >
      {/* Colonne d'icône avec le rail vertical qui relie les événements d'une même journée. */}
      <span className="flex flex-none flex-col items-center self-stretch">
        <span
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg"
          style={{ background: famille.fond, color: famille.couleur }}
        >
          <Icone className="h-3.5 w-3.5" />
        </span>
        {!dernier && <span className="mt-1 w-px flex-1 bg-navy-100" />}
      </span>

      <div className="min-w-0 flex-1 pb-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-semibold tracking-[-.01em] text-navy-800">
            {evenement.entite}
          </span>
          <span className="flex-1" />
          <span className="flex-none font-mono text-[9.5px] text-navy-300">{heure(evenement.quand)}</span>
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          {evenement.ton !== 'neutre' && (
            <Tendance
              className={`h-3 w-3 shrink-0 ${evenement.ton === 'favorable' ? 'text-kiwi-600' : 'text-amber-600'}`}
            />
          )}
          <span
            className={`text-[11px] leading-[1.45] ${
              evenement.ton === 'favorable'
                ? 'text-kiwi-700'
                : evenement.ton === 'vigilance'
                  ? 'text-amber-700'
                  : 'text-navy-500'
            }`}
          >
            {evenement.libelle}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Colonne de droite du tableau de bord : ce qui a bougé sur le portefeuille sans être urgent.
 * Cahier des charges de William (11/08/2026) — voir `lib/data/filPortefeuille.ts` pour la liste
 * des évolutions retenues et pourquoi les autres sont écartées.
 */
export function FilPortefeuille() {
  const { data, isLoading } = useFilPortefeuille()
  const evenements = data ?? []
  const journees = grouperParJour(evenements)

  return (
    <div className="flex max-h-[calc(100vh-132px)] flex-col overflow-hidden rounded-[15px] border border-navy-100 bg-white xl:sticky xl:top-4">
      <div className="flex-none border-b border-navy-50 px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <span className="animate-kw-live-pulse h-1.5 w-1.5 flex-none rounded-full bg-kiwi-600" />
          <span className="text-[10px] font-extrabold uppercase tracking-[.09em] text-navy-600">
            Fil du portefeuille
          </span>
          <div className="flex-1" />
          <span className="text-[10px] text-navy-300">
            {evenements.length} évolution{evenements.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] leading-[1.45] text-navy-400">Ce qui a bougé sans être urgent.</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2.5">
        {isLoading && <p className="px-4 py-6 text-center text-xs text-navy-400">Chargement…</p>}

        {!isLoading && evenements.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-9 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-navy-50 text-navy-300">
              <Activity className="h-4 w-4" />
            </span>
            <span className="text-xs leading-[1.5] text-navy-400">
              Aucune évolution récente
              <br />
              sur votre portefeuille.
            </span>
          </div>
        )}

        {journees.map((journee) => (
          <div key={journee.jour}>
            <div className="sticky top-0 z-[2] flex items-center gap-2.5 bg-gradient-to-b from-white via-white to-transparent px-3 pb-2 pt-2.5">
              <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[.07em] text-navy-500">
                {journee.libelle}
              </span>
              <span className="h-px flex-1 bg-navy-50" />
              <span className="font-mono text-[10px] text-navy-300">{journee.items.length}</span>
            </div>
            {journee.items.map((evenement, i) => (
              <Evenement
                key={evenement.id}
                evenement={evenement}
                dernier={i === journee.items.length - 1}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
