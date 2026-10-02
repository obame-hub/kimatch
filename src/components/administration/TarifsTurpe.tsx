import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, CopyPlus, FileText, Loader2, Paperclip, Trash2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { urlOuvrableDocument, useDeleteDocument, useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  casesDeLaFormule, postesDuDomaine, uniteB, useGrilleTurpe, useTurpeMutations,
  type CodeComposante, type DomaineTension, type FormuleTurpe, type GrilleTurpe, type StatutGrille, type VersionTurpe,
} from '@/lib/data/turpe'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ADMINISTRATION › TURPE — les grilles, datées, que le Pricer appelle pour chaque budget électricité
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 02/10/2026 : « il faudrait créer un accès et mettre en forme cette page depuis la page
 * Administration », puis la fusion avec le cahier des charges Lovable (`prompts-turpe.md`) :
 *
 *   · LES GRILLES, datées — une seule en vigueur à la fois ; les grilles expirées restent pour
 *     recalculer un ancien dossier, une grille à venir se prépare d'avance (« Nouvelle grille »
 *     recopie la grille choisie et clôt la grille en cours la veille) ;
 *   · LE FICHIER D'ENEDIS joint à chaque grille (« celui venant d'Enedis ») ;
 *   · GESTION ET COMPTAGE, par domaine (BT > 36 kVA, HTA), en contrat unique — « ne propose pas les
 *     contrats CARD » ;
 *   · LE SOUTIRAGE, formule par formule (BTSUPCU4, BTSUPLU4, HTACU5, HTALU5) : b et c par poste ;
 *   · LA VARIATION par rapport à la grille précédente (William, 02/10/2026) : sous chaque case l'écart
 *     en valeur et en %, la variation moyenne de la grille, et ce que la nouvelle grille change au
 *     TURPE annuel des compteurs de la formule, calculé par la base avec l'une puis l'autre grille.
 *
 * Une case s'enregistre en la quittant. Elle n'accepte qu'un nombre : chiffres et une virgule, le
 * point devient une virgule, quatre décimales au plus — un coefficient réglementaire ne s'arrondit pas.
 */

const LIBELLE_POSTE: Record<string, string> = { PTE: 'Pointe', HPH: 'HPH', HCH: 'HCH', HPE: 'HPE', HCE: 'HCE' }
const DOMAINES: [DomaineTension, string, string][] = [['BT_SUP_36', 'Basse tension > 36 kVA', 'C4'], ['HTA', 'Haute tension A', 'C2 · C3']]
const STATUT: Record<StatutGrille, [string, string]> = {
  active: ['En vigueur', 'border-km-green-line bg-km-green-soft text-km-green'],
  a_venir: ['À venir', 'border-km-blue/30 bg-km-blue-soft text-km-blue'],
  expiree: ['Expirée', 'border-km-line bg-km-soft text-km-muted'],
}

const fr = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { maximumFractionDigits: 4 }))
const dateFr = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '—')
function nettoyer(brut: string): string {
  const t = brut.replace(/\./g, ',').replace(/[^\d,]/g, '')
  const i = t.indexOf(',')
  return i < 0 ? t.slice(0, 9) : `${t.slice(0, i).slice(0, 9)},${t.slice(i + 1).replace(/,/g, '').slice(0, 4)}`
}
const lire = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

export function TarifsTurpe() {
  const { data: g, isLoading, error } = useGrilleTurpe()
  const [versionId, setVersionId] = useState<string | null>(null)
  const [formuleId, setFormuleId] = useState<string | null>(null)

  const version = g?.versions.find((v) => v.id === versionId) ?? g?.versions.find((v) => v.statut === 'active') ?? g?.versions[0] ?? null
  const formules = useMemo(() => (g?.formules ?? []).filter((f) => f.versionId === version?.id), [g, version])
  const formule = formules.find((f) => f.id === formuleId) ?? formules[0] ?? null

  if (isLoading) return <p className="text-km-body text-km-faint">Chargement des grilles…</p>
  if (error || !g) return <p className="text-km-body text-km-red">Impossible de lire les grilles du TURPE : {String((error as Error)?.message ?? '')}</p>
  if (!version) return <p className="text-km-body text-km-faint">Aucune grille TURPE en base.</p>

  const fixes = g.fixes.filter((x) => x.versionId === version.id && x.cadre === 'CONTRAT_UNIQUE')
  const remplies = (f: FormuleTurpe) => g.coefficients.filter((c) => c.formuleId === f.id && c.valeur != null).length
  /* LA GRILLE PRÉCÉDENTE : celle qui commence juste avant. Les formules se retrouvent par leur code. */
  const precedente = g.versions
    .filter((v) => v.dateDebut && version.dateDebut && v.dateDebut < version.dateDebut)
    .sort((a, b) => (b.dateDebut ?? '').localeCompare(a.dateDebut ?? ''))[0] ?? null
  const fixesPrec = precedente ? g.fixes.filter((x) => x.versionId === precedente.id && x.cadre === 'CONTRAT_UNIQUE') : []
  const formulePrecedente = (f: FormuleTurpe) => (precedente ? g.formules.find((x) => x.versionId === precedente.id && x.code === f.code) ?? null : null)
  const coef = (formuleId: string | undefined, composanteId: string, posteId: string | null) =>
    formuleId ? g.coefficients.find((c) => c.formuleId === formuleId && c.composanteId === composanteId && c.posteId === posteId)?.valeur ?? null : null
  /* La variation moyenne de la grille, sur toutes les cases renseignées des deux côtés. */
  const ecarts: number[] = []
  if (precedente) {
    for (const x of fixes) {
      const y = fixesPrec.find((z) => z.domaine === x.domaine)
      for (const [a, b] of [[x.cg, y?.cg], [x.cc, y?.cc]] as const) if (a != null && b != null && b !== 0) ecarts.push((a - b) / b)
    }
    for (const f of formules) {
      const fp = formulePrecedente(f)
      for (const c of g.coefficients.filter((k) => k.formuleId === f.id && k.valeur != null)) {
        const b = coef(fp?.id, c.composanteId, c.posteId)
        if (b != null && b !== 0) ecarts.push((c.valeur! - b) / b)
      }
    }
  }
  const moyenne = ecarts.length ? ecarts.reduce((t, x) => t + x, 0) / ecarts.length : null

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[90ch] text-km-body leading-relaxed text-km-muted">
        Le TURPE est le même pour toutes les offres d’un compteur : le Pricer ne l’affiche pas, mais il l’ajoute à chaque budget électricité et le note en base, avec la grille utilisée.
        Seules la basse tension &gt; 36 kVA et la HTA (pointe fixe) sont calculées.
      </p>

      <Grilles g={g} version={version} onChoisir={(id) => { setVersionId(id); setFormuleId(null) }} />
      <EnTeteVersion version={version} />
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-km-muted">
        {precedente
          ? <>Variations calculées par rapport à <b className="font-semibold text-km-text">{precedente.libelle}</b> ({dateFr(precedente.dateDebut)} → {dateFr(precedente.dateFin)}).</>
          : <>Aucune grille précédente : pas de variation à calculer.</>}
        {moyenne != null && (
          <span className={cn('rounded-full px-2 font-mono text-[11px] font-bold leading-[20px]', moyenne < 0 ? 'bg-km-green-soft text-km-green' : moyenne > 0 ? 'bg-km-red-soft text-km-red' : 'bg-km-soft text-km-muted')}>
            Variation moyenne {moyenne < 0 ? '−' : '+'} {pct(Math.abs(moyenne))} %
          </span>
        )}
        {precedente && moyenne == null && <span className="text-km-faint">— rien à comparer tant que les deux grilles ne sont pas renseignées.</span>}
      </div>

      <section className="flex flex-col gap-2.5">
        <Titre nom="Gestion et comptage" aide="Forfaits annuels du contrat unique, par domaine de tension." />
        <div className="overflow-x-auto rounded-km-md border border-km-line">
          <div className="grid min-w-[480px]" style={{ gridTemplateColumns: '220px repeat(2, minmax(140px, 1fr))' }}>
            <span className="border-b border-km-line bg-km-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Domaine</span>
            {['Gestion · CG', 'Comptage · CC'].map((n) => (
              <span key={n} className="border-b border-l border-km-line bg-km-soft px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[.07em] text-km-muted">{n} <span className="font-normal normal-case tracking-normal text-km-faint">€/an</span></span>
            ))}
            {DOMAINES.map(([domaine, nom, segment], i) => {
              const x = fixes.find((y) => y.domaine === domaine)
              return (
                <span key={domaine} className="contents">
                  <span className={cn('flex items-baseline gap-2 px-3 py-2.5', i > 0 && 'border-t border-km-line-soft')}>
                    <span className="text-[12.5px] font-bold text-km-text">{nom}</span>
                    <span className="text-[11px] text-km-faint">{segment}</span>
                  </span>
                  {(['cg_annuel', 'cc_annuel'] as const).map((champ) => (
                    <span key={champ} className={cn('flex flex-col justify-center gap-1 border-l border-km-line-soft px-2 py-2', i > 0 && 'border-t')}>
                      <CaseFixe id={x?.id} champ={champ} valeur={x ? (champ === 'cg_annuel' ? x.cg : x.cc) : null} label={`${champ === 'cg_annuel' ? 'Gestion' : 'Comptage'} · ${nom}`} />
                      {precedente && (() => {
                        const y = fixesPrec.find((z) => z.domaine === domaine)
                        return <Variation actuelle={x ? (champ === 'cg_annuel' ? x.cg : x.cc) : null} precedente={y ? (champ === 'cg_annuel' ? y.cg : y.cc) : null} unite="€/an" />
                      })()}
                    </span>
                  ))}
                </span>
              )
            })}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <Titre nom="Soutirage" aide="Par formule et par poste : b sur les tranches de puissance souscrite, c sur l’énergie soutirée." />
        <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <nav aria-label="Formules tarifaires" className="flex flex-col gap-3.5">
            {DOMAINES.map(([domaine, nom, segment]) => {
              const liste = formules.filter((f) => f.domaine === domaine)
              if (!liste.length) return null
              return (
                <div key={domaine} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline gap-2 px-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-[.09em] text-km-faint">{nom}</span>
                    <span className="text-[10.5px] font-semibold text-km-faint">{segment}</span>
                  </span>
                  {liste.map((f) => {
                    const r = remplies(f)
                    const n = casesDeLaFormule(f)
                    const actif = f.id === formule?.id
                    const usage = g.usage[f.code] ?? 0
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormuleId(f.id)}
                        aria-current={actif ? 'true' : undefined}
                        className={cn('flex flex-col gap-1.5 rounded-km-md border bg-white px-3 py-2 text-left transition-[border-color,box-shadow]', actif ? 'border-km-green shadow-[0_0_0_3px_rgba(13,122,95,.10)]' : 'border-km-line hover:border-[#C9D0CB]')}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[12.5px] font-bold text-km-text">{f.code}</span>
                          <span className="flex-1" />
                          {usage > 0 && <span className="rounded-full bg-km-soft px-1.5 text-[10px] font-bold leading-[16px] text-km-muted" title={`${usage} compteur${usage > 1 ? 's' : ''} sur cette formule`}>{usage} cpt.</span>}
                          {r >= n && <Check className="h-3.5 w-3.5 text-km-green" strokeWidth={3} aria-label="Formule complète" />}
                        </span>
                        <span className="text-[11px] leading-[15px] text-km-muted">{f.libelle.split(' · ').slice(1).join(' · ') || f.libelle}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </nav>
          {formule
            ? (
              <div className="flex flex-col gap-3">
                <GrilleFormule key={formule.id} g={g} formule={formule} precedente={formulePrecedente(formule)} dateDebut={version.dateDebut} />
                {precedente && <ImpactCompteurs formule={formule} versionId={version.id} precedente={precedente} />}
              </div>
            )
            : <p className="text-km-body text-km-faint">Aucune formule dans cette grille.</p>}
        </div>
      </section>

      <p className="rounded-km-md border border-dashed border-km-line px-3.5 py-2.5 text-[12px] leading-relaxed text-km-muted">
        <b className="font-semibold text-km-text">TURPE annuel HT</b> = gestion + comptage + b₁ × P₁ + Σ bᵢ × (Pᵢ − Pᵢ₋₁) + Σ cᵢ ÷ 100 × énergie du poste (kWh).
        Les puissances souscrites s’arrondissent à l’entier supérieur et ne descendent jamais sous celle du poste précédent. Les valeurs se recopient depuis la délibération de la CRE, sans arrondi.
      </p>
    </div>
  )
}

/** Les grilles, de la plus récente à la plus ancienne, et la préparation de la suivante. */
function Grilles({ g, version, onChoisir }: { g: GrilleTurpe; version: VersionTurpe; onChoisir: (id: string) => void }) {
  const { nouvelleGrille } = useTurpeMutations()
  const [ouvert, setOuvert] = useState(false)
  const annee = new Date().getFullYear() + (new Date().getMonth() >= 7 ? 1 : 0)
  const [libelle, setLibelle] = useState(`TURPE — août ${annee}`)
  const [debut, setDebut] = useState(`${annee}-08-01`)
  const [erreur, setErreur] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {g.versions.map((v) => {
        const [nom, classes] = STATUT[v.statut]
        const actif = v.id === version.id
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChoisir(v.id)}
            aria-current={actif ? 'true' : undefined}
            className={cn('flex min-w-[200px] flex-col gap-1 rounded-km-md border bg-white px-3 py-2 text-left transition-[border-color,box-shadow]', actif ? 'border-km-green shadow-[0_0_0_3px_rgba(13,122,95,.10)]' : 'border-km-line hover:border-[#C9D0CB]')}
          >
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-extrabold text-km-text">{v.libelle}</span>
              <span className={cn('rounded-full border px-1.5 text-[9.5px] font-extrabold leading-[16px]', classes)}>{nom}</span>
            </span>
            <span className="font-mono text-[11px] text-km-muted">{dateFr(v.dateDebut)} → {v.dateFin ? dateFr(v.dateFin) : 'en cours'}</span>
          </button>
        )
      })}
      {ouvert ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setErreur(null)
            nouvelleGrille.mutateAsync({ sourceId: version.id, libelle: libelle.trim(), debut })
              .then((id) => { setOuvert(false); onChoisir(id) })
              .catch((x: Error) => setErreur(x.message))
          }}
          className="flex flex-wrap items-end gap-2 rounded-km-md border border-dashed border-km-green-line bg-km-green-tint px-3 py-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Nom</span>
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required className="h-8 w-[190px] rounded-km-sm border border-km-line bg-white px-2 text-[12px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">En vigueur le</span>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
          </label>
          <button type="submit" disabled={nouvelleGrille.isPending} className="h-8 rounded-km-sm bg-km-green px-3 text-[12px] font-bold text-white hover:bg-[#0a6650] disabled:opacity-60">
            {nouvelleGrille.isPending ? 'Création…' : `Créer d’après ${version.libelle}`}
          </button>
          <button type="button" onClick={() => setOuvert(false)} className="h-8 rounded-km-sm px-2 text-[12px] text-km-muted hover:bg-white">Annuler</button>
          <span className="basis-full text-[11px] text-km-muted">Les valeurs sont recopiées : ne ressaisissez que ce que la CRE a changé. La grille en cours se clôt la veille.</span>
          {erreur && <span className="basis-full text-[11px] font-semibold text-km-red">{erreur}</span>}
        </form>
      ) : (
        <button type="button" onClick={() => setOuvert(true)} className="flex min-w-[170px] items-center justify-center gap-2 rounded-km-md border border-dashed border-km-line px-3 py-2 text-[12px] font-semibold text-km-muted hover:border-km-green hover:text-km-green">
          <CopyPlus className="h-4 w-4" /> Nouvelle grille
        </button>
      )}
    </div>
  )
}

/** La grille choisie : ses dates (modifiables) et le fichier d'Enedis qui la fonde. */
function EnTeteVersion({ version: v }: { version: VersionTurpe }) {
  const { majVersion } = useTurpeMutations()
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { setErreur(null) }, [v.id])
  const maj = (patch: Parameters<typeof majVersion.mutate>[0]['patch']) => majVersion.mutateAsync({ id: v.id, patch }).catch((x: Error) => setErreur(x.message))
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-km-lg border border-km-line bg-km-soft/50 px-4 py-3.5">
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-km-md bg-km-elec-soft text-km-elec" aria-hidden="true"><Zap className="h-4 w-4" /></span>
        <span className="flex flex-col">
          <span className="text-[15px] font-extrabold tracking-[-.01em] text-km-text">{v.libelle}</span>
          <span className="text-[12px] text-km-muted">{STATUT[v.statut][0]}{v.statut === 'expiree' ? ' : sert à recalculer les anciens dossiers' : ''}</span>
        </span>
      </span>
      <label key={`d${v.id}`} className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Début</span>
        <input type="date" defaultValue={v.dateDebut ?? ''} onBlur={(e) => { if (e.target.value !== (v.dateDebut ?? '')) void maj({ date_debut: e.target.value || null }) }} className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
      </label>
      <label key={`f${v.id}`} className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Fin</span>
        <input type="date" defaultValue={v.dateFin ?? ''} onBlur={(e) => { if (e.target.value !== (v.dateFin ?? '')) void maj({ date_fin: e.target.value || null }) }} className="h-8 rounded-km-sm border border-km-line bg-white px-2 font-mono text-[12px]" />
      </label>
      <span className="ml-auto"><FichiersGrille versionId={v.id} /></span>
      {erreur && <span className="basis-full text-[11.5px] font-semibold text-km-red">{erreur}</span>}
    </div>
  )
}

/**
 * LE FICHIER D'ENEDIS — William, 02/10/2026 : « pour chaque version, me permettre de joindre un
 * fichier (celui venant d'Enedis) ». Rangé dans les documents de Kimatch, sur la grille, et ouvert
 * par une adresse signée (le stockage est privé).
 */
function FichiersGrille({ versionId }: { versionId: string }) {
  const entree = useRef<HTMLInputElement>(null)
  const { data: documents } = useDocumentsParEntites([versionId])
  const { data: types } = useReferenceTable('types_documents')
  const televerser = useTeleverserDocuments()
  const supprimer = useDeleteDocument()
  const [erreur, setErreur] = useState<string | null>(null)
  const fichiers = (documents ?? []).filter((d) => d.entite_type === 'version_turpe')
  const envoyer = (liste: FileList | null) => {
    const f = Array.from(liste ?? [])
    if (!f.length) return
    setErreur(null)
    const type = ((types ?? []) as { id: string; code?: string }[]).find((t) => t.code === 'ANNEXE')
    void televerser.mutateAsync({ fichiers: f, entite_type: 'version_turpe', entite_id: versionId, type_document_id: type?.id ?? null, type_document_libelle: 'Grille TURPE Enedis' })
      .catch((x: Error) => setErreur(x.message))
  }
  return (
    <span className="flex flex-col items-end gap-1.5">
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {fichiers.map((d) => (
          <span key={d.id} className="inline-flex max-w-[260px] items-center gap-1 rounded-km-sm border border-km-line bg-white py-0.5 pl-2 pr-1 text-[11.5px]">
            <FileText className="h-3.5 w-3.5 shrink-0 text-km-red" />
            <button type="button" onClick={() => void urlOuvrableDocument(d.url).then((u) => window.open(u, '_blank', 'noopener'))} className="truncate font-semibold text-km-text hover:text-km-green hover:underline" title="Ouvrir le fichier">
              {d.nom_fichier || d.nom}
            </button>
            <button type="button" onClick={() => supprimer.mutate(d.id)} aria-label={`Retirer ${d.nom}`} title="Retirer ce fichier" className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-km-faint hover:bg-km-red-soft hover:text-km-red">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => entree.current?.click()} disabled={televerser.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-km-sm border border-km-line bg-white px-2.5 text-[12px] font-semibold text-km-text hover:bg-km-soft disabled:opacity-60">
          {televerser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-km-green" /> : <Paperclip className="h-3.5 w-3.5 text-km-green" />}
          {fichiers.length ? 'Ajouter un fichier' : 'Joindre le fichier Enedis'}
        </button>
        <input ref={entree} type="file" accept=".pdf,.xls,.xlsx,.csv,application/pdf" className="hidden" onChange={(e) => { envoyer(e.target.files); e.target.value = '' }} />
      </span>
      {erreur && <span className="text-[11px] font-semibold text-km-red">{erreur}</span>}
    </span>
  )
}

/** Le soutirage d'une formule : b et c, une colonne par poste. */
function GrilleFormule({ g, formule, precedente, dateDebut }: { g: GrilleTurpe; formule: FormuleTurpe; precedente: FormuleTurpe | null; dateDebut: string | null }) {
  const { enregistrerCoefficient } = useTurpeMutations()
  const postes = postesDuDomaine(formule.domaine)
  const lignes: [CodeComposante, string, string, string][] = [
    ['TURPE_CS_PUISSANCE', 'Puissance', 'b', uniteB(formule.domaine)],
    ['TURPE_CS_ENERGIE', 'Énergie', 'c', 'c€/kWh'],
  ]
  const valeur = (code: CodeComposante, posteCode: string) => {
    const c = g.composantes.find((x) => x.code === code)
    const p = g.postes.find((x) => x.code === posteCode)
    return g.coefficients.find((x) => x.formuleId === formule.id && x.composanteId === c?.id && x.posteId === p?.id)?.valeur ?? null
  }
  const valeurPrecedente = (code: CodeComposante, posteCode: string) => {
    if (!precedente) return null
    const c = g.composantes.find((x) => x.code === code)
    const p = g.postes.find((x) => x.code === posteCode)
    return g.coefficients.find((x) => x.formuleId === precedente.id && x.composanteId === c?.id && x.posteId === p?.id)?.valeur ?? null
  }
  const enregistrer = (code: CodeComposante, posteCode: string, v: number | null) => {
    const composante = g.composantes.find((x) => x.code === code)
    const poste = g.postes.find((x) => x.code === posteCode)
    if (composante && poste) enregistrerCoefficient.mutate({ formule, composante, poste, valeur: v, dateDebut })
  }
  const usage = g.usage[formule.code] ?? 0
  const puissance = formule.puissanceMin != null || formule.puissanceMax != null ? `${formule.puissanceMin ?? 0}${formule.puissanceMax != null ? ` à ${formule.puissanceMax}` : ' et plus'} kVA` : null
  return (
    <div className="overflow-hidden rounded-km-lg border border-km-line bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-km-line bg-gradient-to-b from-km-soft to-white px-4 py-3">
        <span className="font-mono text-[16px] font-bold text-km-text">{formule.code}</span>
        <span className="text-[13px] text-km-muted">{formule.libelle}</span>
        <span className="flex-1" />
        <span className="rounded-full border border-km-line bg-white px-2 text-[11px] font-semibold leading-[20px] text-km-muted">{postes.length} postes</span>
        {puissance && <span className="rounded-full border border-km-line bg-white px-2 text-[11px] font-semibold leading-[20px] text-km-muted">{puissance}</span>}
        <span className="rounded-full border border-km-line bg-white px-2 text-[11px] font-semibold leading-[20px] text-km-muted">{usage} compteur{usage > 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-max" style={{ gridTemplateColumns: `190px repeat(${postes.length}, minmax(96px, 1fr))` }}>
          <span className="border-b border-km-line bg-km-soft px-3 py-2 text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">Composante</span>
          {postes.map((p) => <span key={p} className="border-b border-l border-km-line bg-km-soft px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[.07em] text-km-muted">{LIBELLE_POSTE[p] ?? p}</span>)}
          {lignes.map(([code, nom, lettre, unite], i) => (
            <span key={code} className="contents">
              <span className={cn('flex flex-col justify-center px-3 py-2.5', i > 0 && 'border-t border-km-line-soft')}>
                <span className="flex items-baseline gap-1.5"><span className="text-[12.5px] font-bold text-km-text">{nom}</span><span className="font-mono text-[11px] font-semibold text-km-faint">{lettre}</span></span>
                <span className="text-[10.5px] text-km-faint">{unite}</span>
              </span>
              {postes.map((p) => (
                <span key={p} className={cn('flex flex-col justify-center gap-1 border-l border-km-line-soft px-2 py-2', i > 0 && 'border-t')}>
                  <Case valeur={valeur(code, p)} label={`${nom} ${LIBELLE_POSTE[p] ?? p} · ${formule.code}`} onEnregistrer={(v) => enregistrer(code, p, v)} />
                  {precedente && <Variation actuelle={valeur(code, p)} precedente={valeurPrecedente(code, p)} unite={unite} />}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const pct = (x: number) => (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** L'écart d'une case à la grille précédente : en valeur et en %, la valeur d'avant au survol. */
function Variation({ actuelle, precedente, unite }: { actuelle: number | null; precedente: number | null; unite: string }) {
  if (precedente == null) return <span className="text-right text-[10.5px] text-km-faint">avant : —</span>
  if (actuelle == null) return <span className="text-right text-[10.5px] text-km-faint">avant : {fr(precedente)}</span>
  const d = actuelle - precedente
  const ton = d < 0 ? 'text-km-green' : d > 0 ? 'text-km-red' : 'text-km-muted'
  return (
    <span title={`Grille précédente : ${fr(precedente)} ${unite}`} className={cn('flex items-center justify-end gap-1 whitespace-nowrap font-mono text-[10.5px] font-bold', ton)}>
      {d === 0 ? 'inchangé' : <>{d < 0 ? '−' : '+'} {fr(Math.abs(d))}{precedente !== 0 && <span className="font-semibold opacity-80">({d < 0 ? '−' : '+'}{pct(Math.abs(d / precedente))} %)</span>}</>}
    </span>
  )
}

/**
 * CE QUE LA NOUVELLE GRILLE CHANGE AUX COMPTEURS — le TURPE annuel des compteurs de la formule,
 * calculé par la base (`fn_calculer_turpe`) avec la grille choisie puis avec la précédente.
 */
function ImpactCompteurs({ formule, versionId, precedente }: { formule: FormuleTurpe; versionId: string; precedente: VersionTurpe }) {
  const { data, isLoading } = useQuery({
    queryKey: ['turpe', 'impact', formule.code, versionId, precedente.id],
    queryFn: async () => {
      const { data: cpts, error } = await supabase.from('compteurs_electricite').select('compteur_id').eq('tarif_distribution', formule.code).limit(50)
      if (error) throw new Error(error.message)
      const ids = ((cpts ?? []) as { compteur_id: string }[]).map((c) => c.compteur_id)
      const total = async (compteur: string, grille: string) => {
        const { data: r } = await supabase.rpc('fn_calculer_turpe', { p_compteur_id: compteur, p_version_turpe_id: grille })
        const t = (r as { total?: number | string | null } | null)?.total
        return t == null ? null : Number(t)
      }
      const paires = await Promise.all(ids.map(async (id) => [await total(id, versionId), await total(id, precedente.id)] as const))
      return { compteurs: ids.length, paires: paires.filter((x): x is readonly [number, number] => x[0] != null && x[1] != null) }
    },
  })
  if (isLoading) return <p className="text-[12px] text-km-faint">Calcul de l’impact sur les compteurs…</p>
  if (!data) return null
  const n = data.paires.length
  const avant = n ? data.paires.reduce((t, x) => t + x[1], 0) / n : null
  const apres = n ? data.paires.reduce((t, x) => t + x[0], 0) / n : null
  const d = avant != null && apres != null ? apres - avant : null
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-km-md border border-dashed border-km-line px-3.5 py-2.5 text-[12px] text-km-muted">
      <b className="font-semibold text-km-text">Impact sur les compteurs {formule.code}</b>
      {d != null ? (
        <>
          · TURPE annuel moyen <b className="font-mono text-km-text">{fr2(avant!)} €</b> → <b className="font-mono text-km-text">{fr2(apres!)} €</b>
          <span className={cn('rounded-full px-1.5 font-mono text-[11px] font-bold leading-[18px]', d < 0 ? 'bg-km-green-soft text-km-green' : d > 0 ? 'bg-km-red-soft text-km-red' : 'bg-km-soft text-km-muted')}>
            {d < 0 ? '−' : '+'} {fr2(Math.abs(d))} € / an{avant ? ` (${d < 0 ? '−' : '+'}${pct(Math.abs(d / avant))} %)` : ''}
          </span>
          <span className="text-km-faint">sur {n} compteur{n > 1 ? 's' : ''} calculable{n > 1 ? 's' : ''} des deux côtés</span>
        </>
      ) : (
        <span className="text-km-faint">
          · pas encore calculable : {data.compteurs ? 'il faut les deux grilles complètes (soutirage, gestion, comptage) et les puissances des compteurs' : 'aucun compteur sur cette formule'}.
        </span>
      )}
    </div>
  )
}

const fr2 = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Titre({ nom, aide }: { nom: string; aide: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[13.5px] font-extrabold text-km-text">{nom}</span>
      <span className="text-[11.5px] text-km-faint">{aide}</span>
    </span>
  )
}

function CaseFixe({ id, champ, valeur, label }: { id?: string; champ: 'cg_annuel' | 'cc_annuel'; valeur: number | null; label: string }) {
  const { enregistrerFixe } = useTurpeMutations()
  return <Case valeur={valeur} label={label} desactivee={!id} onEnregistrer={(v) => { if (id) enregistrerFixe.mutate({ id, champ, valeur: v }) }} />
}

/** Une case : la valeur en base, modifiée en local, enregistrée en la quittant. */
function Case({ valeur, label, onEnregistrer, desactivee }: { valeur: number | null; label: string; onEnregistrer: (v: number | null) => void; desactivee?: boolean }) {
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
      disabled={desactivee}
      onChange={(e) => setTexte(nettoyer(e.target.value))}
      onBlur={() => { const v = lire(texte); if (v !== valeur) onEnregistrer(v) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        'h-8 w-full min-w-0 rounded-[8px] border px-2 text-right font-mono text-[12.5px] font-semibold tabular-nums outline-none transition-[background-color,border-color,box-shadow]',
        'hover:border-[#C3CBC5] hover:bg-white focus:border-km-green focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,122,95,.16)] disabled:cursor-not-allowed disabled:opacity-50',
        texte ? 'border-km-line bg-white text-km-text' : 'border-[#E3E8E4] bg-km-soft text-km-text placeholder:text-[#C3CBC5]',
      )}
    />
  )
}
