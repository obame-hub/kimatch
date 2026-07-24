import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSignature, Zap, Flame, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useContrats, useCreateContrat } from '@/lib/data/contrats'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useCompteurs } from '@/lib/data/compteurs'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE, FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { ExtractDocumentButton } from '@/components/ui/document-extraction'
import { cn } from '@/lib/utils'

function CreateContratDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: compteurs } = useCompteurs()
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const createContrat = useCreateContrat()

  const [siteId, setSiteId] = useState('')
  const [fournisseurId, setFournisseurId] = useState('')
  const [typeEnergieId, setTypeEnergieId] = useState('')
  const [referenceFournisseur, setReferenceFournisseur] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [compteurIds, setCompteurIds] = useState<string[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)

  const fournisseurs = comptes?.filter((c) => c.type_compte === 'fournisseur') ?? []
  const compteursDuSite = compteurs?.filter((c) => c.site_id === siteId) ?? []

  function reset() {
    setSiteId('')
    setFournisseurId('')
    setTypeEnergieId('')
    setReferenceFournisseur('')
    setDateDebut('')
    setDateFin('')
    setCompteurIds([])
    setFeedback(null)
  }

  function toggleCompteur(id: string) {
    setCompteurIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  function handleExtracted(fields: Record<string, { value: string | number | null; confidence: number }>) {
    const refFournisseur = fields.reference_fournisseur?.value
    if (typeof refFournisseur === 'string' && refFournisseur) setReferenceFournisseur(refFournisseur)
    const debut = fields.date_debut?.value
    if (typeof debut === 'string' && debut) setDateDebut(debut)
    const fin = fields.date_fin?.value
    if (typeof fin === 'string' && fin) setDateFin(fin)
    const fournNom = (fields.fournisseur_nom?.value ?? '').toString().toLowerCase()
    if (fournNom) {
      const match = fournisseurs.find((f) => f.nom.toLowerCase().includes(fournNom) || fournNom.includes(f.nom.toLowerCase()))
      if (match) setFournisseurId(match.id)
    }
    const energieCode = (fields.type_energie?.value ?? '').toString().toLowerCase()
    if (energieCode) {
      const match = energies.find((en) => en.code?.toLowerCase() === energieCode)
      if (match) setTypeEnergieId(match.id)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const site = sites?.find((s) => s.id === siteId)
    const fournisseur = fournisseurs.find((f) => f.id === fournisseurId)
    const energie = energies.find((en) => en.id === typeEnergieId)
    const statutActif = statuts.find((s) => s.code === 'ACTIF')
    const compteursChoisis = compteursDuSite.filter((c) => compteurIds.includes(c.id)).map((c) => ({ id: c.id, contrat_compteur_id: null, numero_pdl: c.numero_pdl, utilisation: c.utilisation }))
    if (!site) return
    const typeEnergie = (energie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'

    const result = await createContrat.mutateAsync({
      site_id: site.id,
      site_nom: site.nom,
      fournisseur_compte_id: fournisseurId || null,
      fournisseur_nom: fournisseur?.nom ?? '',
      type_energie_id: typeEnergieId || null,
      type_energie: typeEnergie,
      statut_id: statutActif?.id ?? null,
      reference_fournisseur: referenceFournisseur || null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      compteur_ids: compteurIds,
      compteurs: compteursChoisis,
    })
    setFeedback(result.persisted ? 'Contrat créé.' : 'Contrat ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau contrat" description="Contrat de fourniture d'énergie pour un site.">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <ExtractDocumentButton onExtracted={handleExtracted} />
        <FormField label="Site">
          <Select value={siteId} onChange={(e) => { setSiteId(e.target.value); setCompteurIds([]) }} required>
            <option value="">Sélectionner un site…</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Fournisseur">
          <Select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Énergie">
          <Select value={typeEnergieId} onChange={(e) => setTypeEnergieId(e.target.value)} required>
            <option value="">Sélectionner…</option>
            {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
          </Select>
        </FormField>
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
        {siteId && (
          <FormField label="Compteurs couverts">
            {compteursDuSite.length === 0 ? (
              <p className="text-xs text-navy-400">Ce site n'a aucun compteur.</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-navy-200 p-2">
                {compteursDuSite.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-navy-700">
                    <input type="checkbox" checked={compteurIds.includes(c.id)} onChange={() => toggleCompteur(c.id)} />
                    {c.numero_pdl} — {c.utilisation}
                  </label>
                ))}
              </div>
            )}
          </FormField>
        )}
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createContrat.isPending}>Créer le contrat</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Contrats() {
  const { data: contrats, isLoading } = useContrats()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [statutFilter, setStatutFilter] = useState('')

  const contratsFiltresParStatut = statutFilter ? contrats?.filter((c) => c.statut === statutFilter) : contrats

  const { query, setQuery, sortKey, setSortKey, items: filteredContrats } = useListControls(contratsFiltresParStatut, {
    searchFields: (c) => [c.fournisseur_nom, c.site_nom, c.reference_fournisseur],
    sorters: {
      site_nom: (a, b) => a.site_nom.localeCompare(b.site_nom),
      fournisseur_nom: (a, b) => a.fournisseur_nom.localeCompare(b.fournisseur_nom),
      date_debut: (a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? ''),
      date_fin: (a, b) => (a.date_fin ?? '').localeCompare(b.date_fin ?? ''),
    },
    defaultSort: 'site_nom',
  })

  return (
    <div>
      <Topbar title="Contrats" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Contrats"
          description="Contrats de fourniture d'énergie liés à chaque site — électricité et gaz."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau contrat</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un fournisseur, un site…">
          <Select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="w-auto">
            <option value="">Tous les statuts</option>
            {statuts.map((s) => <option key={s.id} value={s.code}>{s.libelle}</option>)}
          </Select>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="site_nom">Trier par site</option>
            <option value="fournisseur_nom">Trier par fournisseur</option>
            <option value="date_debut">Trier par date de début</option>
            <option value="date_fin">Trier par date de fin</option>
          </Select>
        </ListToolbar>

        {!isLoading && contrats && contrats.length > 0 && filteredContrats?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">Aucun contrat ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {filteredContrats?.map((c) => {
            const label = statuts.find((s) => s.code === c.statut)?.libelle ?? c.statut
            const Icon = c.type_energie === 'gaz' ? Flame : Zap
            return (
              <Card
                key={c.id}
                onClick={() => navigate(`/contrats/${c.id}`)}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', c.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="font-display font-medium text-navy-800">{c.fournisseur_nom}</p>
                  </div>
                  <Badge tone={STATUT_CONTRAT_TONE[c.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-navy-500">
                  <p>Site : <EntityLink to={`/sites/${c.site_id}`}>{c.site_nom}</EntityLink></p>
                  {c.reference_fournisseur && <p>Référence : {c.reference_fournisseur}</p>}
                  <p>
                    {c.date_debut ? new Date(c.date_debut).toLocaleDateString('fr-FR') : '—'}
                    {' → '}
                    {c.date_fin ? new Date(c.date_fin).toLocaleDateString('fr-FR') : '—'}
                  </p>
                  {c.compteurs.length > 0 && <p>{c.compteurs.length} compteur{c.compteurs.length > 1 ? 's' : ''} couvert{c.compteurs.length > 1 ? 's' : ''}</p>}
                </div>
              </Card>
            )
          })}
        </div>
        {!isLoading && contrats?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-navy-400">
            <FileSignature className="h-8 w-8" />
            <p className="text-sm">Aucun contrat pour le moment.</p>
          </div>
        )}
      </div>
      <CreateContratDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
