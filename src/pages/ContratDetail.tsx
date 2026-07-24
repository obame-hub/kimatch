import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Pencil, Trash2, Building2, MapPin, Gauge, FileText, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useContrats, useUpdateContrat, useDeleteContrat } from '@/lib/data/contrats'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useDocuments, useCreateDocument } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import { cn } from '@/lib/utils'
import type { Contrat } from '@/types/domain'

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

function AddFichierDialog({ open, onClose, contratId, onSaved }: { open: boolean; onClose: () => void; contratId: string; onSaved: () => void }) {
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
      entite_type: 'contrat',
      entite_id: contratId,
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
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter un fichier" description="Rattacher un document à ce contrat.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Contrat signé — CT-2024-118" />
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

export default function ContratDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: contrats } = useContrats()
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: documents } = useDocuments()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const contrat = contrats?.find((c) => c.id === id)
  const site = sites?.find((s) => s.id === contrat?.site_id)
  const compte = comptes?.find((c) => c.id === site?.compte_id)
  const fournisseur = comptes?.find((c) => c.id === contrat?.fournisseur_compte_id)
  const documentsDuContrat = useMemo(() => documents?.filter((d) => d.entite_type === 'contrat' && d.entite_id === id) ?? [], [documents, id])
  const canManage = useCanManage(contrat?.proprietaire_id)
  const deleteContrat = useDeleteContrat()
  const goBack = useGoBack('/contrats')

  const [tab, setTab] = useState<TabKey>('contrat')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addFichierOpen, setAddFichierOpen] = useState(false)

  async function handleDelete() {
    if (!contrat) return
    await deleteContrat.mutateAsync(contrat.id)
    navigate('/contrats')
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'contrat', label: 'Contrat' },
    { key: 'perimetre', label: 'Périmètre', badge: contrat?.compteurs.length ? String(contrat.compteurs.length) : undefined },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuContrat.length ? String(documentsDuContrat.length) : undefined },
  ]

  if (!contrats) {
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
              </div>
              <HistoriqueDiscret tableNom="contrats" ligneId={contrat.id} />
              </div>
            </div>
          )}

          {tab === 'perimetre' && (
            <div className="flex flex-col gap-2.5">
              {contrat.compteurs.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun compteur couvert par ce contrat.</p>
              ) : (
                contrat.compteurs.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/compteurs/${c.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 hover:bg-navy-50/60"
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', energyClasses)}>
                      <Gauge className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-navy-800">{c.utilisation || c.numero_pdl}</p>
                      <p className="truncate font-mono text-[10.5px] text-navy-400">{c.numero_pdl}</p>
                    </div>
                  </div>
                ))
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <EditContratDialog open={editOpen} onClose={() => setEditOpen(false)} contrat={contrat} />
      <AddFichierDialog open={addFichierOpen} onClose={() => setAddFichierOpen(false)} contratId={contrat.id} onSaved={() => {}} />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce contrat ?"
        description="Cette action est irréversible. Les compteurs rattachés ne seront pas supprimés mais perdront leur lien à ce contrat."
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteContrat.isPending} onClick={handleDelete}>
            Supprimer définitivement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function EditContratDialog({ open, onClose, contrat }: { open: boolean; onClose: () => void; contrat: Contrat }) {
  const updateContrat = useUpdateContrat()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [referenceFournisseur, setReferenceFournisseur] = useState(contrat.reference_fournisseur ?? '')
  const [dateDebut, setDateDebut] = useState(contrat.date_debut ? contrat.date_debut.slice(0, 10) : '')
  const [dateFin, setDateFin] = useState(contrat.date_fin ? contrat.date_fin.slice(0, 10) : '')
  const [proprietaireId, setProprietaireId] = useState(contrat.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReferenceFournisseur(contrat.reference_fournisseur ?? '')
    setDateDebut(contrat.date_debut ? contrat.date_debut.slice(0, 10) : '')
    setDateFin(contrat.date_fin ? contrat.date_fin.slice(0, 10) : '')
    setProprietaireId(contrat.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, contrat])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateContrat.mutateAsync({
        id: contrat.id,
        reference_fournisseur: referenceFournisseur || null,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        proprietaire_id: proprietaireId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le contrat" description="Mettre à jour les informations du contrat.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Référence fournisseur">
          <Input value={referenceFournisseur} onChange={(e) => setReferenceFournisseur(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date de début">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </FormField>
          <FormField label="Date de fin">
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </FormField>
        </div>
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
          <Button type="submit" disabled={updateContrat.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
