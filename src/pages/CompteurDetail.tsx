import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Plus, Trash2, Building2, MapPin, FileCheck2, FileText, RefreshCw } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { EntityLink } from '@/components/ui/entity-link'
import { useCompteur, useDeleteCompteur, useSyncCompteurElec, useSyncCompteurGaz, useUpdateCompteurField } from '@/lib/data/compteurs'
import { useEnedisFetch } from '@/lib/data/enedis'
import { useGrdFetch } from '@/lib/data/grd'
import { useConsommations, useCreateConsommation } from '@/lib/data/consommations'
import { useSite } from '@/lib/data/sites'
import { useQualiteCompteur, ligneDuBareme, type QualiteCompteur } from '@/lib/data/qualiteCompte'
import { HeroQualiteCompteur } from '@/components/compte/HerosCompte'
import { useCompte } from '@/lib/data/comptes'
import { InlineField } from '@/components/ui/inline-field'
import { useContacts } from '@/lib/data/contacts'
import { useContrats } from '@/lib/data/contrats'
import { natureEcheance } from '@/lib/echeance'
import { BadgeEcheance } from '@/components/compteur/BadgeEcheance'
import { useMandats } from '@/lib/data/mandats'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE, FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { useCanManageEnregistrement, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import type { Compteur, Consommation } from '@/types/domain'

const POSTE_OPTIONS = ['TOTAL', 'HP', 'HC', 'POINTE', 'HPH', 'HCH', 'HPE', 'HCE']
const TYPE_VALEUR_OPTIONS = ['MESUREE', 'ESTIMEE', 'CORRIGEE']

type TabKey = 'apercu' | 'rattachements' | 'contrats' | 'mandats' | 'fichiers'

function AddConsommationDialog({ compteurId, open, onClose }: { compteurId: string; open: boolean; onClose: () => void }) {
  const createConsommation = useCreateConsommation()
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [quantite, setQuantite] = useState('')
  const [unite, setUnite] = useState('MWh')
  const [posteTarifaire, setPosteTarifaire] = useState('TOTAL')
  const [typeValeur, setTypeValeur] = useState('MESUREE')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setDateDebut('')
    setDateFin('')
    setQuantite('')
    setUnite('MWh')
    setPosteTarifaire('TOTAL')
    setTypeValeur('MESUREE')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await createConsommation.mutateAsync({
      compteur_id: compteurId,
      date_debut_periode: dateDebut,
      date_fin_periode: dateFin,
      quantite: parseFloat(quantite),
      unite,
      poste_tarifaire: posteTarifaire,
      type_valeur: typeValeur,
      source: 'Saisie manuelle',
      commentaire: null,
    })
    setFeedback(result.persisted ? 'Période ajoutée.' : 'Ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter une période de consommation" description="Enregistrer un relevé pour ce compteur.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Début de période">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
          </FormField>
          <FormField label="Fin de période">
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quantité">
            <Input type="number" step="0.001" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
          </FormField>
          <FormField label="Unité">
            <Input value={unite} onChange={(e) => setUnite(e.target.value)} required />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Poste tarifaire">
            <Select value={posteTarifaire} onChange={(e) => setPosteTarifaire(e.target.value)}>
              {POSTE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </FormField>
          <FormField label="Type de valeur">
            <Select value={typeValeur} onChange={(e) => setTypeValeur(e.target.value)}>
              {TYPE_VALEUR_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
        </div>
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createConsommation.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * ══ LE SCORE DU COMPTEUR, ET LE CALCUL QUI LE PRODUIT ══════════════════════════════════════════
 *
 * Naoëlle, 02/09/2026 : « affiche le score des compteurs sur les fiches compteurs avec le calcul
 * qu'a donné Michel, comme ça je peux vérifier si la moyenne est bonne dans l'onglet synthèse. »
 *
 * ══ POURQUOI LES TROIS FAITS, ET PAS SEULEMENT LE CHIFFRE ══
 *
 * Un « 30/100 » seul ne se vérifie pas : il faut savoir CE QUI a été regardé. Le barème de Michel
 * ne pose que trois questions — contrat en cours, échéance à venir, responsable — et la carte les
 * montre dans cet ordre, avec la ligne du barème qui en découle. On peut donc remonter d'un score
 * de compte à la moyenne, de la moyenne à chaque compteur, et de chaque compteur à un fait
 * vérifiable sur cette même fiche.
 *
 * ══ L'ÉCHÉANCE N'EST PAS TOUJOURS REGARDÉE, ET LA CARTE LE DIT ══
 *
 * Sous contrat, le barème s'arrête à la première ligne : l'échéance ne change plus rien. La griser
 * évite de faire chercher pourquoi une échéance dépassée ne coûte rien à un compteur bien tenu.
 *
 * Les six lignes affichées sont celles de son message, mot pour mot — le tableau sert de preuve
 * autant que d'explication, et c'est ce que Naoëlle est venue vérifier.
 */
const BAREME: { libelle: string; points: number }[] = [
  { libelle: 'Contrat + responsable', points: 100 },
  { libelle: 'Contrat + sans responsable', points: 70 },
  { libelle: 'Sans contrat + échéance future + responsable', points: 80 },
  { libelle: 'Sans contrat + échéance future + sans responsable', points: 50 },
  { libelle: 'Sans contrat + échéance absente ou dépassée + responsable', points: 30 },
  { libelle: 'Sans contrat + échéance absente ou dépassée + sans responsable', points: 0 },
]

function ScoreQualiteCard({ q }: { q: QualiteCompteur }) {
  const [detail, setDetail] = useState(false)
  const ligne = ligneDuBareme(q)

  const faits: { libelle: string; vrai: boolean; precision?: string; ignore?: boolean }[] = [
    { libelle: 'Contrat en cours', vrai: q.a_contrat },
    {
      libelle: 'Échéance à venir',
      vrai: q.echeance_future,
      precision: q.date_echeance
        ? new Date(q.date_echeance).toLocaleDateString('fr-FR')
        : 'aucune échéance',
      // Sous contrat, la première ligne du barème gagne : l'échéance n'entre plus dans le calcul.
      ignore: q.a_contrat,
    },
    { libelle: 'Responsable', vrai: q.a_responsable, precision: q.responsable_nom || undefined },
  ]

  return (
    <div className="rounded-xl border border-km-line bg-white p-3.5">
      {/* Le chiffre et sa couleur sont portés par le héros à gauche : le répéter ici en ferait
          deux affirmations à rapprocher plutôt qu'une seule à lire. Cette carte explique. */}
      <p className="mb-2.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">
        Ce que le barème a regardé
      </p>

      <div className="flex flex-col gap-1.5">
        {faits.map((f) => (
          <div
            key={f.libelle}
            className={cn(
              'flex items-center justify-between rounded-lg border border-navy-50 bg-km-bg/60 px-2 py-1.5',
              f.ignore && 'opacity-45',
            )}
          >
            <span className="text-km-label font-semibold text-km-text">
              {f.libelle}
              {f.ignore && <span className="ml-1 font-normal text-km-faint">· non regardée</span>}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-km-tiny font-bold',
                f.ignore ? 'bg-km-soft text-km-muted' : f.vrai ? 'bg-kiwi-50 text-km-green' : 'bg-red-100 text-km-red',
              )}
            >
              {f.vrai ? f.precision ?? 'Oui' : f.precision ?? 'Non'}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-km-tiny italic text-km-faint">
        {ligne} = {q.score}
      </p>

      {/* LE BARÈME ENTIER SE DÉPLIE. Vérifier une moyenne, c'est comparer un compteur aux cinq
          autres cas possibles : les cacher obligerait à ouvrir un autre écran au moment précis où
          l'on doute. Replié par défaut, parce qu'on ne doute pas à chaque visite. */}
      <button
        type="button"
        onClick={() => setDetail((d) => !d)}
        className="mt-1 text-km-tiny font-bold text-km-green hover:underline"
      >
        {detail ? 'Masquer le barème' : 'Voir le barème complet'}
      </button>
      {detail && (
        <div className="mt-1.5 flex flex-col gap-0.5 border-t border-km-line-soft pt-1.5">
          {BAREME.map((b) => (
            <div
              key={b.libelle}
              className={cn(
                'flex items-baseline justify-between gap-2 text-km-tiny',
                b.libelle === ligne ? 'font-bold text-km-text' : 'text-km-faint',
              )}
            >
              <span className="min-w-0 flex-1">{b.libelle}</span>
              <span className="font-mono tabular-nums">{b.points}</span>
            </div>
          ))}
          <p className="mt-1 text-km-tiny italic text-km-faint">
            Le score d'un compte est la moyenne des scores de ses compteurs.
          </p>
        </div>
      )}
    </div>
  )
}

/* La couverture comptait quatre lignes ; « Signaux » a été retirée le 02/09/2026 avec le sujet
   (voir `cycleNavItems`). Le score passe donc sur trois, et c'est plus juste : « aucun signal
   ouvert » comptait comme un point de couverture alors que ça ne couvre rien — c'était une absence
   de mauvaise nouvelle, pas une protection. Les trois qui restent — mandat, reco, contrat — sont
   bien des choses qu'on met en place. */
function CouvertureCard({
  mandatCouvert,
  recoEnCours,
  contratCouvert,
  onMandat,
  onReco,
  onContrat,
}: {
  mandatCouvert: boolean
  recoEnCours: boolean
  contratCouvert: boolean
  onMandat?: () => void
  onReco?: () => void
  onContrat?: () => void
}) {
  const items = [
    { lbl: 'Mandat', ok: mandatCouvert, val: mandatCouvert ? 'Couvert ✓' : 'Non couvert', onClick: mandatCouvert ? onMandat : undefined },
    { lbl: 'Reco', ok: true, warn: recoEnCours, val: recoEnCours ? 'En cours' : 'Aucune', onClick: recoEnCours ? onReco : undefined },
    { lbl: 'Contrat', ok: contratCouvert, val: contratCouvert ? 'Couvert ✓' : 'Aucun', onClick: contratCouvert ? onContrat : undefined },
  ]
  const score = items.filter((i) => i.ok).length
  return (
    <div className="rounded-xl border border-km-line bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Couverture</span>
        <div className="flex-1" />
        <span className={cn('rounded px-1.5 py-0.5 font-mono text-km-xs font-bold', score === items.length ? 'bg-kiwi-50 text-km-green' : 'bg-km-amber-soft text-amber-700')}>
          {score}/{items.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <div
            key={it.lbl}
            onClick={it.onClick}
            className={cn(
              'flex items-center justify-between rounded-lg border border-navy-50 bg-km-bg/60 px-2 py-1.5',
              it.onClick && 'cursor-pointer hover:bg-km-soft/60',
            )}
          >
            <span className="text-km-label font-semibold text-km-text">{it.lbl}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-km-tiny font-bold',
                !it.ok ? 'bg-red-100 text-km-red' : it.warn ? 'bg-km-amber-soft text-amber-700' : 'bg-kiwi-50 text-km-green',
              )}
            >
              {it.val}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * « POSTES HORAIRES — CONSO & PUISSANCE » de la maquette de William.
 *
 * Les données existaient déjà en base (`compteurs_electricite.conso_*_mwh` et `puissance_*_kva`,
 * remontées par le hook dans `consoParClasseMwh` / `puissanceParClasseKva`) mais n'étaient
 * affichées nulle part : le conseiller voyait la consommation totale sans savoir comment elle se
 * répartissait, alors que c'est précisément là que se joue l'optimisation.
 *
 * Le design annonce « optimisation ≈ 640 €/an » sous le dépassement de puissance. Ce chiffre
 * suppose les coefficients TURPE, qui ne sont pas encore branchés (tâche « étude TURPE
 * automatique »). On affiche donc l'écart réel en kVA — un fait — sans inventer l'euro, comme
 * pour la frise PEG/BASE.
 */
const ORDRE_POSTES = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'HP', 'HC', 'BASE'] as const

function PostesHorairesCard({ compteur }: { compteur: Compteur }) {
  const conso = compteur.consoParClasseMwh ?? {}
  const puissances = compteur.puissanceParClasseKva ?? {}

  // Un poste est affiché s'il porte une conso OU une puissance : sur un C5 en Base, sept des huit
  // classes sont vides et les afficher ne dirait rien.
  const postes = ORDRE_POSTES.filter((p) => conso[p] != null || puissances[p] != null)
  if (postes.length === 0) return null

  const consoMax = Math.max(...postes.map((p) => conso[p] ?? 0), 0)
  const valeursPuissance = postes.map((p) => puissances[p]).filter((v): v is number => v != null)
  const puissanceMaxAtteinte = valeursPuissance.length > 0 ? Math.max(...valeursPuissance) : null

  return (
    <div className="rounded-xl border border-km-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Postes horaires — conso &amp; puissance</span>
        {puissanceMaxAtteinte != null && (
          <span className="ml-auto font-mono text-km-xs text-km-faint">
            Max atteint : {puissanceMaxAtteinte.toLocaleString('fr-FR')} kVA
          </span>
        )}
      </div>

      <div className="space-y-2">
        {postes.map((poste) => {
          const mwh = conso[poste]
          const kva = puissances[poste]
          return (
            <div key={poste} className="flex items-center gap-3">
              <span className="w-14 shrink-0 font-mono text-km-xs font-bold text-km-muted">{poste}</span>
              <div className="h-2.5 flex-1 rounded-full bg-km-soft">
                {mwh != null && consoMax > 0 && (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-kiwi-500 to-kiwi-400"
                    style={{ width: `${Math.max(2, (mwh / consoMax) * 100)}%` }}
                  />
                )}
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-km-label font-semibold text-km-text">
                {mwh != null ? `${mwh.toLocaleString('fr-FR')} MWh` : '—'}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-km-label text-km-muted">
                {kva != null ? `${kva.toLocaleString('fr-FR')} kVA` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConsommationChart({ consommations }: { consommations: Consommation[] }) {
  const sorted = useMemo(
    () => [...consommations].sort((a, b) => new Date(a.date_debut_periode).getTime() - new Date(b.date_debut_periode).getTime()),
    [consommations],
  )
  const max = Math.max(...sorted.map((c) => c.quantite), 1)
  const postesUniques = [...new Set(sorted.map((c) => c.poste_tarifaire))]
  const palette = ['bg-kiwi-500', 'bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-navy-500']
  const posteColor = (poste: string) => palette[postesUniques.indexOf(poste) % palette.length]

  return (
    <div className="rounded-xl border border-km-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Consommation</span>
        <span className="rounded bg-km-soft px-1.5 py-0.5 text-km-tiny font-bold text-km-muted">{sorted[0]?.unite ?? 'MWh'}</span>
        {postesUniques.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-2.5">
            {postesUniques.map((p) => (
              <span key={p} className="flex items-center gap-1 text-km-xs text-km-muted">
                <span className={cn('h-2 w-2 rounded-sm', posteColor(p))} />
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: 140 }}>
        {sorted.map((c) => (
          <div key={c.id} className="flex min-w-[28px] flex-1 flex-col items-center gap-1.5" title={`${c.quantite} ${c.unite} · ${c.poste_tarifaire} · ${c.type_valeur}`}>
            <span className="text-km-tiny font-semibold text-km-muted">{c.quantite}</span>
            <div className="flex w-full flex-1 items-end">
              <div className={cn('w-full rounded-t', posteColor(c.poste_tarifaire), c.type_valeur !== 'MESUREE' && 'opacity-60')} style={{ height: `${Math.max(6, (c.quantite / max) * 100)}%` }} />
            </div>
            <span className="whitespace-nowrap text-km-tiny text-km-faint">
              {new Date(c.date_debut_periode).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CompteurDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: compteur } = useCompteur(id)
  const { data: consommations } = useConsommations()
  // Le site et le compte sont lus PAR IDENTIFIANT, pas cherches dans la liste complete.
  // La fiche telechargeait les 6356 sites et les 2762 comptes pour afficher deux lignes de fil
  // d'Ariane ; sur un poste lent la hierarchie restait vide le temps que tout arrive, et on
  // voyait un compteur sans compte ni site au-dessus (constate en production le 16/08/2026).
  const { data: siteDuCompteur } = useSite(compteur?.site_id)
  const { data: compteDuCompteur } = useCompte(siteDuCompteur?.compte_id)
  const { data: contrats } = useContrats()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandationsListe()
  // Le score du compteur, lu dans la vue que le compte moyenne — voir `ScoreQualiteCard`.
  const { data: qualite } = useQualiteCompteur(id)
  const { data: documents } = useDocuments()
  const { data: statutsContratsRef } = useReferenceTable('statuts_contrats')
  const statutsContrats = statutsContratsRef && statutsContratsRef.length > 0 ? statutsContratsRef : FALLBACK_STATUTS_CONTRATS
  const { data: statutsMandatsRef } = useReferenceTable('statuts_mandats')
  const statutsMandats = statutsMandatsRef && statutsMandatsRef.length > 0 ? statutsMandatsRef : FALLBACK_STATUTS_MANDATS
  const { data: typesUtilisation } = useReferenceTable('types_utilisations_compteur')
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const consommationsDuCompteur = useMemo(() => consommations?.filter((c) => c.compteur_id === id) ?? [], [consommations, id])
  const site = siteDuCompteur ?? undefined
  const compte = compteDuCompteur ?? undefined
  const contratsDuCompteur = useMemo(() => contrats?.filter((ct) => ct.compteurs.some((cc) => cc.id === id)) ?? [], [contrats, id])
  const mandatDuCompteur = mandats?.find((m) => compteur && m.site_ids.includes(compteur.site_id))
  const documentsDuCompteur = useMemo(() => documents?.filter((d) => d.entite_type === 'compteur' && d.entite_id === id) ?? [], [documents, id])
  // Prouvée ou estimée : diapositive 6 de Michel. La preuve est le contrat rattaché, donc elle se
  // déduit ici et ne se stocke nulle part — voir src/lib/echeance.ts.
  const echeance = useMemo(
    () => natureEcheance(compteur?.date_echeance, contratsDuCompteur),
    [compteur?.date_echeance, contratsDuCompteur],
  )
  const recoActiveDuSite = useMemo(
    () => recommandations?.find((r) => compteur && r.sites.some((s) => s.id === compteur.site_id) && !['ACCEPTEE', 'REFUSEE', 'ABANDONNEE'].includes(r.etape)),
    [recommandations, compteur],
  )

  const [tab, setTab] = useState<TabKey>('apercu')
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const televerser = useTeleverserDocuments()

  const { data: typesDocsRef } = useReferenceTable('types_documents')

  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  // 7883 compteurs sur 7884 n'ont pas de propriétaire : useCanManage aurait réservé toute
  // modification aux administrateurs. Même motif que sur les contacts.
  const canManage = useCanManageEnregistrement(compteur?.proprietaire_id)

  // Les contacts proposés sont ceux du compte auquel appartient le site du compteur : proposer les
  // 3380 contacts de la base rendrait le choix inutilisable, et rattacher un compteur à un contact
  // d'un autre client n'a pas de sens.
  const { data: tousContacts } = useContacts()
  const contactsDuCompte = useMemo(
    () => (compte ? (tousContacts ?? []).filter((c) => c.comptes.some((l) => l.id === compte.id)) : []),
    [tousContacts, compte],
  )

  const majChampCompteur = useUpdateCompteurField()
  const [toast, setToast] = useState<string | null>(null)

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2600)
  }

  async function majCompteur(patch: Record<string, unknown>) {
    if (!compteur) return
    await majChampCompteur.mutateAsync({ id: compteur.id, patch })
  }
  const deleteCompteur = useDeleteCompteur()
  const goBack = useGoBack(compteur ? `/sites/${compteur.site_id}` : '/sites')
  const enedisFetch = useEnedisFetch()
  const syncCompteurElec = useSyncCompteurElec()
  const grdFetch = useGrdFetch()
  const syncCompteurGaz = useSyncCompteurGaz()
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null)

  const suppression = useSuppression()

  function handleDelete() {
    if (!compteur) return
    suppression.supprimer(
      () => deleteCompteur.mutateAsync(compteur.id),
      () => navigate(`/sites/${compteur.site_id}`),
    )
  }

  async function handleSyncEnedis() {
    if (!compteur) return
    setSyncFeedback(null)
    try {
      const result = await enedisFetch.mutateAsync(compteur.numero_pdl)
      if (!result.success) {
        setSyncFeedback(result.error ?? 'Échec de la synchronisation Enedis.')
        return
      }
      await syncCompteurElec.mutateAsync({ compteurId: compteur.id, result })
      setSyncFeedback('Synchronisation Enedis réussie.')
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : 'Échec de la synchronisation Enedis.')
    }
  }

  async function handleSyncGrd() {
    if (!compteur) return
    const codePostal = site?.code_postal
    if (!codePostal) {
      setSyncFeedback("Impossible de synchroniser : le site n'a pas de code postal renseigné.")
      return
    }
    setSyncFeedback(null)
    try {
      const result = await grdFetch.mutateAsync({ pce: compteur.numero_pdl, codePostal })
      if (!result.success) {
        setSyncFeedback(result.error ?? 'Échec de la synchronisation GRDF.')
        return
      }
      await syncCompteurGaz.mutateAsync({ compteurId: compteur.id, result })
      setSyncFeedback('Synchronisation GRDF réussie.')
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : 'Échec de la synchronisation GRDF.')
    }
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'apercu', label: 'Compteur' },
    /* La hiérarchie compte → site → compteur est une NAVIGATION, pas une liste d'objets :
       elle dit d'où l'on vient. Elle rejoint tout de même cet onglet, parce que c'est la même
       question — à quoi ce compteur est-il accroché (Michel et Naoëlle, 31/08/2026). */
    { key: 'rattachements', label: 'Rattachements' },
    { key: 'contrats', label: 'Contrats', badge: contratsDuCompteur.length ? String(contratsDuCompteur.length) : undefined },
    { key: 'mandats', label: 'Mandats', badge: mandatDuCompteur ? undefined : '!' },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuCompteur.length ? String(documentsDuCompteur.length) : undefined },
  ]

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  if (!compteur && id) {
    return (
      <div>
        <Topbar crumb="Sites" title="Compteur" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
      </div>
    )
  }

  if (!compteur) {
    return (
      <div>
        <Topbar crumb="Sites" title="Compteur" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour au site
          </Button>
          <p className="text-sm text-km-muted">Compteur introuvable.</p>
        </div>
      </div>
    )
  }

  const Icon = compteur.type_energie === 'electricite' ? Zap : Flame
  const energyClasses = compteur.type_energie === 'electricite' ? 'bg-sky-100 text-sky-500' : 'bg-km-amber-soft text-amber-600'

  return (
    <div>
      <Topbar crumb="Sites" title={`Compteur ${compteur.numero_pdl}`} />

      {/* Bandeau compteur */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour au site">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-km-text">{compteur.utilisation || compteur.numero_pdl}</p>
            <Badge tone={compteur.statut === 'actif' ? 'kiwi' : 'neutral'}>{compteur.statut}</Badge>
          </div>
          <p className="truncate font-mono text-xs text-km-faint">{compteur.numero_pdl}</p>
          <p className="truncate text-km-xs text-km-faint">
            {compteur.date_creation && <>Créé le {new Date(compteur.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {compteur.proprietaire_nom || 'Aucun'}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            {/* Plus de bouton « Modifier » : les champs s'editent dans « Détail du compteur ». */}
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-km-line bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          const badgeTone = t.key === 'mandats' ? 'bg-amber-200 text-amber-700' : 'bg-km-soft text-km-muted'
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-km-body font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-km-text'
                  : 'border border-km-line bg-white text-km-muted hover:bg-km-bg lg:border-0 lg:border-b-2 lg:border-transparent lg:text-km-muted lg:hover:bg-transparent lg:hover:text-km-text',
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-km-tiny font-bold', isActive ? 'bg-white/20 text-white lg:bg-km-soft lg:text-km-muted' : badgeTone)}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1">
        {/* Centre */}
        <div className="bg-km-bg p-4 sm:p-5">
          {/* La hiérarchie et les rattachements, sortis du volet gauche. */}
          {tab === 'rattachements' && (
            <div className="flex max-w-[560px] flex-col gap-3.5">
        <div className="rounded-xl border border-km-line bg-white p-3.5">
          <p className="mb-2 text-km-xs font-bold uppercase tracking-wide text-km-faint">Hiérarchie</p>
          <div className="flex flex-col gap-0.5">
            {compte && (
              <button type="button" onClick={() => navigate(`/comptes/${compte.id}`)} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-km-bg">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-500"><Building2 className="h-3 w-3" /></span>
                <span className="flex-1 truncate text-xs font-semibold text-km-text">{compte.nom}</span>
                <span className="text-km-faint">›</span>
              </button>
            )}
            <div className="ml-[22px] h-2 w-0.5 bg-km-soft" />
            {site && (
              <button type="button" onClick={() => navigate(`/sites/${site.id}`)} className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-km-bg">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-km-green-soft text-km-green"><MapPin className="h-3 w-3" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-km-text">{site.nom}</span>
                  {/* L'adresse du point de livraison, demandee le 15/08/2026 : « faire apparaitre
                      l'adresse sur l'objet compteur ». Elle vit sur le site, le compteur n'en
                      porte pas — on l'affiche donc ici, sous le site auquel il est rattache.
                      C'est aussi ce qui permet de voir d'un coup d'oeil qu'un PDL est range sous
                      le mauvais site, comme l'etait GI155378 avant le 13/08. */}
                  {[site.adresse, [site.code_postal, site.ville].filter(Boolean).join(' ')]
                    .filter((p) => p && p.trim())
                    .join(', ') && (
                    <span className="block truncate text-km-label text-km-faint">
                      {[site.adresse, [site.code_postal, site.ville].filter(Boolean).join(' ')]
                        .filter((p) => p && p.trim())
                        .join(', ')}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 text-km-faint">›</span>
              </button>
            )}
            <div className="ml-[22px] h-2 w-0.5 bg-km-soft" />
            <div className="flex items-center gap-2 rounded-lg bg-km-bg px-1.5 py-1.5">
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', energyClasses)}><Icon className="h-3 w-3" /></span>
              <span className="flex-1 truncate text-xs font-bold text-km-text">{compteur.utilisation || compteur.numero_pdl}</span>
            </div>
          </div>
        </div>

        {/* « LOCALISATION DANS LE SITE » et « ADRESSE DU COMPTEUR » de la maquette.
            Jusqu'ici la fiche ne pouvait afficher que l'adresse du SITE, faute de colonnes :
            faux dès qu'une copropriété a plusieurs entrées, et c'était le cas de GI155378.
            L'adresse du compteur reste vide par défaut — vide, celle du site fait foi, et la
            fiche le dit plutôt que de laisser croire à un oubli. */}
        <div className="rounded-xl border border-km-line bg-white p-3.5">
          <p className="mb-2 text-km-xs font-bold uppercase tracking-wide text-km-faint">Localisation dans le site</p>
          <InlineField
            variant="text"
            value={compteur.localisation_site ?? ''}
            emptyLabel="où le trouver sur place"
            disabled={!canManage}
            onCommit={(v) => majCompteur({ localisation_site: v.trim() || null })}
            onSaved={() => showToast('✓ enregistré')}
            onError={(e) => showToast(`Erreur : ${e.message}`)}
          />

          <p className="mb-2 mt-3.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">Adresse du compteur</p>
          <InlineField
            variant="address"
            label=""
            rue={compteur.adresse ?? ''}
            codePostal={compteur.code_postal ?? ''}
            ville={compteur.ville ?? ''}
            emptyLabel="préciser si différente du site"
            disabled={!canManage}
            onCommit={({ rue, codePostal, ville }) =>
              majCompteur({ adresse: rue || null, code_postal: codePostal || null, ville: ville || null })
            }
            onSaved={() => showToast('✓ enregistré')}
            onError={(e) => showToast(`Erreur : ${e.message}`)}
          />
          {!compteur.adresse && (
            <p className="mt-1.5 text-km-xs italic text-km-faint">
              Non renseignée — c'est l'adresse du site qui fait foi.
            </p>
          )}
        </div>

        <CouvertureCard
          mandatCouvert={Boolean(mandatDuCompteur)}
          recoEnCours={Boolean(recoActiveDuSite)}
          contratCouvert={contratsDuCompteur.length > 0}
          onMandat={() => setTab('mandats')}
          onReco={() => recoActiveDuSite && navigate(`/recommandations/${recoActiveDuSite.id}`)}
          onContrat={() => setTab('contrats')}
        />
            </div>
          )}

          {tab === 'apercu' && (
            <div className="flex flex-col gap-3.5">
              {/* ══ LE SCORE EN TÊTE DE FICHE ══
                  Naoëlle, 02/09/2026 : « comme la card de qualité de compte sur la page d'un
                  compte, sur 100, avec les codes couleur ». Même composant visuel, mêmes seuils :
                  le score d'un compte étant la moyenne de ceux-ci, les peindre autrement
                  obligerait à traduire d'un écran à l'autre pour vérifier une moyenne.

                  Il était d'abord posé dans l'onglet « Rattachements » — invisible depuis l'onglet
                  qu'on ouvre en arrivant, donc invisible tout court. */}
              {qualite && (
                <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                  <HeroQualiteCompteur
                    score={qualite.score}
                    ligneBareme={ligneDuBareme(qualite).toLowerCase()}
                  />
                  <ScoreQualiteCard q={qualite} />
                </div>
              )}
              {consommationsDuCompteur.length > 0 && <ConsommationChart consommations={consommationsDuCompteur} />}
              <PostesHorairesCard compteur={compteur} />
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <div className="rounded-xl border border-km-line bg-white p-4">
                <p className="mb-2.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">Détail du compteur</p>
                <div className="space-y-1.5 text-xs text-km-text">
                  <p><span className="text-km-faint">Type d'énergie :</span> {compteur.type_energie === 'electricite' ? 'Électricité' : 'Gaz'}</p>
                  {/* Edition en place, comme partout ailleurs depuis le 16/08/2026. Le libelle et
                      la consommation annuelle etaient les deux seuls champs que la modale
                      « Modifier » savait changer, et ils ne s'affichaient meme pas quand ils
                      etaient vides. Segment, tension, tarif et CAR restent en lecture : ils
                      viennent du gestionnaire de reseau (Enedis / GRDF) et se corrigent par une
                      synchronisation, pas a la main. */}
                  {canManage ? (
                    <>
                      <InlineField
                        variant="text"
                        label="Libellé"
                        emptyLabel="nommer ce compteur"
                        value={compteur.utilisation}
                        onCommit={(v) => majCompteur({ libelle: v.trim() || null })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                      <InlineField
                        variant="select"
                        label="Type d'utilisation"
                        emptyLabel="choisir"
                        value={compteur.type_utilisation_compteur_id ?? ''}
                        options={(typesUtilisation ?? []).map((t) => ({ value: t.id, label: t.libelle }))}
                        onCommit={(v) => majCompteur({ type_utilisation_compteur_id: v || null })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                      <InlineField
                        variant="number"
                        label="Consommation annuelle"
                        unit="MWh"
                        value={compteur.consommation_annuelle_mwh}
                        onCommit={(v) => majCompteur({ consommation_annuelle_mwh: v })}
                        onSaved={() => showToast('✓ enregistré')}
                        onError={(e) => showToast(`Erreur : ${e.message}`)}
                      />
                      {/* Le proprietaire commande la visibilite : administrateurs seuls, comme
                          dans l'ancienne modale. */}
                      {isAdmin && (
                        <InlineField
                          variant="select"
                          label="Propriétaire"
                          emptyLabel="aucun"
                          value={compteur.proprietaire_id ?? ''}
                          options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                          onCommit={(v) => majCompteur({ proprietaire_id: v || null })}
                          onSaved={() => showToast('✓ enregistré')}
                          onError={(e) => showToast(`Erreur : ${e.message}`)}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {compteur.type_utilisation_compteur && <p><span className="text-km-faint">Type d'utilisation :</span> {compteur.type_utilisation_compteur}</p>}
                      {compteur.consommation_annuelle_mwh != null && <p><span className="text-km-faint">Consommation annuelle :</span> {compteur.consommation_annuelle_mwh} MWh</p>}
                    </>
                  )}
                  {compteur.segment && <p><span className="text-km-faint">Segment :</span> {compteur.segment}</p>}
                  {compteur.tension && <p><span className="text-km-faint">Tension :</span> {compteur.tension}</p>}
                  {compteur.tarif_distribution && <p><span className="text-km-faint">Tarif :</span> {compteur.tarif_distribution}</p>}
                  {compteur.car_mwh != null && <p><span className="text-km-faint">CAR :</span> {compteur.car_mwh} MWh</p>}
                  {compteur.profil_consommation && <p><span className="text-km-faint">Profil :</span> {compteur.profil_consommation}</p>}
                  {compteur.zone_tarifaire && <p><span className="text-km-faint">Zone tarifaire :</span> {compteur.zone_tarifaire}</p>}
                  {/* Responsable et conseil syndical : repris de Salesforce (6710 et 435
                      compteurs) mais jusque-là figés. Modifiables au clic, avec les contacts du
                      compte pour choix — un responsable qui change de poste restait sinon inscrit
                      indéfiniment. Le lien vers la fiche est conservé à côté du champ. */}
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <ChampContactCompteur
                      libelle="Responsable"
                      contactId={compteur.responsable_contact_id ?? null}
                      contactNom={compteur.responsable_contact_nom ?? null}
                      contactsDuCompte={contactsDuCompte}
                      modifiable={canManage}
                      onCommit={(v) => majCompteur({ responsable_contact_id: v })}
                      onToast={showToast}
                    />
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <ChampContactCompteur
                      libelle="Contact conseil syndical"
                      contactId={compteur.contact_conseil_syndical_id ?? null}
                      contactNom={compteur.contact_conseil_syndical_nom ?? null}
                      contactsDuCompte={contactsDuCompte}
                      modifiable={canManage}
                      onCommit={(v) => majCompteur({ contact_conseil_syndical_id: v })}
                      onToast={showToast}
                    />
                  </div>
                  {compteur.fournisseur_actuel_compte_id && (
                    <p>
                      <span className="text-km-faint">Fournisseur actuel (avant KiWee) :</span>{' '}
                      <EntityLink to={`/comptes/${compteur.fournisseur_actuel_compte_id}`}>{compteur.fournisseur_actuel_nom}</EntityLink>
                    </p>
                  )}
                  {/* L'ÉCHÉANCE S'AFFICHE MÊME ABSENTE. « Sans échéance contractuelle — prouvée ou
                      estimée — la piste reste à qualifier » : une ligne qui disparaît quand la donnée
                      manque ne dit pas qu'il faut aller la chercher, elle laisse croire qu'il n'y a
                      rien à savoir. 588 compteurs sont dans ce cas. */}
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-km-faint">Échéance :</span>
                    <span>{echeance.date ? new Date(echeance.date + 'T12:00:00').toLocaleDateString('fr-FR') : '—'}</span>
                    <BadgeEcheance e={echeance} dense />
                  </p>
                  {/* ══ LA DATE DÉCLARÉE SE CORRIGE ICI ══
                      Michel, 31/08/2026 : « donner la possibilité de modifier directement les dates
                      d'échéance au niveau des compteurs ».

                      ELLE EST SÉPARÉE DE LA LIGNE AU-DESSUS, et c'est volontaire. La ligne
                      « Échéance » montre la date QUI FAIT FOI — celle du contrat rattaché quand il y
                      en a un. Ce champ-ci porte la date DÉCLARÉE sur le compteur. Les confondre
                      donnerait un champ qui s'enregistre sans que l'affichage bouge, et personne ne
                      comprendrait pourquoi.

                      Quand les deux se contredisent, le message rouge juste en dessous le dit
                      déjà. */}
                  {canManage && (
                    <InlineField
                      variant="date"
                      label="Échéance déclarée sur le compteur"
                      emptyLabel="non renseignée"
                      value={compteur.date_echeance ? compteur.date_echeance.slice(0, 10) : null}
                      onCommit={(date_echeance) => majCompteur({ date_echeance: date_echeance || null })}
                      onSaved={() => showToast('✓ Échéance enregistrée')}
                      onError={(e: Error) => showToast(`Erreur : ${e.message}`)}
                    />
                  )}
                  {echeance.contredit && echeance.dateDeclaree && (
                    <p className="text-km-label italic text-km-red">
                      Date déclarée sur le compteur : {new Date(echeance.dateDeclaree + 'T12:00:00').toLocaleDateString('fr-FR')} — c’est la
                      fin du contrat rattaché qui est retenue ci-dessus.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-km-faint">
                    <p>
                      {compteur.synchro_eneo
                        ? `Synchronisé le ${compteur.date_derniere_synchro_eneo ? new Date(compteur.date_derniere_synchro_eneo).toLocaleDateString('fr-FR') : '—'}`
                        : 'Jamais synchronisé'}
                    </p>
                    {compteur.type_energie === 'electricite' && canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={enedisFetch.isPending || syncCompteurElec.isPending}
                        onClick={handleSyncEnedis}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', (enedisFetch.isPending || syncCompteurElec.isPending) && 'animate-spin')} />
                        Synchroniser Enedis
                      </Button>
                    )}
                    {compteur.type_energie === 'gaz' && canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={grdFetch.isPending || syncCompteurGaz.isPending}
                        onClick={handleSyncGrd}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', (grdFetch.isPending || syncCompteurGaz.isPending) && 'animate-spin')} />
                        Synchroniser GRDF
                      </Button>
                    )}
                  </div>
                  {syncFeedback && <p className="text-km-muted">{syncFeedback}</p>}
                </div>
                <HistoriqueDiscret tableNom="compteurs" ligneId={compteur.id} />
              </div>

              <div className="rounded-xl border border-km-line bg-white p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-km-xs font-bold uppercase tracking-wide text-km-faint">Historique de consommation</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </Button>
                </div>
                <div className="space-y-2">
                  {consommationsDuCompteur.length === 0 && <p className="text-xs text-km-faint">Aucune période enregistrée.</p>}
                  {consommationsDuCompteur.map((c) => (
                    <div key={c.id} className="rounded-lg border border-km-line p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-km-text">
                          {new Date(c.date_debut_periode).toLocaleDateString('fr-FR')} → {new Date(c.date_fin_periode).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="font-semibold text-km-text">{c.quantite} {c.unite}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-km-muted">
                        <Badge tone="neutral">{c.poste_tarifaire}</Badge>
                        <Badge tone={c.type_valeur === 'MESUREE' ? 'kiwi' : 'amber'}>{c.type_valeur}</Badge>
                        {c.source && <span>{c.source}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>
          )}

          {tab === 'contrats' && (
            <div className="flex flex-col gap-2.5">
              {contratsDuCompteur.length === 0 && <p className="text-sm text-km-faint">Aucun contrat ne couvre ce compteur.</p>}
              {contratsDuCompteur.map((ct) => {
                const CtIcon = ct.type_energie === 'gaz' ? Flame : Zap
                return (
                  <div
                    key={ct.id}
                    onClick={() => navigate(`/contrats/${ct.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', ct.type_energie === 'gaz' ? 'bg-km-amber-soft text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <CtIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-km-text">{ct.fournisseur_nom}</p>
                      <p className="truncate text-km-xs text-km-faint">
                        {ct.date_debut ? new Date(ct.date_debut).toLocaleDateString('fr-FR') : '—'} → {ct.date_fin ? new Date(ct.date_fin).toLocaleDateString('fr-FR') : 'sans échéance'}
                      </p>
                    </div>
                    <Badge tone={STATUT_CONTRAT_TONE[ct.statut] ?? 'neutral'}>{statutsContrats.find((s) => s.code === ct.statut)?.libelle ?? ct.statut}</Badge>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'mandats' && (
            <div className="flex flex-col gap-2.5">
              {mandatDuCompteur ? (
                <div
                  onClick={() => navigate(`/mandats/${mandatDuCompteur.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3.5 hover:bg-km-bg/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-km-amber-soft text-amber-600">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-km-text">Mandat {mandatDuCompteur.compte_nom}</p>
                    <p className="truncate text-km-xs text-km-faint">{mandatDuCompteur.contact_signataire_nom ?? 'Signataire non renseigné'}</p>
                  </div>
                  <Badge tone={STATUT_MANDAT_TONE[mandatDuCompteur.statut] ?? 'neutral'}>{statutsMandats.find((s) => s.code === mandatDuCompteur.statut)?.libelle ?? mandatDuCompteur.statut}</Badge>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-bold text-amber-700">Aucun mandat actif ne couvre ce compteur</p>
                  <p className="mt-1 text-xs text-amber-600">Impossible de lancer une consultation tant qu'un mandat signé ne couvre pas ce PDL.</p>
                  <Button size="sm" className="mt-2.5" onClick={() => navigate('/mandats')}>
                    <Plus className="h-3.5 w-3.5" />
                    Préparer un mandat
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <div className="flex flex-col gap-3.5">
              {/* PAS DE BOUTON « Ajouter un fichier ». Naoelle, 21/08/2026 : « si on peut cliquer
                  ou deposer c'est bon, pas besoin de bruit visuel avec un bouton », puis « fais le
                  menage partout ». La zone juste en dessous dit les deux gestes et les accepte tous
                  les deux ; le bouton doublait l'un d'eux. Le rattachement par lien, qui n'etait
                  accessible que par lui, se fait desormais dans la zone — en y glissant le lien, ou
                  en le collant. */}
              {/* Depot reel de fichiers — possible depuis que le bucket « documents » a des
                  politiques d'ecriture (migration 20260816130000). */}
              <ZoneDepotFichiers
                types={typesDocs}
                onDeposer={async (fichiers, typeDocumentId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    entite_type: 'compteur',
                    entite_id: compteur.id,
                    type_document_id: typeDocumentId,
                    type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                  })
                }}
              />
              {documentsDuCompteur.length === 0 ? (
                <p className="text-sm text-km-faint">Aucun fichier pour ce compteur.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-km-line bg-white">
                  {documentsDuCompteur.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-km-bg/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-km-text">{d.nom}</p>
                        <p className="truncate text-km-xs text-km-faint">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <Badge tone="neutral">{d.type_document}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AddConsommationDialog compteurId={compteur.id} open={showAdd} onClose={() => setShowAdd(false)} />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce compteur ?"
        description="Cette action est irréversible. L'historique de consommation et les contrats rattachés ne seront pas supprimés mais perdront leur lien à ce compteur."
      >
        {suppression.erreur && (
          <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-km-red hover:bg-km-red-soft" disabled={suppression.enCours} onClick={handleDelete}>
                {suppression.enCours ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
        </div>
      </Dialog>
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Un champ « contact » du compteur : lecture cliquable vers la fiche, et modification au clic quand
 * l'utilisateur en a le droit. Le lien vers la fiche est conservé à côté du sélecteur — le rendre
 * éditable sans cela ferait perdre l'accès au contact en un clic.
 */
function ChampContactCompteur({
  libelle,
  contactId,
  contactNom,
  contactsDuCompte,
  modifiable,
  onCommit,
  onToast,
}: {
  libelle: string
  contactId: string | null
  contactNom: string | null
  contactsDuCompte: { id: string; prenom: string; nom: string }[]
  modifiable: boolean
  onCommit: (valeur: string | null) => Promise<void>
  onToast: (message: string) => void
}) {
  if (!modifiable) {
    if (!contactId) return null
    return (
      <p>
        <span className="text-km-faint">{libelle} :</span>{' '}
        <EntityLink to={`/contacts/${contactId}`}>{contactNom}</EntityLink>
      </p>
    )
  }

  return (
    <>
      <InlineField
        variant="select"
        label={libelle}
        value={contactId ?? ''}
        options={[
          { value: '', label: 'Aucun' },
          ...contactsDuCompte.map((c) => ({ value: c.id, label: `${c.prenom} ${c.nom}` })),
        ]}
        onCommit={(v) => onCommit(v || null)}
        onSaved={() => onToast('✓ enregistré')}
        onError={(err) => onToast(`Erreur : ${err.message}`)}
      />
      {contactId && (
        <EntityLink to={`/contacts/${contactId}`}>
          <span className="text-km-label">ouvrir la fiche →</span>
        </EntityLink>
      )}
    </>
  )
}
