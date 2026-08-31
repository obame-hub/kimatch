import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building, Users, Briefcase, Handshake, Scale, Zap, Search, Loader2, ArrowRight, ArrowLeft, PencilLine, Award, MapPin, CheckCircle2, UserPlus, ExternalLink } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label } from '@/components/ui/form'
import { Sheet } from '@/components/ui/sheet'
import { ContactForm } from '@/components/contact/ContactForm'
import { PdlMethodSheet } from '@/components/compteur/PdlMethodSheet'
import { toUpperFR } from '@/lib/textFormat'
import { searchRnic, type RnicResult } from '@/lib/rnic'
import { searchCompanies, type CompanyResult } from '@/lib/companyDirectory'
import { useEllisphereScore, type EllisphereScore } from '@/lib/data/ellisphere'
import { useCreateCompte, findCompteBySiret } from '@/lib/data/comptes'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_COMPTES } from '@/lib/referenceFallbacks'
import type { TypeCompte, Contact } from '@/types/domain'

// Sous-type choisi a l'etape 1 -- correspond a `comptes.segment` (meme convention que la
// migration Salesforce, voir transform.js : segment = Account.Type tel quel).
type Segment = 'Syndic professionnel' | 'Syndic non professionnel' | 'Entreprise' | 'Partenaire' | 'Courtier' | 'Fournisseur'

const SEGMENT_TO_TYPE_COMPTE: Record<Segment, TypeCompte> = {
  'Syndic professionnel': 'client',
  'Syndic non professionnel': 'client',
  Entreprise: 'client',
  Courtier: 'client',
  Partenaire: 'partenaire',
  Fournisseur: 'fournisseur',
}

const TYPE_OPTIONS: { value: Segment; icon: typeof Building; label: string; desc: string }[] = [
  { value: 'Syndic professionnel', icon: Building, label: 'Syndic professionnel', desc: 'Cabinet de gestion immobilière' },
  { value: 'Syndic non professionnel', icon: Users, label: 'Syndic non professionnel', desc: 'Syndic bénévole ou coopératif' },
  { value: 'Entreprise', icon: Briefcase, label: 'Entreprise', desc: 'Société commerciale ou industrielle' },
  { value: 'Partenaire', icon: Handshake, label: 'Partenaire', desc: "Apporteur d'affaires, partenaire" },
  { value: 'Courtier', icon: Scale, label: 'Courtier', desc: 'Intermédiaire en énergie' },
  { value: 'Fournisseur', icon: Zap, label: 'Fournisseur', desc: "Fournisseur d'énergie" },
]

const STEPS = ['Type', 'Recherche', 'Confirmation'] as const

export default function CompteCreate() {
  const navigate = useNavigate()
  const { data: typesComptesRef } = useReferenceTable('types_comptes')
  const typesComptes = typesComptesRef && typesComptesRef.length > 0 ? typesComptesRef : FALLBACK_TYPES_COMPTES
  const createCompte = useCreateCompte()
  const score = useEllisphereScore()

  const [step, setStep] = useState(1)
  const [segment, setSegment] = useState<Segment | ''>('')
  const [rnicPick, setRnicPick] = useState<RnicResult | null>(null)
  const [companyPick, setCompanyPick] = useState<CompanyResult | null>(null)
  const [siretError, setSiretError] = useState<string | null>(null)
  const [checkingSiret, setCheckingSiret] = useState(false)
  // Persisté en sessionStorage pour survivre à un retour navigateur depuis les sous-flots
  // Contact/PDL déclenchés par cet écran -- même mécanisme que "accountWizard:lastCreated" dans
  // Tools.
  const [createdCompte, setCreatedCompte] = useState<{ id: string; nom: string; segment: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem('accountWizard:lastCreated')
      return raw ? (JSON.parse(raw) as { id: string; nom: string; segment: string }) : null
    } catch {
      return null
    }
  })

  function persistCreatedCompte(compte: { id: string; nom: string; segment: string } | null) {
    setCreatedCompte(compte)
    try {
      if (compte) sessionStorage.setItem('accountWizard:lastCreated', JSON.stringify(compte))
      else sessionStorage.removeItem('accountWizard:lastCreated')
    } catch {
      // sessionStorage indisponible (navigation privée stricte, etc.) -- l'état reste en mémoire.
    }
  }

  const progress = (step / STEPS.length) * 100
  const canNext = step === 1 ? !!segment : step === 2 ? !!(rnicPick || companyPick) : false

  function goToType(v: Segment) {
    setSegment(v)
    setStep(2)
  }

  async function handleCreate() {
    if (!segment) return
    setSiretError(null)

    const typeCompte = SEGMENT_TO_TYPE_COMPTE[segment]
    const typeCompteId = typesComptes.find((t) => t.code === typeCompte.toUpperCase())?.id ?? null

    try {
      if (rnicPick) {
        const result = await createCompte.mutateAsync({
          segment,
          typeCompte,
          typeCompteId,
          nom: rnicPick.nom,
          rue: rnicPick.adresse,
          codePostal: rnicPick.codePostal,
          ville: rnicPick.ville,
        })
        persistCreatedCompte({ id: result.compte.id, nom: result.compte.nom, segment })
      } else if (companyPick) {
        const result = await createCompte.mutateAsync({
          segment,
          typeCompte,
          typeCompteId,
          nom: companyPick.raisonSociale || companyPick.nomComplet,
          rue: companyPick.street,
          codePostal: companyPick.postalCode,
          ville: companyPick.city,
          siret: companyPick.siret,
          siren: companyPick.siren,
          codeNaf: companyPick.codeApe,
          libelleApe: companyPick.libelleApe,
          scoreEllipro: score.data?.score ?? null,
          scoreElliproScale: score.data?.scale ?? null,
        })
        persistCreatedCompte({ id: result.compte.id, nom: result.compte.nom, segment })
      }
    } catch (e) {
      setSiretError(e instanceof Error ? e.message : 'Erreur lors de la création.')
    }
  }

  async function handlePickCompany(c: CompanyResult) {
    setCompanyPick(c)
    setRnicPick(null)
    setSiretError(null)
    if (c.siret) {
      setCheckingSiret(true)
      const existing = await findCompteBySiret(c.siret)
      setCheckingSiret(false)
      if (existing) setSiretError(`Un compte avec le SIRET ${c.siret} existe déjà : « ${existing.nom} ».`)
    }
    if (c.siren) score.mutate(c.siren)
  }

  if (createdCompte) {
    return (
      <div>
        <Topbar crumb="Comptes" title="Nouveau compte" />
        <div className="mx-auto max-w-3xl p-4 sm:p-8">
          <NextStepScreen compte={createdCompte} navigate={navigate} onFinish={() => persistCreatedCompte(null)} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar crumb="Comptes" title="Nouveau compte" />
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate('/comptes')}>
              <ArrowLeft className="h-4 w-4" /> Annuler
            </Button>
            <span className="text-xs text-km-faint">Étape {step} / {STEPS.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-km-soft">
            <div className="h-full bg-km-green transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          {/* Libellés d'étape sous la barre, comme Tools (TYPE / RECHERCHE / CONFIRMATION) --
              l'étape courante est mise en avant. */}
          <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-wide">
            {STEPS.map((label, i) => (
              <span key={label} className={i + 1 === step ? 'text-km-green' : 'text-km-faint'}>{label}</span>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div>
            <h2 className="mb-1 font-display text-2xl font-bold text-km-text">Quel type de compte ?</h2>
            <p className="mb-6 text-sm text-km-muted">Sélectionne la catégorie qui correspond à l'entité que tu souhaites créer.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => goToType(opt.value)}
                  className="flex items-start gap-3 rounded-xl border border-km-line bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-kiwi-300 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kiwi-50 text-km-green">
                    <opt.icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-medium text-km-text">{opt.label}</span>
                    <span className="block text-xs text-km-muted">{opt.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && segment === 'Syndic non professionnel' && (
          <RnicSearchStep picked={rnicPick} onPick={(r) => { setRnicPick(r); setCompanyPick(null) }} />
        )}

        {step === 2 && segment !== 'Syndic non professionnel' && segment !== '' && (
          <CompanySearchStep picked={companyPick} checkingSiret={checkingSiret} siretError={siretError} onPick={handlePickCompany} onClear={() => { setCompanyPick(null); setSiretError(null) }} score={score.data ?? null} segment={segment} />
        )}

        {step === 3 && segment && (
          <ConfirmStep
            segment={segment}
            rnic={rnicPick}
            company={companyPick}
            score={score.data ?? null}
            scoreLoading={score.isPending}
            submitting={createCompte.isPending}
            error={siretError ?? (createCompte.isError ? (createCompte.error as Error).message : null)}
            onCreate={handleCreate}
          />
        )}

        <div className="mt-8 flex items-center justify-between border-t border-km-line pt-6">
          <Button variant="ghost" onClick={() => (step > 1 ? setStep(step - 1) : navigate('/comptes'))} disabled={createCompte.isPending}>
            <ArrowLeft className="h-4 w-4" /> {step > 1 ? 'Précédent' : 'Quitter'}
          </Button>
          {step === 2 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext || !!siretError}>
              Continuer <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────── Étape 2 : recherche RNIC (résidences) ────────────────

function RnicSearchStep({ picked, onPick }: { picked: RnicResult | null; onPick: (r: RnicResult) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<RnicResult[]>([])
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const handle = setTimeout(async () => {
      try {
        const r = await searchRnic(q, ctrl.signal)
        setResults(r)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { clearTimeout(handle); ctrl.abort() }
  }, [q])

  if (picked) {
    return (
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone="kiwi" className="mb-2"><CheckCircle2 className="h-3 w-3" /> Résidence sélectionnée</Badge>
            <p className="font-display text-lg font-bold text-km-text">{toUpperFR(picked.nom)}</p>
            {picked.adresse && <p className="text-sm text-km-muted">{toUpperFR(picked.adresse)} · {picked.codePostal} {toUpperFR(picked.ville ?? '')}</p>}
            {picked.nombreLots != null && <p className="mt-1 text-xs text-km-faint">{picked.nombreLots} lots · N° {picked.numero}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onPick(null as unknown as RnicResult)}>Changer</Button>
        </div>
      </Card>
    )
  }

  if (manual) return <RnicManualForm onCancel={() => setManual(false)} onSubmit={onPick} />

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold text-km-text">Recherche de la résidence</h2>
      <p className="mb-4 text-sm text-km-muted">Recherche par nom de résidence, adresse, ville ou numéro d'immatriculation (RNIC).</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex : Résidence Les Mimosas, 24 rue du Général Leclerc 77170…" className="h-12 pl-10" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-km-faint" />}
      </div>

      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-km-faint">Aucune résidence trouvée — essaie avec le nom, l'adresse ou la commune.</p>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((r) => (
            <button
              key={r.numero}
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-km-line bg-white p-4 text-left transition-all hover:border-kiwi-300 hover:shadow-sm"
            >
              <div>
                <p className="font-medium text-km-text">{toUpperFR(r.nom)}</p>
                <p className="mt-0.5 text-xs text-km-faint">N° {r.numero}</p>
                {(r.adresse || r.ville) && <p className="mt-1 flex items-center gap-1 text-xs text-km-muted"><MapPin className="h-3 w-3" /> {r.adresse} · {r.codePostal} {r.ville}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-km-muted">
                  {r.nombreLots != null && <Badge tone="neutral">{r.nombreLots} lots</Badge>}
                  {r.typeSyndic && <Badge tone="neutral">{r.typeSyndic}</Badge>}
                  {r.mandatEnCours === false && <Badge tone="amber">Pas de mandat en cours</Badge>}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-km-faint" />
            </button>
          ))}
        </div>
      )}

      <ManualEntryCTA label="La résidence n'apparaît pas ?" onClick={() => setManual(true)} />
    </div>
  )
}

function RnicManualForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (r: RnicResult) => void }) {
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [codePostal, setCodePostal] = useState('')
  const [ville, setVille] = useState('')
  const canSubmit = nom.trim().length >= 2

  return (
    <Card className="border-dashed p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium text-km-text"><PencilLine className="h-4 w-4" /> Saisie manuelle d'une résidence</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>Annuler</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Nom de la résidence *</Label>
          <Input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : Résidence Les Mimosas" />
        </div>
        <div className="sm:col-span-2">
          <Label>Adresse</Label>
          <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="ex : 24 rue du Général Leclerc" />
        </div>
        <div>
          <Label>Code postal</Label>
          <Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} maxLength={5} />
        </div>
        <div>
          <Label>Ville</Label>
          <Input value={ville} onChange={(e) => setVille(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!canSubmit}
          onClick={() => onSubmit({
            numero: `MANUEL-${Date.now()}`, nom: nom.trim(), adresse: adresse.trim() || null, codePostal: codePostal.trim() || null,
            ville: ville.trim() || null, nombreLots: null, nombreLotsHabitation: null, nombreLotsCommerces: null, nombreLotsStationnement: null,
            dateCreation: null, periodeConstruction: null, typeSyndic: null, syndicNom: null, mandatEnCours: null, dateFinMandat: null,
          })}
        >
          Utiliser ces informations <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}

// ──────────────── Étape 2 : recherche entreprise ────────────────

/** Titre de l'étape 2 selon le sous-type choisi -- Tools adapte le libellé (« Recherche du
 * cabinet de syndic », etc.) au lieu d'un titre générique. */
const TITRE_RECHERCHE: Record<string, string> = {
  'Syndic professionnel': 'Recherche du cabinet de syndic',
  Entreprise: "Recherche de l'entreprise",
  Partenaire: 'Recherche du partenaire',
  Courtier: 'Recherche du courtier',
  Fournisseur: 'Recherche du fournisseur',
}

function CompanySearchStep({
  picked, checkingSiret, siretError, onPick, onClear, score, segment,
}: {
  picked: CompanyResult | null
  checkingSiret: boolean
  siretError: string | null
  onPick: (c: CompanyResult) => void
  onClear: () => void
  score: EllisphereScore | null
  segment: string
}) {
  const titreRecherche = TITRE_RECHERCHE[segment] ?? "Recherche de l'entreprise"
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CompanyResult[]>([])
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed.length < 2) { setResults([]); return }
    setLoading(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const handle = setTimeout(async () => {
      try {
        const r = await searchCompanies(trimmed, ctrl.signal)
        setResults(r)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => { clearTimeout(handle); ctrl.abort() }
  }, [q])

  if (picked) {
    return (
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <Badge tone="kiwi"><CheckCircle2 className="h-3 w-3" /> Société sélectionnée</Badge>
          <Button variant="ghost" size="sm" onClick={onClear}>Changer</Button>
        </div>
        <p className="font-display text-lg font-bold text-km-text">{toUpperFR(picked.raisonSociale || picked.nomComplet)}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Blocs calqués sur Tools, vérifiés en direct le 05/08/2026 : tous conditionnels
              (n'apparaissent que si la donnée existe), et « Catégorie » = « Siège social »
              (type d'établissement), PAS la catégorie d'entreprise PME/ETI/GE. */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-km-faint">Identité légale</p>
            <div className="space-y-0.5 text-sm text-km-text">
              <p><span className="text-km-faint">Raison sociale :</span> <span className="font-medium">{toUpperFR(picked.raisonSociale || picked.nomComplet)}</span></p>
              {picked.siret && <p><span className="text-km-faint">SIRET :</span> {picked.siret}</p>}
              <p><span className="text-km-faint">SIREN :</span> {picked.siren}</p>
              {picked.etatAdministratif && <p><span className="text-km-faint">Statut :</span> <span className={picked.etatAdministratif === 'Actif' ? 'font-medium text-km-green' : 'text-km-muted'}>{picked.etatAdministratif}</span></p>}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-km-faint">Adresse du siège</p>
            <p className="text-sm text-km-text">{(picked.street || picked.city) ? <>{toUpperFR(picked.street ?? '')}<br />{picked.postalCode} {toUpperFR(picked.city ?? '')}</> : '—'}</p>
          </div>
          {(picked.codeApe || picked.libelleApe) && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-km-faint">Activité</p>
              <div className="space-y-0.5 text-sm text-km-text">
                {picked.codeApe && <p><span className="text-km-faint">Code APE / NAF :</span> {picked.codeApe}</p>}
                {picked.libelleApe && <p>{picked.libelleApe}</p>}
              </div>
            </div>
          )}
          {(picked.dirigeant || picked.estSiege) && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-km-faint">Direction &amp; taille</p>
              <div className="space-y-0.5 text-sm text-km-text">
                {picked.dirigeant && <p><span className="text-km-faint">Dirigeant :</span> <span className="font-medium">{picked.dirigeant}</span></p>}
                {picked.estSiege && <p><span className="text-km-faint">Catégorie :</span> Siège social</p>}
              </div>
            </div>
          )}
          {/* Tools affiche aussi « Avis crédit » et une ligne d'alerte « Points faibles : ... » ici,
              mais notre client Ellisphere (api/ellisphere/_client.ts) n'extrait que score + scale
              de la réponse XML -- à enrichir côté API pour aller plus loin. */}
          {score?.score && (
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-km-faint">Score Ellisphere</p>
              <p className="text-sm text-km-text">
                <span className="text-km-faint">Score :</span> <span className="font-medium">{score.score}{score.scale ? ` / ${score.scale}` : ''}</span>
              </p>
            </div>
          )}
        </div>
        {checkingSiret && <p className="mt-3 flex items-center gap-2 text-xs text-km-faint"><Loader2 className="h-3 w-3 animate-spin" /> Vérification du SIRET…</p>}
        {siretError && <p className="mt-3 rounded-lg bg-km-red-soft px-3 py-2 text-xs text-red-700">{siretError}</p>}
      </Card>
    )
  }

  if (manual) return <CompanyManualForm onCancel={() => setManual(false)} onSubmit={onPick} />

  return (
    <div>
      {/* Titre dynamique selon le type choisi, comme Tools (« Recherche du cabinet de syndic »
          pour un syndic pro, « Recherche du fournisseur » pour un fournisseur, etc.). */}
      <h2 className="mb-1 font-display text-xl font-bold text-km-text">{titreRecherche}</h2>
      <p className="mb-4 text-sm text-km-muted">Tape un nom, un SIREN ou un SIRET — les résultats Ellisphere s'affichent automatiquement.</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex : Dupont Immobilier, 552081317, 75001…" className="h-12 pl-10" />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-km-faint" />}
      </div>

      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-km-faint">Société introuvable — essaie avec le SIRET, le SIREN ou le nom exact.</p>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-km-faint">{results.length} société{results.length > 1 ? 's' : ''} trouvée{results.length > 1 ? 's' : ''}</p>
          {results.map((c) => (
            <button
              key={c.siret ?? c.siren}
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-km-line bg-white p-4 text-left transition-all hover:border-kiwi-300 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-km-text">{toUpperFR(c.raisonSociale || c.nomComplet)}</p>
                  {c.etatAdministratif && <Badge tone={c.etatAdministratif === 'Actif' ? 'kiwi' : 'neutral'}>{c.etatAdministratif}</Badge>}
                </div>
                {c.siret && <p className="mt-0.5 font-mono text-[11px] text-km-faint">SIRET {c.siret}</p>}
                {(c.street || c.city) && <p className="mt-1 flex items-center gap-1 text-xs text-km-muted"><MapPin className="h-3 w-3" /> {c.street}, {c.postalCode} {c.city}</p>}
                {/* Badges comme Tools : dirigeant, puis code APE + libellé GROUPÉS, puis
                    « Siège social » quand l'établissement retenu est le siège. */}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-km-muted">
                  {c.dirigeant && <Badge tone="neutral"><Users className="h-3 w-3" /> {c.dirigeant}</Badge>}
                  {(c.codeApe || c.libelleApe) && <Badge tone="neutral">{[c.codeApe, c.libelleApe].filter(Boolean).join(' ')}</Badge>}
                  {c.estSiege && <Badge tone="amber">Siège social</Badge>}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-km-faint" />
            </button>
          ))}
        </div>
      )}

      <ManualEntryCTA label="La société n'apparaît pas ?" onClick={() => setManual(true)} />
    </div>
  )
}

function CompanyManualForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (c: CompanyResult) => void }) {
  const [nom, setNom] = useState('')
  const [siret, setSiret] = useState('')
  const [siren, setSiren] = useState('')
  const [street, setStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [codeApe, setCodeApe] = useState('')
  const [libelleApe, setLibelleApe] = useState('')

  const sirenComputed = useMemo(() => {
    if (siren.trim()) return siren.trim()
    const digits = siret.replace(/\D/g, '')
    return digits.length >= 9 ? digits.slice(0, 9) : ''
  }, [siret, siren])

  const canSubmit = nom.trim().length >= 2 && sirenComputed.length >= 9

  return (
    <Card className="border-dashed p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 font-medium text-km-text"><PencilLine className="h-4 w-4" /> Saisie manuelle d'une société</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>Annuler</Button>
      </div>
      <p className="mb-4 text-xs text-km-muted">Renseigne au minimum la raison sociale et le SIREN (ou SIRET).</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Raison sociale *</Label>
          <Input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : Dupont Immobilier" />
        </div>
        <div>
          <Label>SIRET</Label>
          <Input value={siret} onChange={(e) => setSiret(e.target.value.replace(/\s/g, ''))} maxLength={14} inputMode="numeric" />
        </div>
        <div>
          <Label>SIREN {siren ? '' : '(auto)'} *</Label>
          <Input value={siren || sirenComputed} onChange={(e) => setSiren(e.target.value.replace(/\s/g, ''))} maxLength={9} inputMode="numeric" />
        </div>
        <div className="sm:col-span-2">
          <Label>Adresse</Label>
          <Input value={street} onChange={(e) => setStreet(e.target.value)} />
        </div>
        <div>
          <Label>Code postal</Label>
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={5} inputMode="numeric" />
        </div>
        <div>
          <Label>Ville</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <Label>Code APE / NAF</Label>
          <Input value={codeApe} onChange={(e) => setCodeApe(e.target.value)} placeholder="6832A" />
        </div>
        <div>
          <Label>Libellé activité</Label>
          <Input value={libelleApe} onChange={(e) => setLibelleApe(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!canSubmit}
          onClick={() => onSubmit({
            siren: sirenComputed, siret: siret.trim() || null, nomComplet: nom.trim(), raisonSociale: nom.trim(), dirigeant: null,
            codeApe: codeApe.trim() || null, libelleApe: libelleApe.trim() || null, etatAdministratif: 'Actif',
            street: street.trim() || null, city: city.trim() || null, postalCode: postalCode.trim() || null, formeJuridique: null, dateCreation: null,
            categorieEntreprise: null, trancheEffectifSalarie: null, estSiege: false,
          })}
        >
          Utiliser ces informations <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}

function ManualEntryCTA({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-dashed border-km-line bg-km-bg/50 p-4">
      <div>
        <p className="text-sm font-medium text-km-text">{label}</p>
        <p className="text-xs text-km-faint">Tu peux renseigner les informations toi-même.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}><PencilLine className="h-3.5 w-3.5" /> Saisie manuelle</Button>
    </div>
  )
}

// ──────────────── Étape 3 : confirmation ────────────────

function ConfirmStep({
  segment, rnic, company, score, scoreLoading, submitting, error, onCreate,
}: {
  segment: Segment
  rnic: RnicResult | null
  company: CompanyResult | null
  score: { score: string | null; scale: string | null } | null
  scoreLoading: boolean
  submitting: boolean
  error: string | null
  onCreate: () => void
}) {
  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-bold text-km-text">Vérifie les informations</h2>
      <p className="mb-4 text-sm text-km-muted">Le nom et l'adresse seront enregistrés en MAJUSCULES.</p>

      <Card className="mb-4 p-5">
        <Badge tone="neutral" className="mb-3">{segment}</Badge>
        {rnic && (
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-km-text">{toUpperFR(rnic.nom)}</p>
            {rnic.adresse && <p className="text-km-muted">{toUpperFR(rnic.adresse)}</p>}
            <p className="text-km-muted">{rnic.codePostal} {toUpperFR(rnic.ville ?? '')} · FRANCE</p>
          </div>
        )}
        {company && (
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-km-text">{toUpperFR(company.raisonSociale || company.nomComplet)}</p>
            {company.street && <p className="text-km-muted">{toUpperFR(company.street)}</p>}
            <p className="text-km-muted">{company.postalCode} {toUpperFR(company.city ?? '')} · FRANCE</p>
            {company.siret && <p className="text-km-muted">SIRET : {company.siret}</p>}
            {company.siren && <p className="text-km-muted">SIREN : {company.siren}</p>}
            {company.libelleApe && <p className="text-km-muted">Activité : {company.codeApe} {company.libelleApe}</p>}
          </div>
        )}
      </Card>

      {company && (scoreLoading || score) && (
        <Card className="mb-4 p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-km-faint">
            <Award className="h-3.5 w-3.5" /> Score de solvabilité Ellisphere
          </p>
          {scoreLoading ? (
            <p className="flex items-center gap-2 text-sm text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Récupération…</p>
          ) : score?.score ? (
            <p className="text-2xl font-bold text-km-green">{score.score}{score.scale && ` / ${score.scale}`}</p>
          ) : (
            <p className="text-sm text-km-faint">Aucun score disponible pour cette entreprise pour le moment.</p>
          )}
        </Card>
      )}

      {error && <p className="mb-4 rounded-lg bg-km-red-soft px-3 py-2 text-sm text-red-700">{error}</p>}

      <Button size="default" className="w-full" onClick={onCreate} disabled={submitting}>
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Création en cours…</> : <>Créer ce compte <ArrowRight className="h-4 w-4" /></>}
      </Button>
    </div>
  )
}

// ──────────────── Étape 4 : que faire maintenant ────────────────

function NextStepScreen({
  compte,
  navigate,
  onFinish,
}: {
  compte: { id: string; nom: string; segment: string }
  navigate: ReturnType<typeof useNavigate>
  onFinish: () => void
}) {
  const [contactSheetOpen, setContactSheetOpen] = useState(false)
  const [pdlMethodOpen, setPdlMethodOpen] = useState(false)
  const [contactsAjoutes, setContactsAjoutes] = useState<Contact[]>([])

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-kiwi-200 bg-kiwi-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-km-green text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display font-semibold text-km-text">Compte créé avec succès</p>
          <p className="text-sm text-km-muted">{compte.nom}</p>
        </div>
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-km-faint">Que souhaites-tu faire maintenant ?</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setContactSheetOpen(true)}
          className="flex items-start gap-3 rounded-xl border border-km-line bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-kiwi-300 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <UserPlus className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium text-km-text">Ajouter un contact</span>
            <span className="block text-xs text-km-muted">Décisionnaire, gestionnaire…</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPdlMethodOpen(true)}
          className="flex items-start gap-3 rounded-xl border border-km-line bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-kiwi-300 hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Zap className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-medium text-km-text">Ajouter un point de livraison</span>
            <span className="block text-xs text-km-muted">Extraction de facture, manuel…</span>
          </span>
        </button>
      </div>

      {contactsAjoutes.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-km-faint">Ajoutés au dossier ({contactsAjoutes.length})</p>
          <div className="divide-y divide-km-line rounded-xl border border-km-line bg-white">
            {contactsAjoutes.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-semibold text-violet-600">
                  {`${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-km-text">{c.prenom} {c.nom}</p>
                  {c.fonction && <p className="truncate text-xs text-km-muted">{c.fonction}</p>}
                </div>
                <a href={`/contacts/${c.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-km-green hover:underline">
                  Voir la fiche <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-between border-t border-km-line pt-6">
        <Button variant="ghost" onClick={() => { onFinish(); navigate('/comptes') }}>Terminer la session</Button>
        <Button variant="outline" onClick={() => { onFinish(); navigate(`/comptes/${compte.id}`) }}>
          Voir la fiche compte <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Choix de la méthode PDL, comme Tools -- puis on rejoint la fiche compte qui ouvre le
          formulaire (la saisie du PDL elle-même n'est jamais inline, même dans Tools). */}
      <PdlMethodSheet
        open={pdlMethodOpen}
        onClose={() => setPdlMethodOpen(false)}
        compteNom={compte.nom}
        onChoose={() => navigate(`/comptes/${compte.id}?action=ajouter-compteur`)}
      />

      <Sheet
        open={contactSheetOpen}
        onClose={() => setContactSheetOpen(false)}
        title="Ajouter un contact"
        description={`Rattaché à ${compte.nom}`}
      >
        <ContactForm
          compteId={compte.id}
          compteNom={compte.nom}
          segment={compte.segment}
          onCancel={() => setContactSheetOpen(false)}
          onCreated={(contact) => {
            setContactsAjoutes((prev) => [...prev, contact])
            setContactSheetOpen(false)
          }}
        />
      </Sheet>
    </div>
  )
}
