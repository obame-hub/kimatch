import { useEffect, useMemo, useState } from 'react'
import { CopyPlus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cpbMoyen, useTaxes, useTaxesMutations, type CodeTaxe, type PeriodeTaxe, type StatutPeriode, type Taxes, type ValeurTaxe } from '@/lib/data/reglementaire'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ADMINISTRATION › PRICING — AE, AG, TQD, CTA et CPB
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 02/10/2026. Chaque taxe a ses PÉRIODES, datées (une seule en vigueur à la fois), et pour
 * chacune « une évaluation de la variation par rapport à la version précédente » : l'écart en valeur,
 * en pourcentage, et ce qu'il pèse sur un budget (pour 100 MWh, ou par an pour la CTA).
 *
 *   AE, AG       une valeur, €/MWh
 *   TQD          une valeur par tarif (T1 à T4), €/MWh
 *   CTA          une valeur par tarif et profil, €/an (T4 : une seule)
 *   CPB          une valeur par ANNÉE CIVILE, en vigueur ou en projet ; un simulateur rejoue la
 *                moyenne d'une fourniture comme la base la calcule
 *
 * TURPE, AE, AG, TQD et CTA se lisent au jour de l'ENVOI de l'offre ; le CPB, sur les années de la
 * fourniture. Une case s'enregistre en la quittant ; quatre décimales au plus.
 */

export interface DefinitionTaxe {
  code: CodeTaxe
  nom: string
  energie: string
  unite: string
  dimension: 'unique' | 'tarif' | 'tarif_profil'
  aide: string
}


const TARIFS = ['T1', 'T2', 'T3', 'T4']
const STATUT: Record<StatutPeriode, [string, string]> = {
  active: ['En vigueur', 'border-km-green-line bg-km-green-soft text-km-green'],
  a_venir: ['À venir', 'border-km-blue/30 bg-km-blue-soft text-km-blue'],
  expiree: ['Expirée', 'border-km-line bg-km-soft text-km-muted'],
}
const fr = (v: number | null | undefined, d = 4) => (v == null ? '' : v.toLocaleString('fr-FR', { maximumFractionDigits: d }))
const fr2 = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateFr = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '—')
function nettoyer(brut: string): string {
  const t = brut.replace(/\./g, ',').replace(/[^\d,]/g, '')
  const i = t.indexOf(',')
  return i < 0 ? t.slice(0, 9) : `${t.slice(0, i).slice(0, 9)},${t.slice(i + 1).replace(/,/g, '').slice(0, 4)}`
}
const lire = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AE, AG, TQD, CTA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function TaxeReglementee({ def }: { def: DefinitionTaxe }) {
  const { data: t, isLoading, error } = useTaxes()
  const [periodeId, setPeriodeId] = useState<string | null>(null)
  useEffect(() => { setPeriodeId(null) }, [def.code])
  if (isLoading) return <p className="text-km-body text-km-faint">Chargement…</p>
  if (error || !t) return <p className="text-km-body text-km-red">Impossible de lire les taxes : {String((error as Error)?.message ?? '')}</p>

  const periodes = t.periodes.filter((p) => p.taxe === def.code)
  const periode = periodes.find((p) => p.id === periodeId) ?? periodes.find((p) => p.statut === 'active') ?? periodes[0] ?? null
  const precedente = periode ? periodes.filter((p) => p.dateDebut < periode.dateDebut).sort((a, b) => b.dateDebut.localeCompare(a.dateDebut))[0] ?? null : null

  return (
    <div className="flex flex-col gap-4">
      <EnTeteTaxe def={def} />
      <Periodes def={def} periodes={periodes} periode={periode} onChoisir={setPeriodeId} />
      {periode ? (
        <>
          <DatesPeriode periode={periode} />
          <Valeurs def={def} t={t} periode={periode} precedente={precedente} />
        </>
      ) : <p className="text-km-body text-km-faint">Aucune période pour cette taxe.</p>}
    </div>
  )
}

function EnTeteTaxe({ def }: { def: DefinitionTaxe }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-mono text-[15px] font-bold text-km-text">{def.code}</span>
      <span className="text-[15px] font-extrabold text-km-text">{def.nom}</span>
      <span className={cn('rounded-full px-2 text-[10px] font-extrabold leading-[18px]', def.energie === 'Gaz' ? 'bg-km-gaz-soft text-km-gaz' : 'bg-km-elec-soft text-km-elec')}>{def.energie}</span>
      <span className="text-[12px] text-km-muted">{def.unite} · {def.aide} S’applique au jour de l’envoi de l’offre.</span>
    </div>
  )
}

function Periodes({ def, periodes, periode, onChoisir }: { def: DefinitionTaxe; periodes: PeriodeTaxe[]; periode: PeriodeTaxe | null; onChoisir: (id: string) => void }) {
  const { nouvellePeriode } = useTaxesMutations()
  const [ouvert, setOuvert] = useState(false)
  const [libelle, setLibelle] = useState('')
  const [debut, setDebut] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { setOuvert(false); setErreur(null) }, [def.code])
  const ouvrir = () => {
    const j = new Date()
    const suivant = new Date(j.getFullYear() + (j.getMonth() >= 6 ? 1 : 0), def.code === 'TQD' || def.code === 'CTA' ? 6 : 7, 1)
    const iso = `${suivant.getFullYear()}-${String(suivant.getMonth() + 1).padStart(2, '0')}-01`
    setDebut(iso)
    setLibelle(`${def.code} — ${suivant.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`)
    setErreur(null)
    setOuvert(true)
  }
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {periodes.map((p) => {
        const [nom, classes] = STATUT[p.statut]
        const actif = p.id === periode?.id
        return (
          <button key={p.id} type="button" onClick={() => onChoisir(p.id)} aria-current={actif ? 'true' : undefined}
            className={cn('flex min-w-[190px] flex-col gap-1 rounded-km-md border bg-white px-3 py-2 text-left transition-[border-color,box-shadow]', actif ? 'border-km-green shadow-[0_0_0_3px_rgba(13,122,95,.10)]' : 'border-km-line hover:border-[#C9D0CB]')}
          >
            <span className="flex items-center gap-2">
              <span className="text-[12.5px] font-extrabold text-km-text">{p.libelle}</span>
              <span className={cn('rounded-full border px-1.5 text-[9.5px] font-extrabold leading-[16px]', classes)}>{nom}</span>
            </span>
            <span className="font-mono text-[11px] text-km-muted">{dateFr(p.dateDebut)} → {p.dateFin ? dateFr(p.dateFin) : 'en cours'}</span>
          </button>
        )
      })}
      {ouvert && periode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setErreur(null)
            nouvellePeriode.mutateAsync({ taxe: def.code, sourceId: periode.id, libelle: libelle.trim(), debut })
              .then((id) => { setOuvert(false); onChoisir(id) })
              .catch((x: Error) => setErreur(x.message))
          }}
          className="flex flex-wrap items-end gap-2 rounded-km-md border border-dashed border-km-green-line bg-km-green-tint px-3 py-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Nom</span>
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required className="h-8 w-[200px] rounded-km-sm border border-km-line bg-white px-2 text-[12px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">En vigueur le</span>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
          </label>
          <button type="submit" disabled={nouvellePeriode.isPending} className="h-8 rounded-km-sm bg-km-green px-3 text-[12px] font-bold text-white hover:bg-[#0a6650] disabled:opacity-60">
            {nouvellePeriode.isPending ? 'Création…' : `Créer d’après ${periode.libelle}`}
          </button>
          <button type="button" onClick={() => setOuvert(false)} className="h-8 rounded-km-sm px-2 text-[12px] text-km-muted hover:bg-white">Annuler</button>
          <span className="basis-full text-[11px] text-km-muted">Les valeurs sont recopiées : ne ressaisissez que ce qui change. La période en cours se clôt la veille.</span>
          {erreur && <span className="basis-full text-[11px] font-semibold text-km-red">{erreur}</span>}
        </form>
      ) : (
        <button type="button" onClick={ouvrir} disabled={!periode} className="flex min-w-[160px] items-center justify-center gap-2 rounded-km-md border border-dashed border-km-line px-3 py-2 text-[12px] font-semibold text-km-muted hover:border-km-green hover:text-km-green disabled:opacity-50">
          <CopyPlus className="h-4 w-4" /> Nouvelle période
        </button>
      )}
    </div>
  )
}

function DatesPeriode({ periode: p }: { periode: PeriodeTaxe }) {
  const { majPeriode } = useTaxesMutations()
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { setErreur(null) }, [p.id])
  const maj = (patch: Parameters<typeof majPeriode.mutate>[0]['patch']) => majPeriode.mutateAsync({ id: p.id, patch }).catch((x: Error) => setErreur(x.message))
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-km-lg border border-km-line bg-km-soft/50 px-4 py-3">
      <label key={`l${p.id}`} className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Nom</span>
        <input defaultValue={p.libelle} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== p.libelle) void maj({ libelle: e.target.value.trim() }) }} className="h-8 w-[240px] rounded-km-sm border border-km-line bg-white px-2 text-[12px] font-semibold" />
      </label>
      <label key={`d${p.id}`} className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Début</span>
        <input type="date" defaultValue={p.dateDebut} onBlur={(e) => { if (e.target.value && e.target.value !== p.dateDebut) void maj({ date_debut: e.target.value }) }} className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
      </label>
      <label key={`f${p.id}`} className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Fin</span>
        <input type="date" defaultValue={p.dateFin ?? ''} onBlur={(e) => { if (e.target.value !== (p.dateFin ?? '')) void maj({ date_fin: e.target.value || null }) }} className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
      </label>
      <span className="pb-2 text-[11.5px] text-km-muted">{STATUT[p.statut][0]}</span>
      {erreur && <span className="basis-full text-[11.5px] font-semibold text-km-red">{erreur}</span>}
    </div>
  )
}

interface Ligne { tarif: string | null; profil: string | null }

/** Les valeurs de la période, face à la précédente : l'écart, en valeur et en %, et son poids. */
function Valeurs({ def, t, periode, precedente }: { def: DefinitionTaxe; t: Taxes; periode: PeriodeTaxe; precedente: PeriodeTaxe | null }) {
  const { enregistrerValeur } = useTaxesMutations()
  const [ajout, setAjout] = useState<Ligne | null>(null)
  const de = (pid: string | undefined, l: Ligne) => (pid ? t.valeurs.find((v) => v.periodeId === pid && v.tarif === l.tarif && v.profil === l.profil) : undefined)
  const lignes: Ligne[] = useMemo(() => {
    if (def.dimension === 'unique') return [{ tarif: null, profil: null }]
    if (def.dimension === 'tarif') return TARIFS.map((tarif) => ({ tarif, profil: null }))
    const vues = new Map<string, Ligne>()
    for (const v of t.valeurs.filter((x: ValeurTaxe) => x.periodeId === periode.id || x.periodeId === precedente?.id)) vues.set(`${v.tarif}|${v.profil}`, { tarif: v.tarif, profil: v.profil })
    return [...vues.values()].sort((a, b) => `${a.tarif}${a.profil ?? ''}`.localeCompare(`${b.tarif}${b.profil ?? ''}`))
  }, [def.dimension, t.valeurs, periode.id, precedente?.id])

  const poids = (delta: number) => (def.unite === '€/MWh' ? `${delta < 0 ? '−' : '+'} ${fr2(Math.abs(delta * 100))} € / an pour 100 MWh` : `${delta < 0 ? '−' : '+'} ${fr2(Math.abs(delta))} € / an`)
  const variations = lignes.map((l) => {
    const a = de(periode.id, l)?.valeur ?? null
    const b = de(precedente?.id, l)?.valeur ?? null
    return a != null && b != null && b !== 0 ? (a - b) / b : null
  }).filter((x): x is number => x != null)
  const moyenne = variations.length ? variations.reduce((s, x) => s + x, 0) / variations.length : null

  return (
    <div className="flex flex-col gap-2.5">
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13.5px] font-extrabold text-km-text">Valeurs</span>
        <span className="text-[11.5px] text-km-faint">
          {precedente ? <>comparées à <b className="font-semibold text-km-muted">{precedente.libelle}</b> ({dateFr(precedente.dateDebut)} → {dateFr(precedente.dateFin)})</> : 'aucune période précédente à comparer'}
        </span>
        {moyenne != null && (
          <span className={cn('ml-auto rounded-full px-2 font-mono text-[11px] font-bold leading-[20px]', moyenne < 0 ? 'bg-km-green-soft text-km-green' : moyenne > 0 ? 'bg-km-red-soft text-km-red' : 'bg-km-soft text-km-muted')}>
            {variations.length > 1 ? 'Variation moyenne ' : 'Variation '}{moyenne < 0 ? '−' : '+'} {fr2(Math.abs(moyenne * 100))} %
          </span>
        )}
      </span>
      <div className="overflow-x-auto rounded-km-md border border-km-line">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `${def.dimension === 'unique' ? '' : def.dimension === 'tarif' ? '90px ' : '90px 110px '}minmax(140px, 1fr) 130px 150px minmax(200px, 1.2fr)` }}>
          {def.dimension !== 'unique' && <span className="border-b border-km-line bg-km-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Tarif</span>}
          {def.dimension === 'tarif_profil' && <span className="border-b border-l border-km-line bg-km-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Profil</span>}
          {[`Valeur · ${def.unite}`, 'Période précédente', 'Variation', 'Ce que ça change'].map((n, i) => (
            <span key={n} className={cn('border-b border-km-line bg-km-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[.07em] text-km-faint', (i > 0 || def.dimension !== 'unique') && 'border-l', i > 0 && 'text-right')}>{n}</span>
          ))}
          {lignes.map((l, i) => {
            const v = de(periode.id, l)
            const p = de(precedente?.id, l)?.valeur ?? null
            const a = v?.valeur ?? null
            const delta = a != null && p != null ? a - p : null
            const bord = cn(i > 0 && 'border-t border-km-line-soft')
            return (
              <span key={`${l.tarif}|${l.profil}`} className="contents">
                {def.dimension !== 'unique' && <span className={cn('flex items-center px-3 py-2 font-mono text-[12.5px] font-bold', bord)}>{l.tarif}</span>}
                {def.dimension === 'tarif_profil' && <span className={cn('flex items-center border-l border-km-line-soft px-3 py-2 font-mono text-[12.5px]', bord)}>{l.profil ?? <span className="text-km-faint">tous profils</span>}</span>}
                <span className={cn('flex items-center px-2 py-2', bord, def.dimension !== 'unique' && 'border-l border-km-line-soft')}>
                  <Case valeur={a} label={`${def.code} ${l.tarif ?? ''} ${l.profil ?? ''}`} onEnregistrer={(x) => enregistrerValeur.mutate({ periodeId: periode.id, tarif: l.tarif, profil: l.profil, valeur: x })} />
                </span>
                <span className={cn('flex items-center justify-end border-l border-km-line-soft px-3 py-2 font-mono text-[12.5px] text-km-muted', bord)}>{p != null ? fr(p) : '—'}</span>
                <span className={cn('flex items-center justify-end gap-2 border-l border-km-line-soft px-3 py-2', bord)}>
                  {delta != null ? (
                    <>
                      <span className={cn('font-mono text-[12px] font-bold', delta < 0 ? 'text-km-green' : delta > 0 ? 'text-km-red' : 'text-km-muted')}>{delta < 0 ? '−' : delta > 0 ? '+' : ''} {fr(Math.abs(delta))}</span>
                      {p !== 0 && <span className={cn('rounded-full px-1.5 font-mono text-[10.5px] font-bold leading-[18px]', delta < 0 ? 'bg-km-green-soft text-km-green' : delta > 0 ? 'bg-km-red-soft text-km-red' : 'bg-km-soft text-km-muted')}>{delta < 0 ? '−' : '+'} {fr2(Math.abs((delta / (p as number)) * 100))} %</span>}
                    </>
                  ) : <span className="text-km-line">—</span>}
                </span>
                <span className={cn('flex items-center justify-end border-l border-km-line-soft px-3 py-2 text-[12px] text-km-muted', bord)}>{delta != null && delta !== 0 ? poids(delta) : delta === 0 ? 'inchangé' : ''}</span>
              </span>
            )
          })}
        </div>
      </div>
      {def.dimension === 'tarif_profil' && (
        ajout ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (ajout.tarif) { enregistrerValeur.mutate({ periodeId: periode.id, tarif: ajout.tarif, profil: ajout.profil?.trim().toUpperCase() || null, valeur: null }); setAjout(null) } }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Tarif</span>
              <select value={ajout.tarif ?? ''} onChange={(e) => setAjout({ ...ajout, tarif: e.target.value })} className="h-8 rounded-km-sm border border-km-line bg-white px-2 text-[12px]">
                {TARIFS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Profil (vide : tous)</span>
              <input value={ajout.profil ?? ''} onChange={(e) => setAjout({ ...ajout, profil: e.target.value })} placeholder="P016" className="h-8 w-[110px] rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
            </label>
            <button type="submit" className="h-8 rounded-km-sm bg-km-green px-3 text-[12px] font-bold text-white hover:bg-[#0a6650]">Ajouter la ligne</button>
            <button type="button" onClick={() => setAjout(null)} className="h-8 rounded-km-sm px-2 text-[12px] text-km-muted hover:bg-km-soft">Annuler</button>
          </form>
        ) : (
          <button type="button" onClick={() => setAjout({ tarif: 'T2', profil: '' })} className="inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-km-green hover:underline"><Plus className="h-3.5 w-3.5" /> Ajouter un tarif ou un profil</button>
        )
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CPB
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LE CPB, PAR ANNÉE CIVILE — William, 02/10/2026 : « montants fixes sur des années civiles ». Une
 * année en PROJET (décret non paru) vaut la dernière année en vigueur ; la fourniture prend la
 * moyenne des années qu'elle couvre (du 01/11/2026 sur 36 mois : 2026 à 2029).
 */
export function CoefficientsCpb() {
  const { data: t, isLoading, error } = useTaxes()
  const { enregistrerCpb } = useTaxesMutations()
  const [debut, setDebut] = useState('2026-11-01')
  const [duree, setDuree] = useState(36)
  const [moyenne, setMoyenne] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => {
    if (!debut || !duree) { setMoyenne(null); return }
    let vivant = true
    cpbMoyen(debut, duree).then((m) => { if (vivant) { setMoyenne(m); setErreur(null) } }).catch((x: Error) => { if (vivant) setErreur(x.message) })
    return () => { vivant = false }
  }, [debut, duree, t])
  if (isLoading) return <p className="text-km-body text-km-faint">Chargement…</p>
  if (error || !t) return <p className="text-km-body text-km-red">Impossible de lire les CPB : {String((error as Error)?.message ?? '')}</p>

  const applique = (annee: number) => [...t.cpb].filter((c) => c.statut === 'EN_VIGUEUR' && c.annee <= annee).sort((a, b) => b.annee - a.annee)[0]?.valeur ?? null
  const fin = (() => { const d = new Date(debut + 'T12:00:00'); d.setMonth(d.getMonth() + duree); d.setDate(d.getDate() - 1); return d })()
  const annees = debut ? Array.from({ length: fin.getFullYear() - new Date(debut + 'T12:00:00').getFullYear() + 1 }, (_, i) => new Date(debut + 'T12:00:00').getFullYear() + i) : []
  const prochaine = (t.cpb[t.cpb.length - 1]?.annee ?? new Date().getFullYear()) + 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[15px] font-bold text-km-text">CPB</span>
        <span className="text-[15px] font-extrabold text-km-text">Certificats de production de biogaz</span>
        <span className="rounded-full bg-km-gaz-soft px-2 text-[10px] font-extrabold leading-[18px] text-km-gaz">Gaz</span>
        <span className="text-[12px] text-km-muted">€/MWh par année civile · la fourniture prend la moyenne des années qu’elle couvre.</span>
      </div>

      <div className="overflow-x-auto rounded-km-md border border-km-line">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: '90px 150px 170px 150px minmax(200px, 1fr)' }}>
          {['Année', 'Valeur · €/MWh', 'Statut', 'Valeur appliquée', 'Commentaire'].map((n, i) => (
            <span key={n} className={cn('border-b border-km-line bg-km-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[.07em] text-km-faint', i > 0 && 'border-l')}>{n}</span>
          ))}
          {t.cpb.map((c, i) => {
            const bord = cn(i > 0 && 'border-t border-km-line-soft')
            const a = applique(c.annee)
            return (
              <span key={c.annee} className="contents">
                <span className={cn('flex items-center px-3 py-2 font-mono text-[13px] font-bold', bord)}>{c.annee}</span>
                <span className={cn('flex items-center border-l border-km-line-soft px-2 py-2', bord)}>
                  <Case valeur={c.valeur} label={`CPB ${c.annee}`} onEnregistrer={(x) => { if (x != null) enregistrerCpb.mutate({ annee: c.annee, valeur: x, statut: c.statut, commentaire: c.commentaire }) }} />
                </span>
                <span className={cn('flex items-center border-l border-km-line-soft px-2 py-2', bord)}>
                  <span role="group" aria-label={`Statut ${c.annee}`} className="flex rounded-full bg-km-soft p-0.5">
                    {(['EN_VIGUEUR', 'PROJET'] as const).map((s) => (
                      <button key={s} type="button" aria-pressed={c.statut === s} onClick={() => { if (c.statut !== s) enregistrerCpb.mutate({ annee: c.annee, valeur: c.valeur, statut: s, commentaire: c.commentaire }) }}
                        className={cn('h-6 rounded-full px-2.5 text-[11px] font-bold', c.statut === s ? (s === 'EN_VIGUEUR' ? 'bg-km-green text-white' : 'bg-km-amber text-white') : 'text-km-muted hover:text-km-text')}
                      >{s === 'EN_VIGUEUR' ? 'En vigueur' : 'Projet'}</button>
                    ))}
                  </span>
                </span>
                <span className={cn('flex items-center justify-end border-l border-km-line-soft px-3 py-2 font-mono text-[12.5px]', bord, c.statut === 'PROJET' ? 'text-km-amber' : 'text-km-text')} title={c.statut === 'PROJET' ? 'En projet : la dernière année en vigueur s’applique' : undefined}>
                  {a != null ? fr(a) : '—'}
                </span>
                <span className={cn('flex items-center border-l border-km-line-soft px-3 py-2', bord)}>
                  <input defaultValue={c.commentaire ?? ''} placeholder="—" onBlur={(e) => { if ((e.target.value || null) !== c.commentaire) enregistrerCpb.mutate({ annee: c.annee, valeur: c.valeur, statut: c.statut, commentaire: e.target.value || null }) }} className="h-8 w-full rounded-km-sm border border-transparent bg-transparent px-2 text-[12px] text-km-muted hover:border-km-line focus:border-km-green focus:bg-white focus:outline-none" />
                </span>
              </span>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={() => enregistrerCpb.mutate({ annee: prochaine, valeur: applique(prochaine) ?? 0, statut: 'PROJET', commentaire: null })} className="inline-flex w-fit items-center gap-1.5 text-[12px] font-semibold text-km-green hover:underline">
        <Plus className="h-3.5 w-3.5" /> Ajouter {prochaine}
      </button>

      <div className="flex flex-wrap items-end gap-3 rounded-km-lg border border-km-line bg-km-soft/50 px-4 py-3">
        <span className="basis-full text-[13px] font-extrabold text-km-text">Simuler une fourniture</span>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Début de fourniture</span>
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Durée</span>
          <select value={duree} onChange={(e) => setDuree(Number(e.target.value))} className="h-8 rounded-km-sm border border-km-line bg-white px-2 text-[12px]">
            {[12, 24, 36, 48, 60].map((d) => <option key={d} value={d}>{d} mois</option>)}
          </select>
        </label>
        <span className="flex flex-col gap-0.5 pb-0.5">
          <span className="text-[11.5px] text-km-muted">Jusqu’au <b className="font-mono font-semibold text-km-text">{fin.toLocaleDateString('fr-FR')}</b> · années {annees.join(', ')}</span>
          <span className="text-[13px] text-km-text">CPB moyen : <b className="font-mono font-extrabold">{moyenne != null ? fr(moyenne) : '—'}</b> €/MWh <span className="text-[11.5px] text-km-faint">(calcul de la base)</span></span>
        </span>
        {erreur && <span className="basis-full text-[11px] font-semibold text-km-red">{erreur}</span>}
      </div>
    </div>
  )
}

function Case({ valeur, label, onEnregistrer }: { valeur: number | null; label: string; onEnregistrer: (v: number | null) => void }) {
  const [texte, setTexte] = useState(fr(valeur))
  useEffect(() => { setTexte(fr(valeur)) }, [valeur])
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      value={texte}
      placeholder="—"
      onChange={(e) => setTexte(nettoyer(e.target.value))}
      onBlur={() => { const v = lire(texte); if (v !== valeur) onEnregistrer(v) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        'h-8 w-full min-w-0 rounded-[8px] border px-2 text-right font-mono text-[12.5px] font-semibold tabular-nums outline-none transition-[background-color,border-color,box-shadow]',
        'hover:border-[#C3CBC5] hover:bg-white focus:border-km-green focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,122,95,.16)]',
        texte ? 'border-km-line bg-white text-km-text' : 'border-[#E3E8E4] bg-km-soft text-km-text placeholder:text-[#C3CBC5]',
      )}
    />
  )
}
