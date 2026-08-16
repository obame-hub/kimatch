import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Plus, Pencil, Trash2, Building2, MapPin, FileCheck2, FileText, RefreshCw } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { EntityLink } from '@/components/ui/entity-link'
import { useCompteur, useUpdateCompteur, useDeleteCompteur, useSyncCompteurElec, useSyncCompteurGaz, useUpdateCompteurField } from '@/lib/data/compteurs'
import { useEnedisFetch } from '@/lib/data/enedis'
import { useGrdFetch } from '@/lib/data/grd'
import { useConsommations, useCreateConsommation } from '@/lib/data/consommations'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { InlineField } from '@/components/ui/inline-field'
import { useContacts } from '@/lib/data/contacts'
import { useContrats } from '@/lib/data/contrats'
import { useMandats } from '@/lib/data/mandats'
import { useSignaux } from '@/lib/data/signaux'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useDocuments, useCreateDocument, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE, FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { useCanManageEnregistrement, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import type { Compteur, Consommation } from '@/types/domain'

const POSTE_OPTIONS = ['TOTAL', 'HP', 'HC', 'POINTE', 'HPH', 'HCH', 'HPE', 'HCE']
const TYPE_VALEUR_OPTIONS = ['MESUREE', 'ESTIMEE', 'CORRIGEE']

type TabKey = 'apercu' | 'contrats' | 'mandats' | 'fichiers'

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
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createConsommation.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

function EditCompteurDialog({ compteur, open, onClose }: { compteur: Compteur; open: boolean; onClose: () => void }) {
  const updateCompteur = useUpdateCompteur()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const [utilisation, setUtilisation] = useState(compteur.utilisation)
  const [consommationAnnuelleMwh, setConsommationAnnuelleMwh] = useState(
    compteur.consommation_annuelle_mwh != null ? String(compteur.consommation_annuelle_mwh) : '',
  )
  const [proprietaireId, setProprietaireId] = useState(compteur.proprietaire_id ?? '')
  const [typeUtilisationId, setTypeUtilisationId] = useState(compteur.type_utilisation_compteur_id ?? '')
  const { data: typesUtilisationRef } = useReferenceTable('types_utilisations_compteur')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUtilisation(compteur.utilisation)
    setConsommationAnnuelleMwh(compteur.consommation_annuelle_mwh != null ? String(compteur.consommation_annuelle_mwh) : '')
    setProprietaireId(compteur.proprietaire_id ?? '')
    setTypeUtilisationId(compteur.type_utilisation_compteur_id ?? '')
    setFeedback(null)
  }, [open, compteur])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateCompteur.mutateAsync({
        id: compteur.id,
        utilisation,
        consommation_annuelle_mwh: consommationAnnuelleMwh ? Number(consommationAnnuelleMwh) : null,
        proprietaire_id: proprietaireId || null,
        type_utilisation_compteur_id: typeUtilisationId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le compteur" description="Mettre à jour les informations de base du compteur.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Utilisation">
          <Input value={utilisation} onChange={(e) => setUtilisation(e.target.value)} placeholder="Ex. Chaufferie, éclairage…" />
        </FormField>
        {compteur.type_energie === 'electricite' && (
          <FormField label="Type d'utilisation (CU/MU/LU)">
            <Select value={typeUtilisationId} onChange={(e) => setTypeUtilisationId(e.target.value)}>
              <option value="">—</option>
              {typesUtilisationRef?.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Consommation annuelle (MWh)">
          <Input type="number" step="any" value={consommationAnnuelleMwh} onChange={(e) => setConsommationAnnuelleMwh(e.target.value)} />
        </FormField>
        {isAdmin && (
          <FormField label="Propriétaire">
            <Select value={proprietaireId} onChange={(e) => setProprietaireId(e.target.value)}>
              <option value="">Aucun</option>
              {profilsAdmin?.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
            </Select>
          </FormField>
        )}
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateCompteur.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}

function CouvertureCard({
  nbSignaux,
  mandatCouvert,
  recoEnCours,
  contratCouvert,
  onSignaux,
  onMandat,
  onReco,
  onContrat,
}: {
  nbSignaux: number
  mandatCouvert: boolean
  recoEnCours: boolean
  contratCouvert: boolean
  onSignaux?: () => void
  onMandat?: () => void
  onReco?: () => void
  onContrat?: () => void
}) {
  const items = [
    { lbl: 'Signaux', ok: nbSignaux === 0, val: nbSignaux > 0 ? `${nbSignaux} ouvert${nbSignaux > 1 ? 's' : ''}` : 'Aucun', onClick: nbSignaux > 0 ? onSignaux : undefined },
    { lbl: 'Mandat', ok: mandatCouvert, val: mandatCouvert ? 'Couvert ✓' : 'Non couvert', onClick: mandatCouvert ? onMandat : undefined },
    { lbl: 'Reco', ok: true, warn: recoEnCours, val: recoEnCours ? 'En cours' : 'Aucune', onClick: recoEnCours ? onReco : undefined },
    { lbl: 'Contrat', ok: contratCouvert, val: contratCouvert ? 'Couvert ✓' : 'Aucun', onClick: contratCouvert ? onContrat : undefined },
  ]
  const score = items.filter((i) => i.ok).length
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Couverture</span>
        <div className="flex-1" />
        <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-bold', score === items.length ? 'bg-kiwi-50 text-kiwi-600' : 'bg-amber-100 text-amber-700')}>
          {score}/{items.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <div
            key={it.lbl}
            onClick={it.onClick}
            className={cn(
              'flex items-center justify-between rounded-lg border border-navy-50 bg-navy-50/60 px-2 py-1.5',
              it.onClick && 'cursor-pointer hover:bg-navy-100/60',
            )}
          >
            <span className="text-[11.5px] font-semibold text-navy-700">{it.lbl}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[9.5px] font-bold',
                !it.ok ? 'bg-red-100 text-red-600' : it.warn ? 'bg-amber-100 text-amber-700' : 'bg-kiwi-50 text-kiwi-600',
              )}
            >
              {it.val}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9.5px] italic text-navy-300">Signaux liés à ce compteur via ses contrats.</p>
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
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Postes horaires — conso &amp; puissance</span>
        {puissanceMaxAtteinte != null && (
          <span className="ml-auto font-mono text-[10px] text-navy-400">
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
              <span className="w-14 shrink-0 font-mono text-[10.5px] font-bold text-navy-600">{poste}</span>
              <div className="h-2.5 flex-1 rounded-full bg-navy-100">
                {mwh != null && consoMax > 0 && (
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-kiwi-500 to-kiwi-400"
                    style={{ width: `${Math.max(2, (mwh / consoMax) * 100)}%` }}
                  />
                )}
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-[11px] font-semibold text-navy-800">
                {mwh != null ? `${mwh.toLocaleString('fr-FR')} MWh` : '—'}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-navy-500">
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
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Consommation</span>
        <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[9.5px] font-bold text-navy-500">{sorted[0]?.unite ?? 'MWh'}</span>
        {postesUniques.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-2.5">
            {postesUniques.map((p) => (
              <span key={p} className="flex items-center gap-1 text-[10px] text-navy-500">
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
            <span className="text-[9px] font-semibold text-navy-600">{c.quantite}</span>
            <div className="flex w-full flex-1 items-end">
              <div className={cn('w-full rounded-t', posteColor(c.poste_tarifaire), c.type_valeur !== 'MESUREE' && 'opacity-60')} style={{ height: `${Math.max(6, (c.quantite / max) * 100)}%` }} />
            </div>
            <span className="whitespace-nowrap text-[9px] text-navy-400">
              {new Date(c.date_debut_periode).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddFichierDialog({ open, onClose, compteurId, onSaved }: { open: boolean; onClose: () => void; compteurId: string; onSaved: () => void }) {
  const { data: typesRef } = useReferenceTable('types_documents')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_DOCUMENTS
  const createDocument = useCreateDocument()

  const [nom, setNom] = useState('')
  const [url, setUrl] = useState('')
  const [typeDocumentId, setTypeDocumentId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setNom('')
    setUrl('')
    setTypeDocumentId('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const type = types.find((t) => t.id === typeDocumentId)
    const result = await createDocument.mutateAsync({
      nom,
      url,
      type_document_id: typeDocumentId || null,
      type_document_libelle: type?.libelle ?? '',
      entite_type: 'compteur',
      entite_id: compteurId,
    })
    onSaved()
    if (!result.persisted) {
      setFeedback('Ajouté localement (non synchronisé avec Supabase).')
      setTimeout(() => { reset(); onClose() }, 700)
    } else {
      reset()
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un fichier" description="Rattacher un document à ce compteur.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Relevé annuel — GI0483921" />
        </FormField>
        <FormField label="Lien du document (URL)">
          <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://…" />
        </FormField>
        <FormField label="Type de document">
          <Select value={typeDocumentId} onChange={(e) => setTypeDocumentId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createDocument.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function CompteurDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: compteur } = useCompteur(id)
  const { data: consommations } = useConsommations()
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: contrats } = useContrats()
  const { data: mandats } = useMandats()
  const { data: signaux } = useSignaux()
  const { data: recommandations } = useRecommandationsListe()
  const { data: documents } = useDocuments()
  const { data: statutsContratsRef } = useReferenceTable('statuts_contrats')
  const statutsContrats = statutsContratsRef && statutsContratsRef.length > 0 ? statutsContratsRef : FALLBACK_STATUTS_CONTRATS
  const { data: statutsMandatsRef } = useReferenceTable('statuts_mandats')
  const statutsMandats = statutsMandatsRef && statutsMandatsRef.length > 0 ? statutsMandatsRef : FALLBACK_STATUTS_MANDATS

  const consommationsDuCompteur = useMemo(() => consommations?.filter((c) => c.compteur_id === id) ?? [], [consommations, id])
  const site = sites?.find((s) => s.id === compteur?.site_id)
  const compte = comptes?.find((c) => c.id === site?.compte_id)
  const contratsDuCompteur = useMemo(() => contrats?.filter((ct) => ct.compteurs.some((cc) => cc.id === id)) ?? [], [contrats, id])
  const mandatDuCompteur = mandats?.find((m) => compteur && m.site_ids.includes(compteur.site_id))
  const documentsDuCompteur = useMemo(() => documents?.filter((d) => d.entite_type === 'compteur' && d.entite_id === id) ?? [], [documents, id])
  const contratIdsDuCompteur = useMemo(() => new Set(contratsDuCompteur.map((c) => c.id)), [contratsDuCompteur])
  const signauxDuCompteur = useMemo(() => signaux?.filter((s) => s.contrat_id && contratIdsDuCompteur.has(s.contrat_id)) ?? [], [signaux, contratIdsDuCompteur])
  const recoActiveDuSite = useMemo(
    () => recommandations?.find((r) => compteur && r.sites.some((s) => s.id === compteur.site_id) && !['ACCEPTEE', 'REFUSEE', 'CLOTUREE'].includes(r.etape)),
    [recommandations, compteur],
  )

  const [tab, setTab] = useState<TabKey>('apercu')
  const [showAdd, setShowAdd] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addFichierOpen, setAddFichierOpen] = useState(false)

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
    { key: 'apercu', label: 'Aperçu' },
    { key: 'contrats', label: 'Contrats', badge: contratsDuCompteur.length ? String(contratsDuCompteur.length) : undefined },
    { key: 'mandats', label: 'Mandats', badge: mandatDuCompteur ? undefined : '!' },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuCompteur.length ? String(documentsDuCompteur.length) : undefined },
  ]

  if (!compteur && id) {
    return (
      <div>
        <Topbar crumb="Sites" title="Compteur" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
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
          <p className="text-sm text-navy-500">Compteur introuvable.</p>
        </div>
      </div>
    )
  }

  const Icon = compteur.type_energie === 'electricite' ? Zap : Flame
  const energyClasses = compteur.type_energie === 'electricite' ? 'bg-sky-100 text-sky-500' : 'bg-amber-100 text-amber-600'

  return (
    <div>
      <Topbar crumb="Sites" title={`Compteur ${compteur.numero_pdl}`} />

      {/* Bandeau compteur */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour au site">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-navy-800">{compteur.utilisation || compteur.numero_pdl}</p>
            <Badge tone={compteur.statut === 'actif' ? 'kiwi' : 'neutral'}>{compteur.statut}</Badge>
          </div>
          <p className="truncate font-mono text-xs text-navy-400">{compteur.numero_pdl}</p>
          <p className="truncate text-[10.5px] text-navy-400">
            {compteur.date_creation && <>Créé le {new Date(compteur.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {compteur.proprietaire_nom || 'Aucun'}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Modifier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-navy-100 bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          const badgeTone = t.key === 'mandats' ? 'bg-amber-200 text-amber-700' : 'bg-navy-100 text-navy-500'
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-navy-800'
                  : 'border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 lg:border-0 lg:border-b-2 lg:border-transparent lg:text-navy-500 lg:hover:bg-transparent lg:hover:text-navy-700',
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold', isActive ? 'bg-white/20 text-white lg:bg-navy-100 lg:text-navy-500' : badgeTone)}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[256px_1fr]">
        {/* Colonne gauche — Hiérarchie (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          <div className="rounded-xl border border-navy-100 bg-white p-3.5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Hiérarchie</p>
            <div className="flex flex-col gap-0.5">
              {compte && (
                <button type="button" onClick={() => navigate(`/comptes/${compte.id}`)} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-navy-50">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-500"><Building2 className="h-3 w-3" /></span>
                  <span className="flex-1 truncate text-xs font-semibold text-navy-800">{compte.nom}</span>
                  <span className="text-navy-300">›</span>
                </button>
              )}
              <div className="ml-[22px] h-2 w-0.5 bg-navy-100" />
              {site && (
                <button type="button" onClick={() => navigate(`/sites/${site.id}`)} className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-navy-50">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-kiwi-100 text-kiwi-600"><MapPin className="h-3 w-3" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-navy-800">{site.nom}</span>
                    {/* L'adresse du point de livraison, demandee le 15/08/2026 : « faire apparaitre
                        l'adresse sur l'objet compteur ». Elle vit sur le site, le compteur n'en
                        porte pas — on l'affiche donc ici, sous le site auquel il est rattache.
                        C'est aussi ce qui permet de voir d'un coup d'oeil qu'un PDL est range sous
                        le mauvais site, comme l'etait GI155378 avant le 13/08. */}
                    {[site.adresse, [site.code_postal, site.ville].filter(Boolean).join(' ')]
                      .filter((p) => p && p.trim())
                      .join(', ') && (
                      <span className="block truncate text-[11px] text-navy-400">
                        {[site.adresse, [site.code_postal, site.ville].filter(Boolean).join(' ')]
                          .filter((p) => p && p.trim())
                          .join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 text-navy-300">›</span>
                </button>
              )}
              <div className="ml-[22px] h-2 w-0.5 bg-navy-100" />
              <div className="flex items-center gap-2 rounded-lg bg-navy-50 px-1.5 py-1.5">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', energyClasses)}><Icon className="h-3 w-3" /></span>
                <span className="flex-1 truncate text-xs font-bold text-navy-800">{compteur.utilisation || compteur.numero_pdl}</span>
              </div>
            </div>
          </div>

          <CouvertureCard
            nbSignaux={signauxDuCompteur.length}
            mandatCouvert={Boolean(mandatDuCompteur)}
            recoEnCours={Boolean(recoActiveDuSite)}
            contratCouvert={contratsDuCompteur.length > 0}
            onSignaux={() => navigate(`/signaux/${signauxDuCompteur[0].id}`)}
            onMandat={() => setTab('mandats')}
            onReco={() => recoActiveDuSite && navigate(`/recommandations/${recoActiveDuSite.id}`)}
            onContrat={() => setTab('contrats')}
          />
        </div>

        {/* Centre */}
        <div className="bg-navy-50 p-4 sm:p-5">
          {tab === 'apercu' && (
            <div className="flex flex-col gap-3.5">
              {consommationsDuCompteur.length > 0 && <ConsommationChart consommations={consommationsDuCompteur} />}
              <PostesHorairesCard compteur={compteur} />
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <div className="rounded-xl border border-navy-100 bg-white p-4">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Détail du compteur</p>
                <div className="space-y-1.5 text-xs text-navy-700">
                  <p><span className="text-navy-400">Type d'énergie :</span> {compteur.type_energie === 'electricite' ? 'Électricité' : 'Gaz'}</p>
                  {compteur.type_utilisation_compteur && <p><span className="text-navy-400">Type d'utilisation :</span> {compteur.type_utilisation_compteur}</p>}
                  {compteur.consommation_annuelle_mwh != null && <p><span className="text-navy-400">Consommation annuelle :</span> {compteur.consommation_annuelle_mwh} MWh</p>}
                  {compteur.segment && <p><span className="text-navy-400">Segment :</span> {compteur.segment}</p>}
                  {compteur.tension && <p><span className="text-navy-400">Tension :</span> {compteur.tension}</p>}
                  {compteur.tarif_distribution && <p><span className="text-navy-400">Tarif :</span> {compteur.tarif_distribution}</p>}
                  {compteur.car_mwh != null && <p><span className="text-navy-400">CAR :</span> {compteur.car_mwh} MWh</p>}
                  {compteur.profil_consommation && <p><span className="text-navy-400">Profil :</span> {compteur.profil_consommation}</p>}
                  {compteur.zone_tarifaire && <p><span className="text-navy-400">Zone tarifaire :</span> {compteur.zone_tarifaire}</p>}
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
                      <span className="text-navy-400">Fournisseur actuel (avant KiWee) :</span>{' '}
                      <EntityLink to={`/comptes/${compteur.fournisseur_actuel_compte_id}`}>{compteur.fournisseur_actuel_nom}</EntityLink>
                    </p>
                  )}
                  {compteur.date_echeance && (
                    <p><span className="text-navy-400">Échéance :</span> {new Date(compteur.date_echeance).toLocaleDateString('fr-FR')}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-navy-400">
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
                  {syncFeedback && <p className="text-navy-500">{syncFeedback}</p>}
                </div>
                <HistoriqueDiscret tableNom="compteurs" ligneId={compteur.id} />
              </div>

              <div className="rounded-xl border border-navy-100 bg-white p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Historique de consommation</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </Button>
                </div>
                <div className="space-y-2">
                  {consommationsDuCompteur.length === 0 && <p className="text-xs text-navy-400">Aucune période enregistrée.</p>}
                  {consommationsDuCompteur.map((c) => (
                    <div key={c.id} className="rounded-lg border border-navy-100 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-navy-800">
                          {new Date(c.date_debut_periode).toLocaleDateString('fr-FR')} → {new Date(c.date_fin_periode).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="font-semibold text-navy-800">{c.quantite} {c.unite}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-navy-500">
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
              {contratsDuCompteur.length === 0 && <p className="text-sm text-navy-400">Aucun contrat ne couvre ce compteur.</p>}
              {contratsDuCompteur.map((ct) => {
                const CtIcon = ct.type_energie === 'gaz' ? Flame : Zap
                return (
                  <div
                    key={ct.id}
                    onClick={() => navigate(`/contrats/${ct.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', ct.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <CtIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-navy-800">{ct.fournisseur_nom}</p>
                      <p className="truncate text-[10.5px] text-navy-400">
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
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-amber-100 text-amber-600">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-navy-800">Mandat {mandatDuCompteur.compte_nom}</p>
                    <p className="truncate text-[10.5px] text-navy-400">{mandatDuCompteur.contact_signataire_nom ?? 'Signataire non renseigné'}</p>
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
              <div className="flex items-center justify-end">
                <Button size="sm" onClick={() => setAddFichierOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un fichier
                </Button>
              </div>
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
                <p className="text-sm text-navy-400">Aucun fichier pour ce compteur.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  {documentsDuCompteur.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-navy-50/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy-800">{d.nom}</p>
                        <p className="truncate text-[10.5px] text-navy-400">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
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
      <EditCompteurDialog compteur={compteur} open={editOpen} onClose={() => setEditOpen(false)} />
      {addFichierOpen && <AddFichierDialog open={addFichierOpen} onClose={() => setAddFichierOpen(false)} compteurId={compteur.id} onSaved={() => {}} />}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce compteur ?"
        description="Cette action est irréversible. L'historique de consommation et les contrats rattachés ne seront pas supprimés mais perdront leur lien à ce compteur."
      >
        {suppression.erreur && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={suppression.enCours} onClick={handleDelete}>
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
        <span className="text-navy-400">{libelle} :</span>{' '}
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
          <span className="text-[11px]">ouvrir la fiche →</span>
        </EntityLink>
      )}
    </>
  )
}
