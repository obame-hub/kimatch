import { useState } from 'react'
import { ApercuDocument } from '@/components/document/ApercuDocument'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useDocument, useUpdateDocumentPartiel, useDeleteDocument, type PatchDocument } from '@/lib/data/documents'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { entityRoute } from '@/lib/entityRoute'
import { useGoBack } from '@/lib/useGoBack'

export default function DocumentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: doc } = useDocument(id)
  const canManage = useCanManage(doc?.proprietaire_id)
  const deleteDocument = useDeleteDocument()
  const goBack = useGoBack('/documents')

  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  // Edition en place : la modale « Modifier » disparait.
  const updateDocumentPartiel = useUpdateDocumentPartiel()
  const majDocument = async (patch: PatchDocument) => {
    await updateDocumentPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  const retourInline = {
    onSaved: () => { setToast('✓ enregistré'); setTimeout(() => setToast(null), 2200) },
    onError: (e: Error) => { setToast(`Erreur : ${e.message}`); setTimeout(() => setToast(null), 2200) },
  }
  const [confirmDelete, setConfirmDelete] = useState(false)

  const suppression = useSuppression()

  function handleDelete() {
    if (!doc) return
    suppression.supprimer(
      () => deleteDocument.mutateAsync(doc.id),
      () => navigate('/documents'),
    )
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
          <p className="text-sm text-km-muted">Document introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-km-soft text-km-muted">
                  <FileText className="h-5 w-5" />
                </span>
                <CardTitle className="font-display text-base flex-1">{doc.nom}</CardTitle>
                {canManage && (
                  <div className="flex gap-1.5">
                    {/* Plus de bouton « Modifier » : tout s'edite en place ci-dessous. */}
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p><span className="text-km-faint">Type :</span> <Badge tone="neutral">{doc.type_document}</Badge></p>
              <p>
                <span className="text-km-faint">Objet lié :</span>{' '}
                {entityRoute(doc.entite_type, doc.entite_id) ? (
                  <EntityLink to={entityRoute(doc.entite_type, doc.entite_id) as string}>{doc.objet_lie}</EntityLink>
                ) : (
                  doc.objet_lie
                )}
              </p>
              <p><span className="text-km-faint">Auteur :</span> {doc.auteur}</p>
              <p><span className="text-km-faint">Date :</span> {new Date(doc.date_creation).toLocaleDateString('fr-FR')}</p>

              {/* Edition en place : renommer une piece mal nommee a l'import ne merite pas une
                  modale. L'URL et le nom de fichier restent modifiables -- c'est ce qui permet
                  de reparer un lien casse -- mais tous trois refusent le vide : le document
                  deviendrait introuvable et l'apercu ne saurait plus quoi charger. */}
              {canManage && (
                <div className="space-y-3 border-t border-km-line pt-3">
                  <InlineField
                    variant="text"
                    label="Nom du document"
                    value={doc.nom}
                    onCommit={async (v) => {
                      if (v.trim() === '') throw new Error('Le nom du document est obligatoire.')
                      await majDocument({ nom: v.trim() })
                    }}
                    {...retourInline}
                  />
                  <InlineField
                    variant="text" mono
                    label="Nom du fichier"
                    value={doc.nom_fichier}
                    onCommit={async (v) => {
                      if (v.trim() === '') throw new Error('Le nom du fichier est obligatoire.')
                      await majDocument({ nom_fichier: v.trim() })
                    }}
                    {...retourInline}
                  />
                  <InlineField
                    variant="text" mono
                    label="URL"
                    value={doc.url}
                    onCommit={async (v) => {
                      if (v.trim() === '') throw new Error("L'URL est obligatoire : sans elle le document n'est plus consultable.")
                      await majDocument({ url: v.trim() })
                    }}
                    {...retourInline}
                  />
                  {isAdmin && (
                    <InlineField
                      variant="select"
                      label="Propriétaire"
                      emptyLabel="aucun"
                      value={doc.proprietaire_id ?? ''}
                      options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                      onCommit={(v) => majDocument({ proprietaire_id: v || null })}
                      {...retourInline}
                    />
                  )}
                </div>
              )}

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

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer ce document ?"
            description="Cette action est irréversible."
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
        </>
      )}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}
