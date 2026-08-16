import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckSquare, Check, Pencil, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useAction, useUpdateAction, useDeleteAction, useCompleteAction } from '@/lib/data/actions'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_ACTIONS, STATUT_ACTION_TONE } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import type { ActionItem } from '@/types/domain'

export default function ActionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: action } = useAction(id)
  const { data: statutsRef } = useReferenceTable('statuts_actions')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_ACTIONS
  const canManage = useCanManage(action?.proprietaire_id)
  const deleteAction = useDeleteAction()
  const completeAction = useCompleteAction()
  const goBack = useGoBack('/taches')

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const suppression = useSuppression()

  function handleDelete() {
    if (!action) return
    suppression.supprimer(
      () => deleteAction.mutateAsync(action.id),
      () => navigate('/taches'),
    )
  }

  const estTerminee = action?.statut === 'TERMINEE' || action?.statut === 'ANNULEE'

  return (
    <div>
      <Topbar crumb="Tâches" title={action?.titre ?? 'Tâche'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux tâches
        </Button>

        {!action ? (
          <p className="text-sm text-navy-500">Tâche introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <CheckSquare className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{action.titre}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUT_ACTION_TONE[action.statut] ?? 'neutral'}>
                    {statuts.find((s) => s.code === action.statut)?.libelle ?? action.statut}
                  </Badge>
                  {canManage && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 space-y-3 text-sm">
              <p><span className="text-navy-400">Type :</span> {action.type_action}</p>
              <p><span className="text-navy-400">Priorité :</span> {action.priorite}</p>
              {action.responsable && <p><span className="text-navy-400">Responsable :</span> {action.responsable}</p>}
              <p><span className="text-navy-400">Créée le :</span> {new Date(action.date_creation).toLocaleDateString('fr-FR')}</p>
              <p>
                <span className="text-navy-400">Échéance :</span>{' '}
                {action.echeance ? new Date(action.echeance).toLocaleDateString('fr-FR') : '—'}
              </p>
              {action.date_realisation && (
                <p><span className="text-navy-400">Terminée le :</span> {new Date(action.date_realisation).toLocaleDateString('fr-FR')}</p>
              )}
              {action.site_id && (
                <p><span className="text-navy-400">Site :</span> <EntityLink to={`/sites/${action.site_id}`}>{action.cible_label}</EntityLink></p>
              )}
              {action.contact_id && (
                <p><span className="text-navy-400">Contact :</span> <EntityLink to={`/contacts/${action.contact_id}`}>{action.contact_nom}</EntityLink></p>
              )}
              {action.recommandation_id && (
                <p><span className="text-navy-400">Recommandation liée :</span> <EntityLink to={`/recommandations/${action.recommandation_id}`}>{action.recommandation_titre}</EntityLink></p>
              )}
              {action.commentaire && <p className="text-navy-600">{action.commentaire}</p>}

              {!estTerminee && (
                <Button size="sm" onClick={() => completeAction.mutate(action.id)}>
                  <Check className="h-3.5 w-3.5" />
                  Marquer terminée
                </Button>
              )}

              <HistoriqueDiscret tableNom="actions" ligneId={action.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {action && (
        <>
          {editOpen && <EditActionDialog open={editOpen} onClose={() => setEditOpen(false)} action={action} />}

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer cette tâche ?"
            description="Cette action est irréversible."
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
        </>
      )}
    </div>
  )
}

function EditActionDialog({ open, onClose, action }: { open: boolean; onClose: () => void; action: ActionItem }) {
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()
  const updateAction = useUpdateAction()

  const [titre, setTitre] = useState(action.titre)
  const [priorite, setPriorite] = useState(String(action.priorite))
  const [echeance, setEcheance] = useState(action.echeance ? action.echeance.slice(0, 10) : '')
  const [commentaire, setCommentaire] = useState(action.commentaire ?? '')
  const [siteId, setSiteId] = useState(action.site_id ?? '')
  const [contactId, setContactId] = useState(action.contact_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitre(action.titre)
    setPriorite(String(action.priorite))
    setEcheance(action.echeance ? action.echeance.slice(0, 10) : '')
    setCommentaire(action.commentaire ?? '')
    setSiteId(action.site_id ?? '')
    setContactId(action.contact_id ?? '')
    setFeedback(null)
  }, [open, action])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateAction.mutateAsync({
        id: action.id,
        titre,
        priorite: Number(priorite) || action.priorite,
        echeance: echeance || null,
        commentaire: commentaire || null,
        site_id: siteId || null,
        contact_id: contactId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier la tâche" description="Mettre à jour les informations de la tâche.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Priorité">
            <Input type="number" value={priorite} onChange={(e) => setPriorite(e.target.value)} />
          </FormField>
          <FormField label="Échéance">
            <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Site">
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">—</option>
              {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </Select>
          </FormField>
          <FormField label="Contact">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {contacts?.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Commentaire">
          <Textarea rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </FormField>
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateAction.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
