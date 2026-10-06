import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CalendarDays, Check, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EnTeteEtape } from '@/components/parcours/Parcours'
import { useFournisseursConsultables } from '@/lib/data/comptes'
import { useEligibilityRules } from '@/lib/data/eligibilityRules'
import { useMappingRules } from '@/lib/data/mappingRules'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCreateVersion } from '@/lib/data/recommandations'
import { notifyEmail } from '@/lib/data/emailSettings'
import { checkEligibility, businessDaysBetween, type EligibilityResult } from '@/lib/eligibility'
import { mandatCouvre } from '@/lib/couvertureMandat'
import { DUREES_TYPES, DUREE_PLAFOND, dureeMaxPerimetre } from '@/lib/dureesFournisseur'
import { estJourOuvreFR } from '@/lib/joursFeries'
import { logoFournisseurNet } from '@/lib/logosFournisseurs'
import { computeEstimatedCommission } from '@/lib/commission'
import { trouverParCode } from '@/lib/codeReferentiel'
import { euros } from '@/lib/euros'
import { cn } from '@/lib/utils'
import type { EcheanceRetenue } from '@/lib/data/echeancesRetenues'
import type { HistoriqueConsultations } from '@/lib/data/recommandations'
import type { Compte, Compteur, Mandat } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PREMIÈRE VERSION, DANS LA FOULÉE — étapes 3 et 4 de la création d'une recommandation
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 06/10/2026 : « Une fois la recommandation créée, le processus de création de la première
 * version doit s'enchaîner sans changer d'écran. » Maquettes retenues
 * (https://claude.ai/artifact/9zaDWkHCNoaUyC8SuAz6Vb) :
 *   · ÉTAPE 3 — le haut de B (la date souhaitée en jours, chacun avec le nombre de fournisseurs qui
 *     peuvent répondre à temps, et le compte des éligibles) ; le bas de A (les cartes logo, KiWee
 *     puis Energix ; en couleur et cliquables si éligibles, grisées sinon, toutes les raisons au survol) ;
 *   · ÉTAPE 4 — la grille de A : une ligne par fournisseur, 12 à 60 mois, la durée max quand la fin
 *     de fourniture au plus tard coupe une durée type, une durée personnalisée, et le nombre d'offres.
 *
 * L'éligibilité est celle du moteur (`checkEligibility`) : Ellipro, type de compte, énergie, tarif et
 * profil gaz, segment électricité, consommation, début de fourniture, mandat KiWee / Energix, et le
 * délai de réponse à la date souhaitée. À l'étape 3, la fin de fourniture n'exclut que le fournisseur
 * qui ne pourrait pas livrer un seul mois ; c'est l'étape 4 qui en tire les durées.
 */

type Zone = 'kiwee' | 'energix'
const zoneDe = (f: Compte): Zone | null => {
  if ((f.intermediary ?? '').toLowerCase() === 'energix') return 'energix'
  if ((f.partnership ?? '').toLowerCase() === 'kiwee') return 'kiwee'
  return null
}
const ZONES: { cle: Zone; nom: string; teinte: string; mandat: string }[] = [
  { cle: 'kiwee', nom: 'Fournisseurs KiWee', teinte: 'text-km-green', mandat: 'mandat KiWee' },
  { cle: 'energix', nom: 'Fournisseurs Energix', teinte: 'text-km-blue', mandat: 'mandat Energix' },
]
/** Au plus trois durées par fournisseur, comme la règle d'avant (une demande raisonnable au pricing). */
export const DUREES_MAX_PAR_FOURNISSEUR = 3

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const midi = (s: string) => { const [a, m, j] = s.slice(0, 10).split('-').map(Number); return new Date(a, m - 1, j, 12) }
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** Les dix prochains jours ouvrés, à partir de demain. */
function prochainsJoursOuvres(n = 10): Date[] {
  const res: Date[] = []
  const d = new Date(); d.setHours(12, 0, 0, 0)
  while (res.length < n) { d.setDate(d.getDate() + 1); if (estJourOuvreFR(d)) res.push(new Date(d)) }
  return res
}

/**
 * LE DÉBUT DE FOURNITURE D'UN COMPTEUR : le lendemain de son échéance retenue. Sans échéance connue
 * (ou indéterminée), aucun : William, 06/10/2026 — « sans échéance, impossible de demander des offres ».
 */
function debutDeFourniture(e: EcheanceRetenue | undefined, declaree: string | null | undefined): Date | null {
  const date = e ? e.date : declaree ?? null
  if (!date) return null
  const d = midi(date); d.setDate(d.getDate() + 1); return d
}

/** Durées par fournisseur, puis par compteur. */
export type DureesFournisseurs = Record<string, Record<string, number[]>>

export function usePremiereVersion({ compte, compteurs, mandats, echeances, historique, dupliquer = false }: {
  compte: Compte | null | undefined
  compteurs: Compteur[]
  mandats: Mandat[] | undefined
  echeances: Map<string, EcheanceRetenue> | undefined
  /** Ce que les versions précédentes disent des fournisseurs (absent : première version). */
  historique?: HistoriqueConsultations | null
  /** Reprendre la dernière version : ses fournisseurs, ses durées, une date que tous tiennent. */
  dupliquer?: boolean
}) {
  const { data: fournisseurs } = useFournisseursConsultables()
  const { data: rules } = useEligibilityRules()
  const { data: mapping } = useMappingRules()
  const [date, setDate] = useState<string | null>(null)
  const [choisis, setChoisis] = useState<string[]>([])
  const [durees, setDurees] = useState<DureesFournisseurs>({})
  const [typesPrix, setTypesPrix] = useState<string[]>(['Fixe'])
  const [retires, setRetires] = useState<string[]>([])

  const debutsOuNul = useMemo(() => Object.fromEntries(compteurs.map((c) => [c.id, debutDeFourniture(echeances?.get(c.id), c.date_echeance)])), [compteurs, echeances])
  const sansEcheance = compteurs.filter((c) => !debutsOuNul[c.id])
  const debuts = useMemo(() => Object.fromEntries(Object.entries(debutsOuNul).filter(([, d]) => d)) as Record<string, Date>, [debutsOuNul])
  const couverture = useMemo(() => ({
    kiwee: compteurs.length > 0 && compteurs.every((c) => mandatCouvre(mandats, c.id, 'KIWI')),
    energix: compteurs.length > 0 && compteurs.every((c) => mandatCouvre(mandats, c.id, 'ENERGIX')),
  }), [compteurs, mandats])
  const enZone = useMemo(() => (fournisseurs ?? []).filter((f) => zoneDe(f) != null), [fournisseurs])

  const evaluer = useMemo(() => (jour: string | null): EligibilityResult[] => {
    if (!compte) return []
    return enZone.map((f) => checkEligibility(f, compte, compteurs, {
      /* Un mois suffit à l'étape 3 : la fin de fourniture n'écarte que qui ne peut rien livrer. */
      durations: [1],
      desiredDate: jour ? midi(jour) : undefined,
      /* Déjà consulté sur ce dossier : son délai d'actualisation ; sinon, son délai de réponse. */
      requestType: historique?.consultes.has(f.id) ? 'actualisation' : 'premiere_demande',
      mandats: couverture,
      debutsFourniture: debuts,
      refuses: historique?.refuses,
    }, rules ?? [], mapping ?? []))
  }, [compte, enZone, compteurs, couverture, debuts, rules, mapping, historique])

  const resultats = useMemo(() => evaluer(date), [evaluer, date])
  const eligibles = resultats.filter((r) => r.eligible)
  const jours = useMemo(() => prochainsJoursOuvres().map((d) => ({ iso: iso(d), d, n: evaluer(iso(d)).filter((r) => r.eligible).length })), [evaluer])

  /* UN FOURNISSEUR DEVENU INÉLIGIBLE (une date plus proche) QUITTE LA SÉLECTION — et on le dit. */
  const cleEligibles = eligibles.map((r) => r.fournisseur.id).join(',')
  useEffect(() => {
    const ok = new Set(cleEligibles.split(','))
    const sortis = choisis.filter((id) => !ok.has(id))
    if (sortis.length === 0 || !date) return
    setChoisis(choisis.filter((id) => ok.has(id)))
    setRetires(sortis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleEligibles])

  /* LA DURÉE MAX, fournisseur par fournisseur et compteur par compteur. */
  const maxParFournisseur = useMemo(() => Object.fromEntries(enZone.map((f) => [
    f.id, Object.fromEntries(compteurs.map((c) => [c.id, debuts[c.id] ? dureeMaxPerimetre([debuts[c.id]], f.max_dff) : 0])),
  ])) as Record<string, Record<string, number>>, [enZone, compteurs, debuts])

  /* ══ LA DUPLICATION — William, 06/10/2026 ══ « Cloner la version précédente à une nouvelle date de
     livraison, en proposant une date permettant d'assurer la réponse de tous les fournisseurs
     sollicités dans la version précédente. » Une fois, quand tout est lu : ses fournisseurs (moins
     ceux qui ont refusé ou ne sont plus éligibles), leurs durées dans la limite de chacun, ses types
     de prix, et le premier jour ouvré où chacun a le temps de répondre. */
  const repris = useRef(false)
  /* Revenir au point de départ (« D'où repartir ? ») : tout repart de zéro, la reprise comprise. */
  const [tour, setTour] = useState(0)
  const reinitialiser = () => { repris.current = false; setChoisis([]); setDurees({}); setDate(null); setTypesPrix(['Fixe']); setRetires([]); setTour((x) => x + 1) }
  useEffect(() => {
    if (!dupliquer || repris.current || !historique?.derniere || !compte || !fournisseurs || !rules) return
    repris.current = true
    const d = historique.derniere
    const loin = evaluer(iso(prochainsJoursOuvres(40)[39]))
    const gardes = d.fournisseurIds.filter((id) => loin.find((r) => r.fournisseur.id === id)?.eligible)
    const dates = prochainsJoursOuvres(40)
    const premier = dates.find((j) => { const r = evaluer(iso(j)); return gardes.every((id) => r.find((x) => x.fournisseur.id === id)?.eligible) })
    if (premier) setDate(iso(premier))
    setChoisis(gardes)
    setTypesPrix(d.typesPrix.length ? d.typesPrix : ['Fixe'])
    setDurees(Object.fromEntries(gardes.map((id) => {
      const avant = d.durees[id]
      return [id, Object.fromEntries(compteurs.map((c) => {
        const liste = Array.isArray(avant) ? avant : avant?.[c.id] ?? []
        const max = maxParFournisseur[id]?.[c.id] ?? DUREE_PLAFOND
        return [c.id, liste.filter((m) => m <= max).slice(0, DUREES_MAX_PAR_FOURNISSEUR)]
      }))]
    })))
  }, [dupliquer, tour, historique, compte, fournisseurs, rules, evaluer, compteurs, maxParFournisseur])

  return {
    fournisseurs: enZone, resultats, eligibles, jours, date, setDate,
    choisis, basculer: (id: string) => setChoisis((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
    toutChoisir: () => setChoisis(eligibles.map((r) => r.fournisseur.id)),
    retires, oublierRetires: () => setRetires([]),
    durees, setDurees, typesPrix, setTypesPrix, maxParFournisseur, debuts, couverture, sansEcheance, reinitialiser,
    actualisation: !!historique && historique.consultes.size > 0,
    chargement: !fournisseurs || !compte,
  }
}
export type PremiereVersion = ReturnType<typeof usePremiereVersion>

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * ÉTAPE 3 — POUR QUAND, ET À QUI ?
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

function Logo({ f, taille = 30 }: { f: Compte; taille?: number }) {
  const url = f.logo_url || logoFournisseurNet(f.nom)
  const style = { width: taille, height: taille }
  return url
    ? <img src={url} alt="" style={style} className="shrink-0 rounded-[7px] object-contain" />
    : <span style={style} className="flex shrink-0 items-center justify-center rounded-[8px] bg-km-green-soft text-[12px] font-bold text-km-green">{f.nom.trim().charAt(0).toUpperCase()}</span>
}

/** Les raisons d'un fournisseur non éligible, au survol de sa carte — posées par-dessus tout. */
function InfoBulle({ cible }: { cible: { r: EligibilityResult; rect: DOMRect } | null }) {
  if (!cible) return null
  const { r, rect } = cible
  const haut = rect.top > 220
  return createPortal(
    <div
      role="tooltip"
      style={{ left: Math.min(rect.left, window.innerWidth - 330), ...(haut ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) }}
      className="pointer-events-none fixed z-[70] flex w-[310px] flex-col gap-[7px] rounded-[12px] bg-km-side-bas px-[13px] py-3 text-white shadow-[0_12px_32px_rgba(6,10,8,.32)]"
    >
      <span className="text-[12px] font-semibold">{r.fournisseur.nom} ne peut pas être consulté</span>
      {r.reasons.map((x) => (
        <span key={x} className="flex gap-[7px] text-[11.5px] leading-[1.4] text-[#D8DFDA]"><span className="text-km-side-red">●</span>{x}</span>
      ))}
    </div>,
    document.body,
  )
}

export function EtapeFournisseurs({ pv, numero, total: totalEtapes, onSuivant, onPlusTard, libellePlusTard = 'Plus tard' }: { pv: PremiereVersion; numero: number; total: number; onSuivant: () => void; onPlusTard: () => void; libellePlusTard?: string }) {
  const [survol, setSurvol] = useState<{ r: EligibilityResult; rect: DOMRect } | null>(null)
  const calendrier = useRef<HTMLInputElement>(null)
  const total = pv.resultats.length
  const nomsRetires = pv.retires.map((id) => pv.fournisseurs.find((f) => f.id === id)?.nom).filter(Boolean)
  const maxJour = Math.max(1, ...pv.jours.map((j) => j.n))
  const horsBande = pv.date && !pv.jours.some((j) => j.iso === pv.date)
  const jours = pv.date ? businessDaysBetween(new Date(), midi(pv.date)) : null

  return (
    <>
      <div className="mb-[14px] flex items-end gap-3">
        <div className="flex-1"><EnTeteEtape numero={numero} total={totalEtapes} titre="Pour quand, et à qui ?" /></div>
        <span className="mb-[22px] flex items-baseline gap-1.5">
          <span className="font-mono text-[30px] font-semibold leading-none text-km-green">{pv.chargement ? '…' : pv.eligibles.length}</span>
          <span className="text-[12px] text-km-muted">éligible{pv.eligibles.length > 1 ? 's' : ''} sur {total}</span>
        </span>
      </div>

      {/* LES JOURS — la hauteur dit combien de fournisseurs peuvent répondre à temps (B). */}
      <div className="-mt-3 mb-[14px] flex flex-col gap-1.5">
        <div className="flex justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Offre souhaitée le <span className="text-km-muted">*</span></span>
          <span className="text-[11px] text-km-faint">{jours != null ? `${jours} jour${jours > 1 ? 's' : ''} ouvré${jours > 1 ? 's' : ''} pour répondre` : 'la hauteur dit combien de fournisseurs peuvent répondre à temps'}</span>
        </div>
        <div className="flex items-end gap-1 rounded-[12px] bg-km-soft p-1">
          {pv.jours.map((j) => {
            const on = pv.date === j.iso
            return (
              <button key={j.iso} type="button" onClick={() => pv.setDate(j.iso)} aria-pressed={on} title={`${j.n} fournisseur${j.n > 1 ? 's' : ''} éligible${j.n > 1 ? 's' : ''} pour le ${j.d.toLocaleDateString('fr-FR')}`}
                className={cn('flex flex-1 flex-col items-center gap-1 rounded-[10px] border py-2 transition-colors', on ? 'border-km-green bg-km-green-tint' : 'border-transparent hover:bg-white')}>
                <span className={cn('w-4 rounded-[4px]', on ? 'bg-km-green' : 'bg-km-green-line')} style={{ height: 6 + Math.round((26 * j.n) / maxJour) }} />
                <span className={cn('text-[10px]', on ? 'font-semibold text-km-green' : 'text-km-muted')}>{JOURS[j.d.getDay()]}</span>
                <span className={cn('font-mono text-[12px] font-semibold', on && 'text-km-green')}>{String(j.d.getDate()).padStart(2, '0')}/{String(j.d.getMonth() + 1).padStart(2, '0')}</span>
                <span className={cn('font-mono text-[10px]', on ? 'text-km-green' : 'text-km-faint')}>{j.n}</span>
              </button>
            )
          })}
          <label title="Choisir une autre date" className={cn('relative flex w-[46px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 self-stretch rounded-[10px] border', horsBande ? 'border-km-green bg-km-green-tint text-km-green' : 'border-dashed border-[#C3CBC5] bg-white text-km-muted')}>
            <CalendarDays className="h-4 w-4" />
            {horsBande && <span className="font-mono text-[10px] font-semibold">{pv.date!.slice(8, 10)}/{pv.date!.slice(5, 7)}</span>}
            <input ref={calendrier} type="date" min={iso(new Date(Date.now() + 86400000))} value={pv.date ?? ''} onChange={(e) => pv.setDate(e.target.value || null)} aria-label="Autre date souhaitée" className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </div>

      {nomsRetires.length > 0 && (
        <p className="mb-2 flex items-center gap-2 text-[11.5px] text-km-amber">
          Retiré{nomsRetires.length > 1 ? 's' : ''} de la sélection, plus éligible{nomsRetires.length > 1 ? 's' : ''} à cette date : {nomsRetires.join(', ')}.
          <button type="button" onClick={pv.oublierRetires} className="font-semibold underline">OK</button>
        </p>
      )}

      {/* LES CARTES (A) */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* SANS ÉCHÉANCE, PAS D'OFFRE — William, 06/10/2026. */}
        {pv.sansEcheance.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-[13px] border border-km-amber-line bg-km-amber-soft px-4 py-3.5 text-[12.5px] text-km-text">
            <b className="font-semibold">Impossible de demander des offres sans échéance connue.</b>
            <span className="text-km-muted">
              {pv.sansEcheance.length > 1 ? 'Ces compteurs n’ont' : 'Ce compteur n’a'} pas d’échéance : {pv.sansEcheance.map((c) => c.utilisation || c.site_nom || c.numero_pdl).join(', ')}.
              Renseignez-la sur {pv.sansEcheance.length > 1 ? 'leur fiche' : 'sa fiche'} (contrat en cours ou date déclarée), puis demandez la version depuis la recommandation.
            </span>
          </div>
        ) : pv.chargement ? (
          <p className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-km-faint"><Loader2 className="h-4 w-4 animate-spin text-km-green" /> Lecture des fournisseurs…</p>
        ) : ZONES.map((z) => {
          const liste = pv.resultats.filter((r) => zoneDe(r.fournisseur) === z.cle)
            .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.fournisseur.nom.localeCompare(b.fournisseur.nom))
          if (liste.length === 0) return null
          const ok = liste.filter((r) => r.eligible).length
          const couvert = z.cle === 'kiwee' ? pv.couverture.kiwee : pv.couverture.energix
          return (
            <div key={z.cle} className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <span className={cn('text-[10.5px] font-bold uppercase tracking-[0.07em]', z.teinte)}>{z.nom}</span>
                <span className="text-[11px] text-km-faint">{ok} éligible{ok > 1 ? 's' : ''} sur {liste.length} · {z.mandat} {couvert ? 'actif' : 'absent'}</span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {liste.map((r) => {
                  const on = pv.choisis.includes(r.fournisseur.id)
                  return (
                    <button
                      key={r.fournisseur.id}
                      type="button"
                      aria-pressed={r.eligible ? on : undefined}
                      aria-disabled={!r.eligible}
                      onClick={() => { if (r.eligible) pv.basculer(r.fournisseur.id) }}
                      onMouseEnter={(e) => { if (!r.eligible) setSurvol({ r, rect: e.currentTarget.getBoundingClientRect() }) }}
                      onMouseLeave={() => setSurvol(null)}
                      onFocus={(e) => { if (!r.eligible) setSurvol({ r, rect: e.currentTarget.getBoundingClientRect() }) }}
                      onBlur={() => setSurvol(null)}
                      className={cn(
                        'relative flex h-[78px] flex-col items-center justify-center gap-[7px] rounded-[12px] border px-1.5 text-center text-[11px] font-semibold transition-colors',
                        !r.eligible ? 'cursor-not-allowed border-dashed border-km-line bg-[#F6F7F6] text-km-faint [&_img]:opacity-45 [&_img]:grayscale [&>span:first-child]:opacity-45 [&>span:first-child]:grayscale'
                          : on ? 'border-[1.5px] border-km-green bg-km-green-tint text-km-text shadow-[0_0_0_3px_rgba(13,122,95,.09)]'
                            : 'border-km-line bg-white text-km-text hover:border-km-green',
                      )}
                    >
                      <Logo f={r.fournisseur} />
                      <span className="line-clamp-2 leading-tight">{r.fournisseur.nom}</span>
                      {on && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-km-green"><Check className="h-2.5 w-2.5 stroke-[4] text-white" /></span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <InfoBulle cible={survol} />

      <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
        <span className="whitespace-nowrap text-[12.5px]"><b>{pv.choisis.length} fournisseur{pv.choisis.length > 1 ? 's' : ''}</b> <span className="text-km-muted">sélectionné{pv.choisis.length > 1 ? 's' : ''}</span></span>
        {pv.eligibles.length > 0 && pv.choisis.length < pv.eligibles.length && (
          <button type="button" onClick={pv.toutChoisir} className="whitespace-nowrap text-[12px] font-semibold text-km-green hover:underline">Tous les éligibles</button>
        )}
        <span className="flex-1" />
        {!pv.date && <span className="whitespace-nowrap text-[11.5px] text-km-faint">Choisissez la date.</span>}
        <Button variant="ghost" onClick={onPlusTard}>{libellePlusTard}</Button>
        <Button variant="primary" disabled={!pv.date || pv.choisis.length === 0 || pv.sansEcheance.length > 0} onClick={onSuivant}>
          Choisir les durées <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * ÉTAPE 4 — QUELLES DURÉES DEMANDER ?
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

export function EtapeDurees({ pv, numero, total, recoId, recoTitre, compteNom, compteurs, onPrecedent, onLance, onErreur }: {
  pv: PremiereVersion
  numero: number
  total: number
  recoId: string
  recoTitre: string
  compteNom: string
  compteurs: Compteur[]
  onPrecedent: () => void
  onLance: (versionId: string | null) => void
  onErreur: (m: string) => void
}) {
  const createVersion = useCreateVersion()
  const { data: motifsRef } = useReferenceTable('motifs_versions_recommandation')
  const { data: statutsRef } = useReferenceTable('statuts_versions_recommandation')
  const { data: typesOptimRef } = useReferenceTable('types_optimisations')
  const [autres, setAutres] = useState<Record<string, string>>({})
  const choisis = pv.choisis.map((id) => pv.fournisseurs.find((f) => f.id === id)).filter((f): f is Compte => !!f)
  /* MONOSITE : le compteur ne s'affiche pas (William, 06/10/2026), la grille reste celle de A. */
  const multisite = compteurs.length > 1
  const d = (fid: string, cid: string) => pv.durees[fid]?.[cid] ?? []
  const max = (fid: string, cid: string) => pv.maxParFournisseur[fid]?.[cid] ?? DUREE_PLAFOND
  const union = (fid: string) => [...new Set(compteurs.flatMap((c) => d(fid, c.id)))].sort((x, y) => x - y)

  const poser = (fid: string, cid: string, liste: number[]) => pv.setDurees((x) => ({ ...x, [fid]: { ...(x[fid] ?? {}), [cid]: [...new Set(liste)].sort((a, b) => a - b) } }))
  const basculer = (fid: string, cid: string, mois: number) => {
    const l = d(fid, cid)
    if (l.includes(mois)) poser(fid, cid, l.filter((m) => m !== mois))
    else if (l.length < DUREES_MAX_PAR_FOURNISSEUR) poser(fid, cid, [...l, mois])
  }
  const cle = (fid: string, cid: string) => `${fid}:${cid}`
  const ajouterAutre = (fid: string, cid: string) => {
    const n = parseInt(autres[cle(fid, cid)] ?? '', 10)
    if (!n || n < 1 || n > max(fid, cid) || d(fid, cid).includes(n)) return
    basculer(fid, cid, n)
    setAutres((a) => ({ ...a, [cle(fid, cid)]: '' }))
  }
  /* LES RACCOURCIS : les durées types possibles partout (chaque fournisseur, chaque compteur). */
  const paires = choisis.flatMap((f) => compteurs.map((c) => [f.id, c.id] as const))
  const communes = DUREES_TYPES.filter((m) => paires.length > 0 && paires.every(([f, c]) => m <= max(f, c)))
  const raccourci = (m: number) => {
    const tous = paires.every(([f, c]) => d(f, c).includes(m))
    pv.setDurees((x) => {
      const n: DureesFournisseurs = { ...x }
      for (const [f, c] of paires) {
        const l = n[f]?.[c] ?? []
        const suivante = tous ? l.filter((v) => v !== m) : !l.includes(m) && l.length < DUREES_MAX_PAR_FOURNISSEUR ? [...l, m].sort((a, b) => a - b) : l
        n[f] = { ...(n[f] ?? {}), [c]: suivante }
      }
      return n
    })
  }
  /* LES OFFRES : une par durée (tous compteurs confondus) et par type de prix. */
  const offres = (fid: string) => union(fid).length * Math.max(1, pv.typesPrix.length)
  const totalOffres = choisis.reduce((t, f) => t + offres(f.id), 0)
  const pret = paires.length > 0 && paires.every(([f, c]) => d(f, c).length > 0) && pv.typesPrix.length > 0

  async function lancer() {
    if (!pret || createVersion.isPending) return
    const parCompteur = Object.fromEntries(compteurs.map((c) => [c.id, [...new Set(choisis.flatMap((f) => d(f.id, c.id)))].sort((a, b) => a - b)]))
    const toutes = [...new Set(Object.values(parCompteur).flat())].sort((a, b) => a - b)
    try {
      const rapport = await createVersion.mutateAsync({
        recommandation_id: recoId,
        compteur_ids: compteurs.map((c) => c.id),
        motif_id: ((motifsRef ?? []).find((m) => m.code === (pv.actualisation ? 'ACTUALISATION_MARCHE' : 'CREATION_INITIALE')) ?? (motifsRef ?? [])[0])?.id ?? null,
        statut_brouillon_id: trouverParCode(statutsRef, 'EN_CONSTRUCTION', 'BROUILLON')?.id ?? null,
        type_optimisation_mise_en_concurrence_id: (typesOptimRef ?? []).find((x) => x.code === 'MISE_EN_CONCURRENCE')?.id ?? null,
        fournisseur_ids: choisis.map((f) => f.id),
        durees_par_compteur: parCompteur,
        durees_par_fournisseur: Object.fromEntries(choisis.map((f) => [f.id, union(f.id)])),
        ...(multisite ? { durees_fournisseur_compteur: Object.fromEntries(choisis.map((f) => [f.id, Object.fromEntries(compteurs.map((c) => [c.id, d(f.id, c.id)]))])) } : {}),
        types_prix: pv.typesPrix,
        date_souhaitee: pv.date,
        resume: `Durée${toutes.length > 1 ? 's' : ''} ${toutes.join('/')} mois — ${pv.typesPrix.join(', ')} — ${choisis.length} fournisseur${choisis.length > 1 ? 's' : ''} consulté${choisis.length > 1 ? 's' : ''} — commission estimée ${euros(computeEstimatedCommission(compteurs, toutes))}`,
        contexte_et_hypotheses: pv.date ? `Date souhaitée : ${midi(pv.date).toLocaleDateString('fr-FR')}` : null,
        etape_en_analyse_id: null,
      })
      void notifyEmail(
        'cotation',
        { cotationName: recoTitre, accountName: compteNom },
        [
          `Une cotation vient d'être créée.`,
          ``,
          `Compte        : ${compteNom || '—'}`,
          `Opportunité   : ${recoTitre}`,
          ...choisis.map((f) => `${f.nom} : ${union(f.id).join(' / ')} mois`),
          `Type de prix  : ${pv.typesPrix.join(', ')}`,
          `Date souhaitée : ${pv.date ? midi(pv.date).toLocaleDateString('fr-FR') : '—'}`,
          `Points de livraison : ${compteurs.length}`,
          ``,
          `${window.location.origin}/recommandations/${recoId}`,
        ].join('\n'),
      )
      if (rapport.offresEchouees > 0) onErreur(`${rapport.offresEchouees} offre(s) attendue(s) n'ont pas pu être créées : le suivi sera à saisir à la main.`)
      onLance(rapport.versionId ?? null)
    } catch (e) {
      onErreur(`La version n'a pas pu être créée : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const grille = 'grid grid-cols-[minmax(0,1fr)_repeat(5,46px)_58px_62px_54px] items-center gap-[6px] px-3'
  /** Une ligne de durées : celle d'un fournisseur (monosite) ou d'un de ses compteurs (multisite). */
  /* Une fonction et non un composant : redéfini à chaque rendu, un composant ferait perdre la saisie. */
  const ligneDurees = ({ f, c, entete, offresLigne }: { f: Compte; c: Compteur; entete: React.ReactNode; offresLigne: React.ReactNode }) => {
    const m = max(f.id, c.id)
    const l = d(f.id, c.id)
    const plein = l.length >= DUREES_MAX_PAR_FOURNISSEUR
    const maxPropose = m >= 1 && m < DUREE_PLAFOND && !(DUREES_TYPES as readonly number[]).includes(m)
    return (
      <div key={`${f.id}:${c.id}`} className={cn(grille, 'min-h-[52px] border-t border-km-line-soft py-1.5')}>
        {entete}
        {DUREES_TYPES.map((mois) => (mois <= m ? (
          <button key={mois} type="button" onClick={() => basculer(f.id, c.id, mois)} aria-pressed={l.includes(mois)} disabled={!l.includes(mois) && plein}
            className={cn('h-8 rounded-[9px] border font-mono text-[12px] font-semibold', l.includes(mois) ? 'border-km-green bg-km-green text-white' : 'border-km-line bg-white text-km-text hover:border-km-green disabled:opacity-40')}>
            {mois}
          </button>
        ) : (
          <span key={mois} title={`${mois} mois finiraient après le ${f.max_dff ? midi(f.max_dff).toLocaleDateString('fr-FR') : ''}`}
            className="flex h-8 items-center justify-center rounded-[9px] border border-dashed border-km-line bg-[repeating-linear-gradient(135deg,#F6F7F6_0_5px,#fff_5px_10px)] font-mono text-[12px] text-[#C3CBC5]">{mois}</span>
        )))}
        {maxPropose ? (
          <button type="button" onClick={() => basculer(f.id, c.id, m)} aria-pressed={l.includes(m)} disabled={!l.includes(m) && plein} title={`La durée la plus longue possible : ${m} mois`}
            className={cn('h-8 rounded-[9px] border font-mono text-[11.5px] font-semibold', l.includes(m) ? 'border-km-amber bg-km-amber text-white' : 'border-km-amber-line bg-km-amber-soft text-km-amber disabled:opacity-40')}>
            {m} m
          </button>
        ) : <span className="text-center text-[11px] text-km-faint">{m < 1 ? 'aucune' : '—'}</span>}
        <span className="flex h-8 items-center rounded-[9px] border border-km-line px-1.5 focus-within:border-km-green">
          <input
            inputMode="numeric"
            value={autres[cle(f.id, c.id)] ?? ''}
            onChange={(e) => setAutres((a) => ({ ...a, [cle(f.id, c.id)]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
            onKeyDown={(e) => { if (e.key === 'Enter') ajouterAutre(f.id, c.id) }}
            onBlur={() => ajouterAutre(f.id, c.id)}
            disabled={plein || m < 1}
            placeholder={`≤ ${m}`}
            aria-label={`Durée personnalisée pour ${f.nom}${multisite ? `, ${c.utilisation || c.site_nom}` : ''}, ${m} mois au plus`}
            className="w-full min-w-0 border-0 bg-transparent font-mono text-[12px] outline-none disabled:opacity-40"
          />
        </span>
        {offresLigne}
      </div>
    )
  }
  const persos = (f: Compte, c: Compteur) => d(f.id, c.id).filter((m) => !(DUREES_TYPES as readonly number[]).includes(m) && m !== max(f.id, c.id))
  const finTexte = (f: Compte) => (f.max_dff ? `fin au plus tard ${midi(f.max_dff).toLocaleDateString('fr-FR')}` : 'pas de limite de fin')
  const nbOffres = (f: Compte) => <span className={cn('text-right font-mono text-[12.5px] font-semibold', offres(f.id) ? 'text-km-text' : 'text-km-amber')}>{offres(f.id)}</span>

  return (
    <>
      <EnTeteEtape numero={numero} total={total} titre="Quelles durées demander ?" />
      <div className="-mt-2 mb-3 flex flex-wrap items-center gap-2">
        {communes.length > 0 && <span className="text-[12px] text-km-muted">Possibles partout :</span>}
        {communes.map((m) => {
          const tous = paires.every(([f, c]) => d(f, c).includes(m))
          return (
            <button key={m} type="button" onClick={() => raccourci(m)} aria-pressed={tous}
              className={cn('flex h-[30px] items-center gap-1.5 rounded-full border-[1.5px] px-3 text-[12px] font-semibold', tous ? 'border-km-green bg-km-green text-white' : 'border-km-green bg-km-green-tint text-km-green')}>
              {tous && <Check className="h-3 w-3 stroke-[3.4]" />}{m} mois pour tous
            </button>
          )
        })}
        <span className="flex-1" />
        <div role="group" aria-label="Type de prix" className="flex gap-0.5 rounded-[9px] bg-km-soft p-[3px]">
          {['Fixe', 'Indexé'].map((x) => {
            const on = pv.typesPrix.includes(x)
            return (
              <button key={x} type="button" aria-pressed={on} onClick={() => pv.setTypesPrix((l) => (on ? l.filter((y) => y !== x) : [...l, x]))}
                className={cn('h-7 rounded-[7px] px-3 text-[12px]', on ? 'bg-white font-semibold text-km-text shadow-[0_1px_3px_rgba(25,40,33,.12)]' : 'font-medium text-km-muted')}>
                Prix {x.toLowerCase()}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="overflow-hidden rounded-[13px] border border-km-line">
          <div className={cn(grille, 'h-[34px] bg-km-soft text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint')}>
            <span>{multisite ? 'Fournisseur · compteur' : 'Fournisseur'}</span>
            {DUREES_TYPES.map((m) => <span key={m} className="text-center">{m}</span>)}
            <span className="text-center">Max</span><span className="text-center">Autre</span><span className="text-right">Offres</span>
          </div>
          {choisis.map((f) => multisite ? (
            <div key={f.id}>
              <div className={cn(grille, 'h-[44px] border-t border-km-line bg-km-bg/60')}>
                <span className="flex min-w-0 items-center gap-2.5"><Logo f={f} taille={26} /><span className="flex min-w-0 flex-col gap-px"><b className="truncate text-[12.5px] font-semibold">{f.nom}</b><span className="truncate text-[10.5px] text-km-faint">{finTexte(f)}</span></span></span>
                <span className="col-span-7" />
                {nbOffres(f)}
              </div>
              {compteurs.map((c) => (
                ligneDurees({ f, c, offresLigne: <span />, entete: (
                  <span className="flex min-w-0 flex-col gap-px pl-9">
                    <span className="truncate text-[12px] font-semibold text-km-text">{c.utilisation || c.site_nom || c.numero_pdl}</span>
                    <span className="truncate text-[10.5px] text-km-faint">début {pv.debuts[c.id]?.toLocaleDateString('fr-FR') ?? '—'}{persos(f, c).length ? ` · ${persos(f, c).map((m) => `${m} m`).join(', ')}` : ''}</span>
                  </span>
                ) })
              ))}
            </div>
          ) : (
            ligneDurees({ f, c: compteurs[0], offresLigne: nbOffres(f), entete: (
              <span className="flex min-w-0 items-center gap-2.5">
                <Logo f={f} />
                <span className="flex min-w-0 flex-col gap-px">
                  <b className="truncate text-[12.5px] font-semibold">{f.nom}</b>
                  <span className="truncate text-[10.5px] text-km-faint">{finTexte(f)}{persos(f, compteurs[0]).length ? ` · ${persos(f, compteurs[0]).map((m) => `${m} m`).join(', ')}` : ''}</span>
                </span>
              </span>
            ) })
          ))}
        </div>
        <p className="mt-2 text-[11px] text-km-faint">
          {!multisite && pv.debuts[compteurs[0]?.id] ? `Début de fourniture le ${pv.debuts[compteurs[0].id].toLocaleDateString('fr-FR')}, lendemain de l’échéance. ` : 'Chaque compteur part du lendemain de son échéance. '}
          Une case hachurée finirait après la limite du fournisseur ; « Max » demande la durée la plus longue possible. Trois durées au plus{multisite ? ' par compteur' : ''}.
        </p>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
        <Button variant="ghost" onClick={onPrecedent} disabled={createVersion.isPending}>Précédent</Button>
        <span className="whitespace-nowrap text-[12.5px]"><b>{totalOffres} offre{totalOffres > 1 ? 's' : ''}</b> <span className="text-km-muted">demandée{totalOffres > 1 ? 's' : ''}</span></span>
        <span className="flex-1" />
        {!pret && <span className="whitespace-nowrap text-[11.5px] text-km-faint">Au moins une durée {multisite ? 'par compteur' : 'par fournisseur'}.</span>}
        <Button variant="primary" disabled={!pret || createVersion.isPending} onClick={() => void lancer()}>
          {createVersion.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lancement…</> : <>Lancer la consultation <Send className="h-3.5 w-3.5" /></>}
        </Button>
      </div>
    </>
  )
}
