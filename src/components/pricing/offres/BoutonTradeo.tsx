import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Chiffrage } from '@/lib/data/chiffrage'
import type { Lectures } from '@/lib/data/lectureOffre'
import {
  chargerEtatTradeo, demanderHomologation, fournisseursTradeo, recupererPropositionsTradeo, relancerTradeo,
  type EtapeTradeo, type EtatTradeoVersion,
} from '@/lib/tradeo/pricer'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE BOUTON « TRADEO » DU PRICER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Réunion du 05/10/2026 : « le jour où on est censé recevoir l'offre, dans le tableau, il y aura un
 * bouton récupérer les prix Tradeo […] et ce bouton pourrait tout à fait être grisé si je n'ai pas
 * reçu l'homologation ». Il n'apparaît que si la commande compte un fournisseur qui répond par
 * Tradeo. Son menu dit où en est l'homologation et propose LE geste utile : la demander, relancer,
 * ou récupérer les prix — qui s'ouvrent dans le volet des propositions lues, à inclure ligne à ligne.
 */

const PASTILLE: Record<Exclude<EtapeTradeo, 'HORS_TRADEO'>, { texte: string; ton: string }> = {
  SANS_MANDAT: { texte: 'sans mandat Energix', ton: 'border-km-line bg-km-soft text-km-muted' },
  A_DEMANDER: { texte: 'homologation à demander', ton: 'border-km-amber/40 bg-km-amber-soft text-[#8a4b2a]' },
  DEMANDEE: { texte: 'homologation en attente', ton: 'border-km-amber/40 bg-km-amber-soft text-[#8a4b2a]' },
  HOMOLOGUE: { texte: 'homologué', ton: 'border-km-green-line bg-km-green-soft text-km-green' },
}

const ETAT_COMPTEUR = { NON_ENVOYE: 'pas encore envoyé', EN_ATTENTE: 'en attente de Tradeo', ACCEPTE: 'accepté', REFUSE: 'refusé par Tradeo' } as const

export function BoutonTradeo({ chiffrage, lectures, onToast }: { chiffrage: Chiffrage; lectures: Lectures; onToast: (m: string) => void }) {
  const avecTradeo = fournisseursTradeo(chiffrage.commande).length > 0
  const qc = useQueryClient()
  const cle = ['tradeo-pricer', chiffrage.version.id]
  const { data: etat, isFetching, error, refetch } = useQuery({
    queryKey: cle,
    enabled: avecTradeo,
    staleTime: 60_000,
    queryFn: () => chargerEtatTradeo(chiffrage),
  })
  const [ouvert, setOuvert] = useState(false)
  const [action, setAction] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [ouvert])
  if (!avecTradeo) return null

  const faire = async (geste: () => Promise<string>) => {
    setAction(true)
    try {
      onToast(await geste())
      await qc.invalidateQueries({ queryKey: cle })
    } catch (e) {
      onToast(`Erreur : ${(e as Error).message}`)
    } finally {
      setAction(false)
    }
  }
  const recuperer = (e: EtatTradeoVersion) => {
    lectures.suivrePlusieurs('Tradeo', () => recupererPropositionsTradeo(chiffrage, e))
    setOuvert(false)
  }

  const etape = etat?.etape ?? null
  const pastille = etape && etape !== 'HORS_TRADEO' ? PASTILLE[etape] : null
  const bouton = 'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-km text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:border disabled:border-km-line disabled:bg-km-soft disabled:text-km-faint'
  return (
    <span ref={ref} className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        title="Homologation et prix Tradeo"
        className="inline-flex h-7 items-center gap-1.5 rounded-km-sm border border-km-violet/30 bg-km-violet/10 px-2.5 text-[11.5px] font-bold text-km-violet hover:bg-km-violet/15"
      >
        {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Tradeo
        {pastille && <span className={cn('hidden rounded-full border px-1.5 text-[10px] leading-[15px] lg:inline', pastille.ton)}>{pastille.texte}</span>}
      </button>
      {ouvert && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-[340px] flex-col gap-2.5 rounded-[13px] border border-km-line bg-white p-3 shadow-km-pop">
          <span className="text-[9.5px] font-extrabold uppercase tracking-[.1em] text-km-faint">
            Tradeo · {etat?.fournisseurs.map((f) => f.nom).join(', ') ?? fournisseursTradeo(chiffrage.commande).map((f) => f.nom).join(', ')}
          </span>
          {error && <p className="text-[12px] text-km-red">{(error as Error).message}</p>}
          {!etat && !error && <p className="flex items-center gap-2 text-[12px] text-km-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> On regarde où en est Tradeo…</p>}
          {etat && <Detail etat={etat} />}

          {etat?.etape === 'A_DEMANDER' && (
            <button type="button" disabled={action || etat.manques.length > 0} onClick={() => void faire(() => demanderHomologation(chiffrage, etat))} className={cn(bouton, 'bg-km-green text-white hover:bg-[#0a6650]')}>
              {action ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Demander l’homologation
            </button>
          )}
          {etat?.etape === 'DEMANDEE' && (
            <button type="button" disabled={action} onClick={() => void faire(async () => (await relancerTradeo(etat.siret)).message)} className={cn(bouton, 'border border-km-line bg-white text-km-text hover:bg-km-soft')}>
              {action ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Relancer l’équipe Tradeo
            </button>
          )}
          {etat && etat.etape !== 'SANS_MANDAT' && etat.sansPrixAutomatiques.length < etat.fournisseurs.length && (
            <button
              type="button"
              disabled={etat.etape !== 'HOMOLOGUE' || action}
              title={etat.etape !== 'HOMOLOGUE' ? 'Disponible quand Tradeo a accepté les compteurs' : undefined}
              onClick={() => recuperer(etat)}
              className={cn(bouton, 'bg-km-violet text-white hover:opacity-90')}
            >
              <Download className="h-3.5 w-3.5" /> Récupérer les prix Tradeo
            </button>
          )}
          <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-km-muted hover:text-km-text">
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} /> Actualiser
          </button>
        </div>
      )}
    </span>
  )
}

function Detail({ etat }: { etat: EtatTradeoVersion }) {
  const texte: Record<EtapeTradeo, string> = {
    HORS_TRADEO: '',
    SANS_MANDAT: 'Aucun compteur de la version n’a de mandat Energix actif. Tradeo n’accepte que son propre mandat : faites signer le mandat Energix au client.',
    A_DEMANDER: 'Les compteurs couverts n’ont jamais été envoyés à Tradeo. La première demande passe par l’homologation ; ensuite, tant que le mandat est actif, plus besoin.',
    DEMANDEE: `Demande ${etat.demandeNumero ? `n° ${etat.demandeNumero} ` : ''}envoyée : l’équipe Tradeo doit accepter les compteurs. Les prix se récupèrent ensuite d’un clic.`,
    HOMOLOGUE: 'Tradeo a accepté les compteurs. Récupérez les prix le jour de l’offre : ce sont des prix immédiats.',
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] leading-[17px] text-km-text">{texte[etat.etape]}</p>
      {etat.couverts.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded-[9px] bg-km-soft px-2.5 py-1.5">
          {etat.couverts.map((c) => (
            <li key={c.vcId} className="flex items-baseline justify-between gap-2 text-[11.5px]">
              <span className="font-mono font-semibold text-km-text">{c.numero}</span>
              <span className={cn('text-right', c.etat === 'ACCEPTE' ? 'text-km-green' : c.etat === 'REFUSE' ? 'text-km-red' : 'text-km-muted')}>
                {ETAT_COMPTEUR[c.etat]}{c.mandat?.mandat_reference ? ` · ${c.mandat.mandat_reference}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {etat.exclus.map((x) => (
        <p key={x.numero} className="text-[11px] leading-[15px] text-km-muted">
          <span className="font-mono font-semibold">{x.numero}</span> : {x.raison === 'KIWEE_SEUL' ? 'mandat KiWee seul, que Tradeo refuse — il faut le mandat Energix.' : 'aucun mandat actif.'}
        </p>
      ))}
      {etat.sansPrixAutomatiques.length > 0 && (
        <p className="text-[11px] leading-[15px] text-km-muted">
          {etat.sansPrixAutomatiques.map((f) => f.nom).join(', ')} : passe{etat.sansPrixAutomatiques.length > 1 ? 'nt' : ''} par Tradeo mais envoie{etat.sansPrixAutomatiques.length > 1 ? 'nt' : ''} une proposition en document, à déposer sur le tableau.
        </p>
      )}
      {etat.etape === 'A_DEMANDER' && etat.manques.map((m) => (
        <p key={m} className="rounded-[8px] border border-km-amber-line bg-km-amber-soft px-2 py-1.5 text-[11px] leading-[15px] text-[#8a4b2a]">{m}</p>
      ))}
    </div>
  )
}
