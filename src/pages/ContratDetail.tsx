import { useMemo, useState } from 'react'
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Trash2, Building2, MapPin, Gauge, FileText, Plus, Euro, X, Eye } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useContrat, useUpdateContratPartiel, useDeleteContrat, type PatchContrat } from '@/lib/data/contrats'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import { sendContratForSignature, connectDocusign, DocusignNonConnecte } from '@/lib/data/docusign'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useFormulesTarifaires, useTarifsByContratCompteurs, useCreateTarif, useDeleteTarif } from '@/lib/data/tarifs'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import { cn } from '@/lib/utils'
import type { Contact, Contrat, DocumentItem, TarifContratCompteur } from '@/types/domain'

const FORMULE_CHAMPS: Record<string, { key: string; label: string }[]> = {
  BASE: [{ key: 'prix_base_eur_mwh', label: 'Prix Base (€/MWh)' }],
  HP_HC: [
    { key: 'prix_hp_eur_mwh', label: 'Prix HP (€/MWh)' },
    { key: 'prix_hc_eur_mwh', label: 'Prix HC (€/MWh)' },
  ],
  QUATRE_POSTES: [
    { key: 'prix_hph_eur_mwh', label: 'Prix HPH (€/MWh)' },
    { key: 'prix_hch_eur_mwh', label: 'Prix HCH (€/MWh)' },
    { key: 'prix_hpe_eur_mwh', label: 'Prix HPE (€/MWh)' },
    { key: 'prix_hce_eur_mwh', label: 'Prix HCE (€/MWh)' },
  ],
  CINQ_POSTES: [
    { key: 'prix_hph_eur_mwh', label: 'Prix HPH (€/MWh)' },
    { key: 'prix_hch_eur_mwh', label: 'Prix HCH (€/MWh)' },
    { key: 'prix_hpe_eur_mwh', label: 'Prix HPE (€/MWh)' },
    { key: 'prix_hce_eur_mwh', label: 'Prix HCE (€/MWh)' },
    { key: 'prix_pointe_eur_mwh', label: 'Prix Pointe (€/MWh)' },
  ],
  GAZ_UNIQUE: [{ key: 'prix_gaz_eur_mwh', label: 'Prix gaz (€/MWh)' }],
}

function tarifResume(t: TarifContratCompteur): string {
  const parts: string[] = []
  if (t.prix_base_eur_mwh != null) parts.push(`Base ${t.prix_base_eur_mwh}€`)
  if (t.prix_hp_eur_mwh != null) parts.push(`HP ${t.prix_hp_eur_mwh}€`)
  if (t.prix_hc_eur_mwh != null) parts.push(`HC ${t.prix_hc_eur_mwh}€`)
  if (t.prix_hph_eur_mwh != null) parts.push(`HPH ${t.prix_hph_eur_mwh}€`)
  if (t.prix_hch_eur_mwh != null) parts.push(`HCH ${t.prix_hch_eur_mwh}€`)
  if (t.prix_hpe_eur_mwh != null) parts.push(`HPE ${t.prix_hpe_eur_mwh}€`)
  if (t.prix_hce_eur_mwh != null) parts.push(`HCE ${t.prix_hce_eur_mwh}€`)
  if (t.prix_pointe_eur_mwh != null) parts.push(`Pointe ${t.prix_pointe_eur_mwh}€`)
  if (t.prix_gaz_eur_mwh != null) parts.push(`Gaz ${t.prix_gaz_eur_mwh}€`)
  return parts.join(' · ') || '—'
}

type TabKey = 'contrat' | 'perimetre' | 'fichiers'

function CycleDeVieCard({ dateDebut, dateFin }: { dateDebut: string; dateFin: string | null }) {
  const debut = new Date(dateDebut).getTime()
  const fin = dateFin ? new Date(dateFin).getTime() : null
  const now = Date.now()
  const pct = fin ? Math.min(100, Math.max(0, ((now - debut) / (fin - debut)) * 100)) : 0
  const statutLabel = fin == null ? 'sans échéance' : now < debut ? 'à venir' : now > fin ? 'expiré' : 'en cours'
  const joursRestants = fin != null ? Math.round((fin - now) / 86400000) : null

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Cycle de vie</span>
        <div className="flex-1" />
        {joursRestants != null && joursRestants >= 0 && (
          <span className="text-[11px] font-bold text-amber-600">expire dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}</span>
        )}
        {joursRestants != null && joursRestants < 0 && <span className="text-[11px] font-bold text-navy-400">{statutLabel}</span>}
      </div>
      {fin != null ? (
        <>
          <div className="relative h-2.5 rounded-full bg-navy-100">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-kiwi-500 to-kiwi-400" style={{ width: `${pct}%` }} />
            {now >= debut && now <= fin && (
              <div className="absolute -top-0.5 h-3.5 w-0.5 rounded bg-red-500" style={{ left: `${pct}%` }} />
            )}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-navy-400">
            <span>{new Date(dateDebut).toLocaleDateString('fr-FR')}</span>
            {now >= debut && now <= fin && <span className="font-bold text-red-500">aujourd'hui</span>}
            <span>{new Date(fin).toLocaleDateString('fr-FR')}</span>
          </div>
        </>
      ) : (
        <p className="text-xs text-navy-400">Débuté le {new Date(dateDebut).toLocaleDateString('fr-FR')} · sans date de fin renseignée.</p>
      )}
    </div>
  )
}

const CLAUSES: { key: keyof Pick<Contrat, 'clause_tacite_reconduction' | 'clause_renegociation_anticipee' | 'clause_engagement_consommation' | 'clause_energie_verte' | 'clause_indexation_prix' | 'clause_penalites_resiliation'>; label: string }[] = [
  { key: 'clause_tacite_reconduction', label: 'Tacite reconduction' },
  { key: 'clause_renegociation_anticipee', label: 'Renégociation anticipée' },
  { key: 'clause_engagement_consommation', label: 'Engagement de consommation' },
  { key: 'clause_energie_verte', label: 'Énergie verte' },
  { key: 'clause_indexation_prix', label: 'Indexation de prix' },
  { key: 'clause_penalites_resiliation', label: 'Pénalités de résiliation anticipée' },
]

function ClausesCard({ contrat }: { contrat: Contrat }) {
  const renseignees = CLAUSES.filter((c) => contrat[c.key] != null)
  if (renseignees.length === 0) return null
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Clauses</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {renseignees.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50/60 px-3 py-2">
            <span className="text-xs text-navy-700">{c.label}</span>
            <Badge tone={contrat[c.key] ? 'kiwi' : 'neutral'}>{contrat[c.key] ? 'Oui' : 'Non'}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddTarifDialog({
  open,
  onClose,
  contratCompteurId,
  typeEnergie,
}: {
  open: boolean
  onClose: () => void
  contratCompteurId: string
  typeEnergie: 'electricite' | 'gaz'
}) {
  const { data: formules } = useFormulesTarifaires()
  const createTarif = useCreateTarif()
  const formulesFiltrees = useMemo(
    () => (formules ?? []).filter((f) => (typeEnergie === 'gaz' ? f.code === 'GAZ_UNIQUE' : f.code !== 'GAZ_UNIQUE')),
    [formules, typeEnergie],
  )

  const [formuleId, setFormuleId] = useState('')
  const [prix, setPrix] = useState<Record<string, string>>({})
  const [abonnementMensuel, setAbonnementMensuel] = useState('')
  const [abonnementAnnuel, setAbonnementAnnuel] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [indexation, setIndexation] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setFormuleId('')
    setPrix({})
    setAbonnementMensuel('')
    setAbonnementAnnuel('')
    setDateDebut('')
    setDateFin('')
    setIndexation('')
    setFeedback(null)
  }

  const formuleActuelle = formulesFiltrees.find((f) => f.id === formuleId)
  const champsPrix = formuleActuelle ? (FORMULE_CHAMPS[formuleActuelle.code] ?? []) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createTarif.mutateAsync({
        contrat_compteur_id: contratCompteurId,
        type_formule_tarifaire_id: formuleId || null,
        indexation: indexation || null,
        prix_base_eur_mwh: prix.prix_base_eur_mwh ? Number(prix.prix_base_eur_mwh) : null,
        prix_hp_eur_mwh: prix.prix_hp_eur_mwh ? Number(prix.prix_hp_eur_mwh) : null,
        prix_hc_eur_mwh: prix.prix_hc_eur_mwh ? Number(prix.prix_hc_eur_mwh) : null,
        prix_pointe_eur_mwh: prix.prix_pointe_eur_mwh ? Number(prix.prix_pointe_eur_mwh) : null,
        prix_hph_eur_mwh: prix.prix_hph_eur_mwh ? Number(prix.prix_hph_eur_mwh) : null,
        prix_hch_eur_mwh: prix.prix_hch_eur_mwh ? Number(prix.prix_hch_eur_mwh) : null,
        prix_hpe_eur_mwh: prix.prix_hpe_eur_mwh ? Number(prix.prix_hpe_eur_mwh) : null,
        prix_hce_eur_mwh: prix.prix_hce_eur_mwh ? Number(prix.prix_hce_eur_mwh) : null,
        prix_gaz_eur_mwh: prix.prix_gaz_eur_mwh ? Number(prix.prix_gaz_eur_mwh) : null,
        abonnement_mensuel_ht: abonnementMensuel ? Number(abonnementMensuel) : null,
        abonnement_annuel_ht: abonnementAnnuel ? Number(abonnementAnnuel) : null,
        date_debut_validite: dateDebut || null,
        date_fin_validite: dateFin || null,
      })
      reset()
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un tarif" description="Renseigner la grille tarifaire applicable à ce compteur.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Formule tarifaire">
          <Select
            value={formuleId}
            onChange={(e) => { setFormuleId(e.target.value); setPrix({}) }}
            required
          >
            <option value="">Sélectionner…</option>
            {formulesFiltrees.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
          </Select>
        </FormField>
        {champsPrix.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {champsPrix.map((c) => (
              <FormField key={c.key} label={c.label}>
                <Input
                  type="number"
                  step="0.001"
                  value={prix[c.key] ?? ''}
                  onChange={(e) => setPrix((p) => ({ ...p, [c.key]: e.target.value }))}
                />
              </FormField>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Abonnement mensuel HT (€)">
            <Input type="number" step="0.01" value={abonnementMensuel} onChange={(e) => setAbonnementMensuel(e.target.value)} />
          </FormField>
          <FormField label="Abonnement annuel HT (€)">
            <Input type="number" step="0.01" value={abonnementAnnuel} onChange={(e) => setAbonnementAnnuel(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Début de validité">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </FormField>
          <FormField label="Fin de validité">
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Indexation">
          <Input value={indexation} onChange={(e) => setIndexation(e.target.value)} placeholder="Ex. fixe, indexé marché…" />
        </FormField>
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createTarif.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function ContratDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: contrat } = useContrat(id)
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: documents } = useDocuments()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const site = sites?.find((s) => s.id === contrat?.site_id)
  const compte = comptes?.find((c) => c.id === site?.compte_id)
  const fournisseur = comptes?.find((c) => c.id === contrat?.fournisseur_compte_id)
  // Aperçu d'un fichier sans quitter la fiche contrat (demande d'Agathe, 07/08/2026).
  const [apercu, setApercu] = useState<{ url: string; nom: string; nomFichier: string } | null>(null)
  const documentsDuContrat = useMemo(() => documents?.filter((d) => d.entite_type === 'contrat' && d.entite_id === id) ?? [], [documents, id])
  const canManage = useCanManage(contrat?.proprietaire_id)
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const { data: tousContacts } = useContacts()
  // Les contacts qui peuvent signer : ceux du compte porteur du contrat, et seulement s'ils ont une
  // adresse — DocuSign envoie par email, un contact sans email ne peut rien recevoir.
  const contactsDuCompte = useMemo(
    () => (tousContacts ?? []).filter((c) => c.compte_id === contrat?.compte_id && !!c.email),
    [tousContacts, contrat?.compte_id],
  )
  const deleteContrat = useDeleteContrat()

  // Edition en place : un champ se corrige la ou il se lit, sans modale.
  const updateContratPartiel = useUpdateContratPartiel()
  const majContrat = async (patch: PatchContrat) => {
    await updateContratPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }
  const retourInline = {
    onSaved: () => showToast('✓ enregistré'),
    onError: (e: Error) => showToast(`Erreur : ${e.message}`),
  }
  const deleteTarif = useDeleteTarif()
  const goBack = useGoBack('/contrats')

  const contratCompteurIds = useMemo(
    () => (contrat?.compteurs.map((c) => c.contrat_compteur_id).filter((v): v is string => !!v) ?? []),
    [contrat],
  )
  const { data: tarifs } = useTarifsByContratCompteurs(contratCompteurIds)

  const [tab, setTab] = useState<TabKey>('contrat')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const televerser = useTeleverserDocuments()

  const { data: typesDocsRef } = useReferenceTable('types_documents')

  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  const [addTarifFor, setAddTarifFor] = useState<string | null>(null)

  const suppression = useSuppression()

  function handleDelete() {
    if (!contrat) return
    suppression.supprimer(
      () => deleteContrat.mutateAsync(contrat.id),
      () => navigate('/contrats'),
    )
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'contrat', label: 'Contrat' },
    { key: 'perimetre', label: 'Périmètre', badge: contrat?.compteurs.length ? String(contrat.compteurs.length) : undefined },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuContrat.length ? String(documentsDuContrat.length) : undefined },
  ]

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  if (!contrat && id) {
    return (
      <div>
        <Topbar crumb="Contrats" title="Contrat" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
      </div>
    )
  }

  if (!contrat) {
    return (
      <div>
        <Topbar crumb="Contrats" title="Contrat" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux contrats
          </Button>
          <p className="text-sm text-navy-500">Contrat introuvable.</p>
        </div>
      </div>
    )
  }

  const Icon = contrat.type_energie === 'gaz' ? Flame : Zap
  const energyClasses = contrat.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500'

  return (
    <div>
      <Topbar crumb="Contrats" title={contrat.fournisseur_nom} />

      {/* Bandeau contrat */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux contrats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-navy-800">{contrat.fournisseur_nom}</p>
            <Badge tone={STATUT_CONTRAT_TONE[contrat.statut] ?? 'neutral'}>{statuts.find((s) => s.code === contrat.statut)?.libelle ?? contrat.statut}</Badge>
          </div>
          <p className="truncate text-xs text-navy-500">{contrat.type_energie === 'gaz' ? 'Gaz' : 'Électricité'} · {site?.nom ?? contrat.site_nom}</p>
          <p className="truncate text-[10.5px] text-navy-400">
            {contrat.date_creation && <>Créé le {new Date(contrat.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {contrat.proprietaire_nom || 'Aucun'}
            {contrat.id_salesforce && <> · <span className="font-mono">{contrat.id_salesforce}</span> (temporaire, pour contrôle)</>}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            {/* Plus de bouton « Modifier » : les champs s'editent dans « Détail du contrat ». */}
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
                <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold', isActive ? 'bg-white/20 text-white lg:bg-navy-100 lg:text-navy-500' : 'bg-navy-100 text-navy-500')}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[256px_1fr]">
        {/* Colonne gauche (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          {compte && (
            <div className="rounded-xl border border-navy-100 bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500"><Building2 className="h-2.5 w-2.5" /></span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Compte</span>
                <div className="flex-1" />
                <EntityLink to={`/comptes/${compte.id}`}>ouvrir →</EntityLink>
              </div>
              <p className="text-[13px] font-bold text-sky-500">{compte.nom}</p>
            </div>
          )}

          {site && (
            <div className="rounded-xl border border-navy-100 bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-kiwi-100 text-kiwi-600"><MapPin className="h-2.5 w-2.5" /></span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Site</span>
                <div className="flex-1" />
                <EntityLink to={`/sites/${site.id}`}>ouvrir →</EntityLink>
              </div>
              <p className="text-[13px] font-bold text-kiwi-600">{site.nom}</p>
            </div>
          )}

          <div className="rounded-xl border border-navy-100 bg-white p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-md', energyClasses)}><Icon className="h-2.5 w-2.5" /></span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Fournisseur retenu</span>
            </div>
            {contrat.fournisseur_compte_id ? (
              <EntityLink to={`/comptes/${contrat.fournisseur_compte_id}`}>{contrat.fournisseur_nom}</EntityLink>
            ) : (
              <p className="text-[13px] font-bold text-navy-800">{contrat.fournisseur_nom}</p>
            )}
            {fournisseur && <p className="mt-1 text-[10.5px] text-navy-500">{fournisseur.segment}</p>}
          </div>
        </div>

        {/* Centre */}
        <div className="bg-navy-50 p-4 sm:p-5">
          {tab === 'contrat' && (
            <div className="flex flex-col gap-3.5">
              {contrat.date_debut && (
                <CycleDeVieCard dateDebut={contrat.date_debut} dateFin={contrat.date_fin} />
              )}
              <div className="rounded-xl border border-navy-100 bg-white p-4">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Détail du contrat</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Énergie</p>
                  <Badge tone="neutral">{contrat.type_energie === 'gaz' ? 'Gaz' : 'Électricité'}</Badge>
                </div>
                {/* Edition en place : ces champs se corrigeaient dans une modale « Modifier »,
                    alors qu'un contrat se rectifie surtout au fil de l'eau (une date de fin qui
                    bouge, un preavis qu'on decouvre en lisant le PDF). Les champs vides
                    s'affichent desormais en pointille cliquable au lieu de disparaitre : la
                    reference fournisseur et le preavis n'apparaissaient PAS tant qu'ils etaient
                    vides, donc rien n'invitait a les renseigner. */}
                {canManage ? (
                  <>
                    <InlineField
                      variant="text" mono
                      label="Référence fournisseur"
                      value={contrat.reference_fournisseur ?? ''}
                      onCommit={(v) => majContrat({ reference_fournisseur: v.trim() || null })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="date"
                      label="Début"
                      value={contrat.date_debut ?? null}
                      onCommit={(date_debut) => majContrat({ date_debut })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="date"
                      label="Fin"
                      emptyLabel="sans échéance"
                      value={contrat.date_fin ?? null}
                      onCommit={(date_fin) => majContrat({ date_fin })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="number"
                      label="Préavis de résiliation"
                      unit="jours"
                      value={contrat.preavis_resiliation_jours ?? null}
                      onCommit={(preavis_resiliation_jours) => majContrat({ preavis_resiliation_jours })}
                      {...retourInline}
                    />
                    <InlineField
                      variant="select"
                      label="Signataire"
                      emptyLabel="choisir un signataire"
                      value={contrat.contact_signataire_id ?? ''}
                      // Restreint aux contacts du compte du contrat : proposer les 3000 contacts
                      // du CRM ferait choisir un signataire qui n'a rien a voir avec le client.
                      options={(tousContacts ?? [])
                        .filter((c) => c.compte_id === compte?.id)
                        .map((c) => ({ value: c.id, label: `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() }))}
                      onCommit={(v) => majContrat({ contact_signataire_id: v || null })}
                      {...retourInline}
                    />
                    {/* Le proprietaire commande la visibilite du contrat : administrateurs seuls,
                        comme dans l'ancienne modale. */}
                    {isAdmin && (
                      <InlineField
                        variant="select"
                        label="Propriétaire"
                        emptyLabel="aucun"
                        value={contrat.proprietaire_id ?? ''}
                        options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                        onCommit={(v) => majContrat({ proprietaire_id: v || null })}
                        {...retourInline}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {contrat.reference_fournisseur && (
                      <div>
                        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Référence fournisseur</p>
                        <p className="font-mono text-xs font-semibold text-navy-800">{contrat.reference_fournisseur}</p>
                      </div>
                    )}
                    <div>
                      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Début</p>
                      <p className="text-xs font-semibold text-navy-800">{contrat.date_debut ? new Date(contrat.date_debut).toLocaleDateString('fr-FR') : '—'}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Fin</p>
                      <p className="text-xs font-semibold text-navy-800">{contrat.date_fin ? new Date(contrat.date_fin).toLocaleDateString('fr-FR') : 'sans échéance'}</p>
                    </div>
                    {contrat.preavis_resiliation_jours != null && (
                      <div>
                        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Préavis de résiliation</p>
                        <p className="text-xs font-semibold text-navy-800">{contrat.preavis_resiliation_jours} jours</p>
                      </div>
                    )}
                    {contrat.contact_signataire_nom && (
                      <div>
                        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Signataire</p>
                        {contrat.contact_signataire_id ? (
                          <EntityLink to={`/contacts/${contrat.contact_signataire_id}`} className="text-xs font-semibold">{contrat.contact_signataire_nom}</EntityLink>
                        ) : (
                          <p className="text-xs font-semibold text-navy-800">{contrat.contact_signataire_nom}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {contrat.interlocuteur_pricing_nom && (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Interlocuteur pricing</p>
                    <p className="text-xs font-semibold text-navy-800">{contrat.interlocuteur_pricing_nom}</p>
                  </div>
                )}
                {contrat.date_signature && (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Date de signature</p>
                    <p className="text-xs font-semibold text-navy-800">{new Date(contrat.date_signature).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}
                {contrat.date_debut && contrat.date_fin && (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Durée</p>
                    <p className="text-xs font-semibold text-navy-800">
                      {Math.round((new Date(contrat.date_fin).getTime() - new Date(contrat.date_debut).getTime()) / (1000 * 60 * 60 * 24 * 30.44))} mois
                    </p>
                  </div>
                )}
                {contrat.type_prix && (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Type de prix</p>
                    <Badge tone={contrat.type_prix === 'Fixe' ? 'kiwi' : 'amber'}>{contrat.type_prix}</Badge>
                  </div>
                )}
                {contrat.prix_molecule_eur_mwh != null && (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Prix molécule</p>
                    <p className="font-mono text-xs font-semibold text-navy-800">{contrat.prix_molecule_eur_mwh.toLocaleString('fr-FR')} €/MWh</p>
                  </div>
                )}
                {contrat.strategie_tarifaire && (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Stratégie tarifaire</p>
                    <p className="text-xs text-navy-700">{contrat.strategie_tarifaire === 'prix_cible' ? 'Prix cible' : 'Marge fixe'}</p>
                  </div>
                )}
              </div>
              <HistoriqueDiscret tableNom="contrats" ligneId={contrat.id} />
              </div>

              <ClausesCard contrat={contrat} />

              {/* ── LA SIGNATURE DU CONTRAT ──
                  Ce bloc ne faisait qu'AFFICHER un état de signature — un état qui n'avait jamais pu
                  naître, puisque rien ne permettait d'envoyer un contrat. Michel s'y est heurté le
                  21/08/2026 sur SDC AMPLITUDE 2 : « je n'arrive pas à l'envoyer en DocuSign, je ne
                  vois même pas le bouton. » Il n'y en avait pas. */}
              <BlocSignatureContrat
                contrat={contrat}
                documents={documentsDuContrat}
                contacts={contactsDuCompte}
                signaler={showToast}
              />
            </div>
          )}

          {tab === 'perimetre' && (
            <div className="flex flex-col gap-2.5">
              {contrat.compteurs.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun compteur couvert par ce contrat.</p>
              ) : (
                contrat.compteurs.map((c) => {
                  const tarifsDuCompteur = (tarifs ?? []).filter((t) => t.contrat_compteur_id === c.contrat_compteur_id)
                  return (
                    <div key={c.id} className="rounded-xl border border-navy-100 bg-white p-3.5">
                      <div
                        onClick={() => navigate(`/compteurs/${c.id}`)}
                        className="flex cursor-pointer items-center gap-3 hover:opacity-80"
                      >
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
                          <Gauge className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-navy-800">{c.utilisation || c.numero_pdl}</p>
                          <p className="truncate font-mono text-[10.5px] text-navy-400">{c.numero_pdl}</p>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-navy-50 pt-3">
                        <div className="mb-2 flex items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Tarification</span>
                          <div className="flex-1" />
                          {canManage && c.contrat_compteur_id && (
                            <Button size="sm" variant="outline" onClick={() => setAddTarifFor(c.contrat_compteur_id)}>
                              <Plus className="h-3 w-3" />
                              Ajouter un tarif
                            </Button>
                          )}
                        </div>
                        {tarifsDuCompteur.length === 0 ? (
                          <p className="text-xs text-navy-400">Aucun tarif renseigné.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {tarifsDuCompteur.map((t) => (
                              <div key={t.id} className="flex items-center gap-2 rounded-lg bg-navy-50/60 px-2.5 py-2">
                                <Euro className="h-3 w-3 shrink-0 text-navy-400" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {t.formule_libelle && <Badge tone="neutral">{t.formule_libelle}</Badge>}
                                    {!t.actif && <Badge tone="amber">inactif</Badge>}
                                  </div>
                                  <p className="mt-1 truncate text-[11px] font-semibold text-navy-700">{tarifResume(t)}</p>
                                  {(t.abonnement_mensuel_ht != null || t.abonnement_annuel_ht != null) && (
                                    <p className="text-[10.5px] text-navy-400">
                                      Abonnement {t.abonnement_mensuel_ht != null ? `${t.abonnement_mensuel_ht}€/mois` : ''}
                                      {t.abonnement_mensuel_ht != null && t.abonnement_annuel_ht != null ? ' · ' : ''}
                                      {t.abonnement_annuel_ht != null ? `${t.abonnement_annuel_ht}€/an` : ''}
                                    </p>
                                  )}
                                  {(t.date_debut_validite || t.date_fin_validite) && (
                                    <p className="text-[10.5px] text-navy-400">
                                      Valide du {t.date_debut_validite ? new Date(t.date_debut_validite).toLocaleDateString('fr-FR') : '…'} au{' '}
                                      {t.date_fin_validite ? new Date(t.date_fin_validite).toLocaleDateString('fr-FR') : 'sans échéance'}
                                    </p>
                                  )}
                                </div>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => deleteTarif.mutate(t.id)}
                                    className="shrink-0 rounded p-1 text-navy-300 hover:bg-white hover:text-red-500"
                                    title="Supprimer ce tarif"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
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
                    entite_type: 'contrat',
                    entite_id: contrat.id,
                    type_document_id: typeDocumentId,
                    type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                  })
                }}
              />
              {documentsDuContrat.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun fichier pour ce contrat.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  {documentsDuContrat.map((d) => (
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
                      {d.url && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); setApercu({ url: d.url, nom: d.nom, nomFichier: d.nom_fichier || d.nom }) }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Aperçu
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {addTarifFor && (
        <AddTarifDialog
          open
          onClose={() => setAddTarifFor(null)}
          contratCompteurId={addTarifFor}
          typeEnergie={contrat.type_energie}
        />
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce contrat ?"
        description="Cette action est irréversible. Les compteurs rattachés ne seront pas supprimés mais perdront leur lien à ce contrat."
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

      {/* Aperçu du fichier sans quitter la fiche : monté seulement à l'ouverture, sinon il
          téléchargerait le document à chaque affichage de la page. */}
      {apercu && (
        <Dialog
          open
          onClose={() => setApercu(null)}
          title={apercu.nom}
          description={apercu.nomFichier}
          className="max-w-4xl"
        >
          <ApercuDocument url={apercu.url} nomFichier={apercu.nomFichier} />
        </Dialog>
      )}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Envoyer le contrat à la signature, et suivre où il en est.
 *
 * DEUX RÈGLES QUI NE SE NÉGOCIENT PAS.
 *
 * On envoie le PDF DU FOURNISSEUR, celui déposé sur la fiche : Kimatch ne fabrique pas de contrat.
 * S'il n'y a aucun fichier, il n'y a rien à faire signer, et on le dit plutôt que d'offrir un bouton
 * qui échouerait.
 *
 * Et l'enveloppe part en BROUILLON. Naoëlle, 21/08/2026 : « il faut envoyer au signataire, mais bien
 * sûr ouvrir DocuSign pour vérifier avant et bien placer toutes les ancres. » Un contrat de
 * fournisseur ne porte pas nos ancres de signature — sans passage par l'éditeur, le signataire
 * recevrait un document où rien n'indique où signer. C'est donc l'expéditeur qui place les champs,
 * puis qui clique « Envoyer » lui-même : rien ne part automatiquement.
 */
function BlocSignatureContrat({
  contrat,
  documents,
  contacts,
  signaler,
}: {
  contrat: Contrat
  documents: DocumentItem[]
  contacts: Contact[]
  signaler: (message: string) => void
}) {
  const [documentId, setDocumentId] = useState('')
  const [contactId, setContactId] = useState('')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [besoinConnexion, setBesoinConnexion] = useState(false)

  // Choix par défaut : le signataire déjà désigné sur le contrat, et l'unique document s'il n'y en a
  // qu'un. Deux clics de moins dans le cas courant.
  const contactRetenu = contacts.find((c) => c.id === (contactId || contrat.contact_signataire_id)) ?? null
  const documentRetenu = documents.find((d) => d.id === documentId) ?? (documents.length === 1 ? documents[0] : null)

  async function envoyer() {
    if (!documentRetenu || !contactRetenu?.email) return
    setEnvoiEnCours(true)
    setBesoinConnexion(false)
    try {
      const resultat = await sendContratForSignature({
        contratId: contrat.id,
        documentUrl: documentRetenu.url,
        documentName: documentRetenu.nom_fichier || documentRetenu.nom || 'Contrat.pdf',
        signerEmail: contactRetenu.email,
        signerName: `${contactRetenu.prenom} ${contactRetenu.nom}`,
        emailSubject: `KiWee Énergie — Contrat à signer (${contrat.compte_nom || contrat.site_nom || ''})`.trim(),
        returnUrl: `${window.location.origin}/contrats/${contrat.id}`,
      })
      if (resultat.senderViewUrl) {
        // On quitte Kimatch pour l'éditeur DocuSign : c'est là que les champs se posent et que
        // l'envoi se déclenche.
        window.location.href = resultat.senderViewUrl
        return
      }
      signaler('Enveloppe créée en brouillon dans DocuSign.')
    } catch (e) {
      if (e instanceof DocusignNonConnecte) setBesoinConnexion(true)
      signaler(e instanceof Error ? e.message : 'Erreur DocuSign inconnue')
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Signature (DocuSign)</p>

      {(contrat.statut_signature || contrat.docusign_envelope_id) && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contrat.statut_signature && (
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Statut</p>
              <Badge tone={contrat.statut_signature === 'SIGNE' ? 'kiwi' : 'amber'}>{contrat.statut_signature}</Badge>
            </div>
          )}
          {contrat.date_envoi_signature && (
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Envoyé le</p>
              <p className="text-xs font-semibold text-navy-800">
                {new Date(contrat.date_envoi_signature).toLocaleDateString('fr-FR')}
              </p>
            </div>
          )}
          {contrat.date_signature && (
            <div>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Signé le</p>
              <p className="text-xs font-semibold text-navy-800">
                {new Date(contrat.date_signature).toLocaleDateString('fr-FR')}
              </p>
            </div>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-xs text-navy-500">
          Aucun fichier sur ce contrat. Déposez d'abord le PDF du fournisseur dans l'onglet Fichiers :
          c'est ce document-là qui part à la signature.
        </p>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-navy-500">
          Aucun contact du compte n'a d'adresse email. DocuSign envoie par email : renseignez-en une
          sur le contact qui doit signer.
        </p>
      ) : (
        <div className="space-y-2.5">
          <FormField label="Document à faire signer">
            <Select value={documentRetenu?.id ?? ''} onChange={(e) => setDocumentId(e.target.value)}>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>{d.nom_fichier || d.nom}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Signataire">
            <Select value={contactRetenu?.id ?? ''} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Choisir…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.prenom} {c.nom} — {c.email}</option>
              ))}
            </Select>
          </FormField>
          <p className="text-[10.5px] leading-snug text-navy-400">
            L'enveloppe est créée en brouillon et DocuSign s'ouvre : c'est là que vous placez les zones
            de signature sur le document, puis que vous cliquez « Envoyer ». Rien ne part
            automatiquement.
          </p>
          {besoinConnexion && (
            <Button type="button" size="sm" onClick={() => { connectDocusign().catch(() => {}) }}>
              Connecter mon compte DocuSign
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={envoyer}
            disabled={envoiEnCours || !documentRetenu || !contactRetenu?.email}
          >
            {envoiEnCours ? 'Préparation…' : 'Ouvrir DocuSign pour placer les signatures'}
          </Button>
        </div>
      )}
    </div>
  )
}
