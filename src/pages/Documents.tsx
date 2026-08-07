import { useState } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useDocuments, useCreateDocument } from '@/lib/data/documents'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useMandats } from '@/lib/data/mandats'
import { useRecommandations } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useCompteurs } from '@/lib/data/compteurs'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { entityRoute } from '@/lib/entityRoute'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'

const ENTITE_TYPE_OPTIONS = [
  { value: 'site', label: 'Site' },
  { value: 'compte', label: 'Compte' },
  { value: 'mandat', label: 'Mandat' },
  { value: 'recommandation', label: 'Recommandation' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'compteur', label: 'Compteur' },
]

function CreateDocumentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: comptes } = useComptes()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandations()
  const { data: contrats } = useContrats()
  const { data: compteurs } = useCompteurs()
  const { data: typesRef } = useReferenceTable('types_documents')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_DOCUMENTS
  const createDocument = useCreateDocument()

  const [nom, setNom] = useState('')
  const [url, setUrl] = useState('')
  const [typeDocumentId, setTypeDocumentId] = useState('')
  const [entiteType, setEntiteType] = useState('')
  const [entiteId, setEntiteId] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const entiteOptions =
    entiteType === 'site' ? sites?.map((s) => ({ id: s.id, label: s.nom })) ?? [] :
    entiteType === 'compte' ? comptes?.map((c) => ({ id: c.id, label: c.nom })) ?? [] :
    entiteType === 'mandat' ? mandats?.map((m) => ({ id: m.id, label: m.compte_nom })) ?? [] :
    entiteType === 'recommandation' ? recommandations?.map((r) => ({ id: r.id, label: r.titre })) ?? [] :
    entiteType === 'contrat' ? contrats?.map((c) => ({ id: c.id, label: `${c.fournisseur_nom} — ${c.site_nom}` })) ?? [] :
    entiteType === 'compteur' ? compteurs?.map((c) => ({ id: c.id, label: `${c.utilisation || c.numero_pdl} — ${c.site_nom}` })) ?? [] :
    []

  function reset() {
    setNom('')
    setUrl('')
    setTypeDocumentId('')
    setEntiteType('')
    setEntiteId('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!entiteType || !entiteId) return
    const type = types.find((t) => t.id === typeDocumentId)

    const result = await createDocument.mutateAsync({
      nom,
      url,
      type_document_id: typeDocumentId || null,
      type_document_libelle: type?.libelle ?? '',
      entite_type: entiteType,
      entite_id: entiteId,
    })
    setFeedback(result.persisted ? 'Document créé.' : 'Document ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau document" description="Rattacher un document à une fiche existante.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Mandat signé — Cabinet Durand" />
        </FormField>
        <FormField label="Lien du document (URL)">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://…"
          />
        </FormField>
        <FormField label="Type de document">
          <Select value={typeDocumentId} onChange={(e) => setTypeDocumentId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Rattaché à">
          <Select value={entiteType} onChange={(e) => { setEntiteType(e.target.value); setEntiteId('') }} required>
            <option value="">Type d'entité…</option>
            {ENTITE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FormField>
        {entiteType && (
          <FormField label="Fiche">
            <Select value={entiteId} onChange={(e) => setEntiteId(e.target.value)} required>
              <option value="">Sélectionner…</option>
              {entiteOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
          </FormField>
        )}
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createDocument.isPending}>Créer le document</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Documents() {
  const { data: documents, isLoading } = useDocuments()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { query, setQuery, sortKey, setSortKey, items: filteredDocuments } = useListControls(documents, {
    searchFields: (d) => [d.nom, d.objet_lie, d.auteur, d.type_document],
    sorters: {
      date_creation: (a, b) => b.date_creation.localeCompare(a.date_creation),
      nom: (a, b) => a.nom.localeCompare(b.nom),
      type_document: (a, b) => a.type_document.localeCompare(b.type_document),
    },
    defaultSort: 'date_creation',
  })

  const tranche = useTranchesAffichage(filteredDocuments, `${query}|${sortKey}`)

  return (
    <div>
      <Topbar title="Documents" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Documents"
          description="Tous les documents (mandats, factures, contrats, recommandations) centralisés en un seul endroit."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau document</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un document, un auteur…" count={filteredDocuments?.length}>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="date_creation">Trier par date</option>
            <option value="nom">Trier par nom</option>
            <option value="type_document">Trier par type</option>
          </Select>
        </ListToolbar>

        <div className="space-y-2.5">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {!isLoading && documents?.length === 0 && (
            <p className="py-8 text-center text-sm text-navy-400">
              Aucun document pour l'instant — mandats signés, factures, contrats et pièces jointes de recommandations apparaîtront ici.
            </p>
          )}
          {!isLoading && documents && documents.length > 0 && filteredDocuments?.length === 0 && (
            <p className="py-8 text-center text-sm text-navy-400">Aucun document ne correspond à la recherche.</p>
          )}
          {tranche.visibles.map((doc) => (
            <Card
              key={doc.id}
              onClick={() => navigate(`/documents/${doc.id}`)}
              className="animate-fade-up flex cursor-pointer items-center justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-navy-800">{doc.nom}</p>
                  <p className="text-xs text-navy-500">
                    {entityRoute(doc.entite_type, doc.entite_id) ? (
                      <EntityLink to={entityRoute(doc.entite_type, doc.entite_id) as string}>{doc.objet_lie}</EntityLink>
                    ) : (
                      doc.objet_lie
                    )}
                    {' · '}{doc.auteur}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="neutral">{doc.type_document}</Badge>
                <span className="text-xs text-navy-400">{new Date(doc.date_creation).toLocaleDateString('fr-FR')}</span>
              </div>
            </Card>
          ))}
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="documents"
          />
        </div>
      </div>
      <CreateDocumentDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
