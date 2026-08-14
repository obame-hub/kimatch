import { useEffect, useState } from 'react'
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useDocument, useUpdateDocument, useDeleteDocument } from '@/lib/data/documents'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { entityRoute } from '@/lib/entityRoute'
import { useGoBack } from '@/lib/useGoBack'
import type { DocumentItem } from '@/types/domain'

export default function DocumentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: doc } = useDocument(id)
  const canManage = useCanManage(doc?.proprietaire_id)
  const deleteDocument = useDeleteDocument()
  const goBack = useGoBack('/documents')

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    if (!doc) return
    await deleteDocument.mutateAsync(doc.id)
    navigate('/documents')
  }

  return (
    <div>
      <Topbar crumb="Documents" title={doc?.nom ?? 'Document'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux documents
        </Button>

        {!doc ? (
          <p className="text-sm text-navy-500">Document introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                  <FileText className="h-5 w-5" />
                </span>
                <CardTitle className="font-display text-base flex-1">{doc.nom}</CardTitle>
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
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p><span className="text-navy-400">Type :</span> <Badge tone="neutral">{doc.type_document}</Badge></p>
              <p>
                <span className="text-navy-400">Objet lié :</span>{' '}
                {entityRoute(doc.entite_type, doc.entite_id) ? (
                  <EntityLink to={entityRoute(doc.entite_type, doc.entite_id) as string}>{doc.objet_lie}</EntityLink>
                ) : (
                  doc.objet_lie
                )}
              </p>
              <p><span className="text-navy-400">Auteur :</span> {doc.auteur}</p>
              <p><span className="text-navy-400">Date :</span> {new Date(doc.date_creation).toLocaleDateString('fr-FR')}</p>

              <HistoriqueDiscret tableNom="documents" ligneId={doc.id} />
            </CardContent>
          </Card>
        )}

        {/* Aperçu en pleine largeur, sous les informations : demande d'Agathe (07/08/2026),
            basculer d'onglet pour chaque pièce fait perdre le fil. Un contrat fait souvent une
            trentaine de pages — le confiner dans la colonne des informations le rendrait
            illisible. L'ouverture en onglet reste proposée sous l'aperçu. */}
        {doc?.url && (
          <div className="mt-4">
            <ApercuDocument url={doc.url} nomFichier={doc.nom_fichier || doc.nom} />
          </div>
        )}
      </div>

      {doc && (
        <>
          {editOpen && <EditDocumentDialog open={editOpen} onClose={() => setEditOpen(false)} doc={doc} />}

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer ce document ?"
            description="Cette action est irréversible."
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteDocument.isPending} onClick={handleDelete}>
                Supprimer définitivement
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  )
}

function EditDocumentDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: DocumentItem }) {
  const updateDocument = useUpdateDocument()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [nom, setNom] = useState(doc.nom)
  const [nomFichier, setNomFichier] = useState(doc.nom_fichier)
  const [url, setUrl] = useState(doc.url)
  const [proprietaireId, setProprietaireId] = useState(doc.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNom(doc.nom)
    setNomFichier(doc.nom_fichier)
    setUrl(doc.url)
    setProprietaireId(doc.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, doc])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateDocument.mutateAsync({
        id: doc.id,
        nom,
        nom_fichier: nomFichier,
        url,
        proprietaire_id: proprietaireId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le document" description="Mettre à jour les informations du document.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du document">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </FormField>
        <FormField label="Nom du fichier">
          <Input value={nomFichier} onChange={(e) => setNomFichier(e.target.value)} required />
        </FormField>
        <FormField label="URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} required />
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
          <Button type="submit" disabled={updateDocument.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
