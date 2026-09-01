import { useState } from 'react'
import { useListeServeur } from '@/lib/useListeServeur'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { FileText, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useCreateDocument } from '@/lib/data/documents'
import { useSites } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useMandats } from '@/lib/data/mandats'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useContrats } from '@/lib/data/contrats'
import { useCompteurs } from '@/lib/data/compteurs'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { entityRoute } from '@/lib/entityRoute'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

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
  const { data: recommandations } = useRecommandationsListe()
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
          {/* OBLIGATOIRE : `documents.type_document_id` est NOT NULL sans valeur par défaut. Laissé
              vide, il était omis de l'insertion, la base refusait la ligne, et l'écran annonçait un
              enregistrement local — le document n'existait pas. Dernier formulaire du circuit dans ce
              cas ; les autres (compteur, contrat, interaction, tâche, signal) sont désormais fermés. */}
          <Select value={typeDocumentId} onChange={(e) => setTypeDocumentId(e.target.value)} required>
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
        {feedback && <p className="text-xs text-km-muted">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createDocument.isPending}>Créer le document</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Une ligne de la liste, telle que `v_documents_liste` la renvoie. */
interface LigneDocument {
  id: string
  nom: string
  type_document: string | null
  auteur: string
  objet_lie: string | null
  entite_type: string | null
  entite_id: string | null
  date_creation: string
}

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Documents({ sansEntete }: { sansEntete?: boolean }) {
  const [showCreate, setShowCreate] = useState(false)
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))

  /**

   * « LES MIENS » PAR DEFAUT, « TOUS » D'UN CLIC. Ce n'est pas une restriction : la base

   * laisse tout passer, et c'est la decision du 14/08 qu'on ne defait pas. Seul l'affichage

   * par defaut change, parce qu'on travaille d'abord son propre portefeuille — et il se

   * defait d'un clic quand on reprend celui d'un collegue absent.

   *

   * Le filtre part en base : le total du pied de liste suit, sans quoi il annoncerait un

   * nombre que la liste ne montre pas.

   */

  const { data: monProfil } = useMonProfil()

  const { perimetre, setPerimetre } = usePerimetre('documents')

  const filtreProprietaire = perimetre === 'moi' && monProfil?.id ? monProfil.id : null


  const liste = useListeServeur<LigneDocument>({
    vue: 'v_documents_liste',
    filtres: { proprietaire_id: filtreProprietaire },
    colonnesRecherche: ['nom', 'objet_lie', 'auteur', 'type_document'],
    triParDefaut: 'date_creation',
    sensParDefaut: 'desc',
  })

  return (
    <div>
      {!sansEntete && <Topbar title="Documents" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          titreMasque={sansEntete}
          title="Documents"
          description="Tous les documents (mandats, factures, contrats, recommandations) centralisés en un seul endroit."
          actions={sansEntete ? undefined : <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau document</Button>}
        />

        <ListToolbar query={liste.query} onQueryChange={liste.setQuery} placeholder="Rechercher un document, un auteur…" count={liste.total}>
          <BasculePerimetre valeur={perimetre} onChange={setPerimetre} libelleMien="Mes documents" libelleTous="Tous les documents" />
          <Select value={liste.tri} onChange={(e) => liste.trierPar(e.target.value)} className="w-auto">
            <option value="date_creation">Trier par date</option>
            <option value="nom">Trier par nom</option>
            <option value="type_document">Trier par type</option>
          </Select>
        </ListToolbar>

        <div className="space-y-2.5">
          {liste.isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
          {liste.erreur && <p className="py-8 text-center text-sm text-km-red">{liste.erreur}</p>}
          {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
            <p className="py-8 text-center text-sm text-km-faint">
              {liste.query.trim()
                ? 'Aucun document ne correspond à la recherche.'
                : "Aucun document pour l'instant — mandats signés, factures, contrats et pièces jointes de recommandations apparaîtront ici."}
            </p>
          )}
          {liste.lignes.map((doc) => (
            <Card
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="animate-fade-up flex cursor-pointer items-center justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-km-text">{doc.nom}</p>
                  <p className="text-xs text-km-muted">
                    {doc.entite_type && doc.entite_id && entityRoute(doc.entite_type, doc.entite_id) ? (
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
                <span className="text-xs text-km-faint">{new Date(doc.date_creation).toLocaleDateString('fr-FR')}</span>
              </div>
            </Card>
          ))}
          <PiedDeListe
            affiches={liste.lignes.length}
            total={liste.total}
            reste={liste.reste}
            onAfficherPlus={liste.afficherPlus}
            tailleTrancheSuivante={liste.tailleTrancheSuivante}
            libelle="documents"
          />
        </div>
      </div>
      {showCreate && <CreateDocumentDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
