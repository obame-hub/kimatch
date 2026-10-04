import { useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChiffrage } from '@/lib/data/chiffrage'
import { useContexteOffre, useRessourcesOffre } from '@/lib/data/offrePdf'
import { construireOffrePdf, raisonIndisponible, ttcParDefaut } from '@/lib/offrePdf/construction'
import { htmlOffre } from '@/lib/offrePdf/document'
import { htmlBloc, type BlocOffre } from '@/lib/offrePdf/blocs'
import { ApercuBloc } from '@/components/recommandation/proposition/ApercuBloc'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA VERSION PUBLIÉE — trois onglets, les tableaux mêmes de la proposition
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « dès que l'offre est publiée, alors la version est "Disponible" et
 * l'intérieur de la version change. » Trois onglets :
 *   · Comparatif — le tableau de la page 1 du PDF, « exactement pareil » ;
 *   · Détail     — le tableau des prix unitaires de la page 2 ;
 *   · Clauses    — le tableau des clauses contractuelles de la page 2.
 *
 * Ce sont les tableaux du PDF eux-mêmes (voir `offrePdf/blocs.ts`), en lecture seule : la marge se
 * retouche dans « Générer l'offre », où elle ne s'enregistre qu'à la génération.
 *
 * HTVA OU TTC se choisit ici aussi, par défaut selon le compte relié (TTC pour un syndic) ; le choix
 * suit dans le formulaire de génération.
 */

const ONGLETS: [BlocOffre, string][] = [['comparatif', 'Comparatif'], ['prix', 'Détail'], ['clauses', 'Clauses']]

export function ComparatifPublie({ versionId, peutGenerer, onGenerer }: {
  versionId: string
  peutGenerer: boolean
  /** Ouvre le formulaire de génération à la place du bloc, avec la présentation choisie ici. */
  onGenerer: (ttc: boolean) => void
}) {
  const { data: chiffrage, isLoading } = useChiffrage(versionId)
  const contexte = useContexteOffre(chiffrage)
  const ressources = useRessourcesOffre()
  const [onglet, setOnglet] = useState<BlocOffre>('comparatif')
  const [ttcChoisi, setTtc] = useState<boolean | null>(null)
  const ttc = ttcChoisi ?? ttcParDefaut(contexte.data?.clientSegment)
  const raison = chiffrage ? raisonIndisponible(chiffrage) : null

  const complet = useMemo(() => {
    if (!chiffrage || raison || !contexte.data || !ressources.data) return null
    return htmlOffre(construireOffrePdf(chiffrage, contexte.data, { validite: new Date().toISOString(), ttc }), ressources.data)
  }, [chiffrage, raison, contexte.data, ressources.data, ttc])
  const bloc = useMemo(() => (complet ? htmlBloc(complet, onglet) : null), [complet, onglet])

  if (isLoading || !chiffrage) return <p className="px-[17px] py-4 text-km-body text-km-faint">Chargement du comparatif…</p>

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-km-line-soft px-[17px] py-2.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-extrabold leading-[19px]">Comparatif publié par le pricing</span>
          <span className="text-[11px] leading-[15px] text-km-faint">
            Le {chiffrage.version.publieeLe ? new Date(chiffrage.version.publieeLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </span>
        </span>
        {!raison && (
          <div role="radiogroup" aria-label="Présentation des budgets" className="flex gap-[2px] rounded-[9px] border border-km-line bg-km-soft p-[3px]">
            {([[false, 'HTVA'], [true, 'TTC']] as const).map(([v, libelle]) => (
              <button
                key={libelle}
                type="button"
                role="radio"
                aria-checked={ttc === v}
                onClick={() => setTtc(v)}
                className={cn('rounded-[6px] px-2.5 py-[3px] text-[12px] transition-colors', ttc === v ? 'bg-km-green font-bold text-white' : 'font-medium text-km-muted hover:bg-white hover:text-km-text')}
              >
                {libelle}
              </button>
            ))}
          </div>
        )}
        {peutGenerer && !raison && (
          <button
            type="button"
            onClick={() => onGenerer(ttc)}
            className="inline-flex h-[32px] items-center gap-1.5 rounded-km bg-km-green px-3.5 text-km-body font-bold text-white transition hover:brightness-110"
          >
            <Sparkles className="h-3.5 w-3.5" /> Générer l’offre
          </button>
        )}
      </div>

      {raison ? (
        <p className="px-[17px] py-4 text-km-body text-km-muted">{raison}</p>
      ) : (
        <>
          <div role="tablist" className="flex gap-0.5 border-b border-km-line px-[17px]">
            {ONGLETS.map(([id, nom]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={onglet === id}
                onClick={() => setOnglet(id)}
                className={cn('-mb-px border-b-[2.5px] px-3.5 py-2.5 text-[14px] font-semibold leading-5', onglet === id ? 'border-km-green text-km-text' : 'border-transparent text-km-muted hover:text-km-text')}
              >
                {nom}
              </button>
            ))}
          </div>
          <div className="px-[17px] pb-4 pt-3">
            {contexte.error ? (
              <p className="text-km-body text-km-red">{(contexte.error as Error).message}</p>
            ) : bloc ? (
              <ApercuBloc key={`${onglet}-${ttc}`} html={bloc} titre={ONGLETS.find(([id]) => id === onglet)?.[1] ?? ''} />
            ) : (
              <p className="flex items-center gap-2 py-6 text-km-body text-km-faint"><Loader2 className="h-4 w-4 animate-spin" /> Préparation des tableaux…</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
