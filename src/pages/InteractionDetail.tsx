import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useInteractions, useUpdateInteraction, useDeleteInteraction } from '@/lib/data/interactions'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import type { Interaction } from '@/types/domain'

const SENS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'entrant', label: 'Entrant' },
  { value: 'sortant', label: 'Sortant' },
]

export default function InteractionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: interactions } = useInteractions()
  const interaction = interactions?.find((i) => i.id === id)
  const deleteInteraction = useDeleteInteraction()

  const canManage = useCanManage(interaction?.proprietaire_id)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    if (!interaction) return
    await deleteInteraction.mutateAsync(interaction.id)
    navigate('/interactions')
  }

  return (
    <div>
      <Topbar crumb="Interactions" title={interaction?.objet || interaction?.type_interaction || 'Interaction'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/interactions')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux interactions
        </Button>

        {!interaction ? (
          <p className="text-sm text-navy-500">Interaction introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{interaction.objet || interaction.type_interaction}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{interaction.type_interaction}</Badge>
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
              <p>
                <span className="text-navy-400">Compte :</span>{' '}
                {interaction.compte_id ? (
                  <EntityLink to={`/comptes/${interaction.compte_id}`}>{interaction.compte_nom}</EntityLink>
                ) : (
                  interaction.compte_nom || '—'
                )}
              </p>
              <p>
                <span className="text-navy-400">Site :</span>{' '}
                {interaction.site_id ? (
                  <EntityLink to={`/sites/${interaction.site_id}`}>{interaction.site_nom}</EntityLink>
                ) : (
                  interaction.site_nom || '—'
                )}
              </p>
              {interaction.contact_nom && (
                <p>
                  <span className="text-navy-400">Contact :</span>{' '}
                  {interaction.contact_id ? (
                    <EntityLink to={`/contacts/${interaction.contact_id}`}>{interaction.contact_nom}</EntityLink>
                  ) : (
                    interaction.contact_nom
                  )}
                </p>
              )}
              {interaction.sens && (
                <p><span className="text-navy-400">Sens :</span> {interaction.sens}</p>
              )}
              {interaction.resume && (
                <p><span className="text-navy-400">Résumé :</span> {interaction.resume}</p>
              )}
              {interaction.resultat && (
                <p><span className="text-navy-400">Résultat :</span> {interaction.resultat}</p>
              )}
              {interaction.issue_libelle && (
                <p><span className="text-navy-400">Motif / issue :</span> <Badge tone="amber">{interaction.issue_libelle}</Badge></p>
              )}
              <p><span className="text-navy-400">Auteur :</span> {interaction.auteur}</p>
              <p><span className="text-navy-400">Date :</span> {new Date(interaction.date_interaction).toLocaleDateString('fr-FR')}</p>
              <HistoriqueDiscret tableNom="interactions" ligneId={interaction.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {interaction && (
        <>
          <EditInteractionDialog open={editOpen} onClose={() => setEditOpen(false)} interaction={interaction} />

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer cette interaction ?"
            description="Cette action est irréversible."
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteInteraction.isPending} onClick={handleDelete}>
                Supprimer définitivement
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  )
}

function EditInteractionDialog({ open, onClose, interaction }: { open: boolean; onClose: () => void; interaction: Interaction }) {
  const updateInteraction = useUpdateInteraction()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [dateInteraction, setDateInteraction] = useState(interaction.date_interaction ? interaction.date_interaction.slice(0, 10) : '')
  const [sens, setSens] = useState(interaction.sens ?? '')
  const [objet, setObjet] = useState(interaction.objet ?? '')
  const [resume, setResume] = useState(interaction.resume ?? '')
  const [resultat, setResultat] = useState(interaction.resultat ?? '')
  const [proprietaireId, setProprietaireId] = useState(interaction.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDateInteraction(interaction.date_interaction ? interaction.date_interaction.slice(0, 10) : '')
    setSens(interaction.sens ?? '')
    setObjet(interaction.objet ?? '')
    setResume(interaction.resume ?? '')
    setResultat(interaction.resultat ?? '')
    setProprietaireId(interaction.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, interaction])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateInteraction.mutateAsync({
        id: interaction.id,
        date_interaction: dateInteraction ? new Date(dateInteraction).toISOString() : interaction.date_interaction,
        sens: sens || null,
        objet: objet || null,
        resume: resume || null,
        resultat: resultat || null,
        proprietaire_id: proprietaireId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier l'interaction" description="Mettre à jour les informations de l'interaction.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date">
            <Input type="date" value={dateInteraction} onChange={(e) => setDateInteraction(e.target.value)} required />
          </FormField>
          <FormField label="Sens">
            <Select value={sens} onChange={(e) => setSens(e.target.value)}>
              {SENS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Objet">
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. Point sur le renouvellement" />
        </FormField>
        <FormField label="Résumé">
          <Textarea rows={2} value={resume} onChange={(e) => setResume(e.target.value)} />
        </FormField>
        <FormField label="Résultat">
          <Input value={resultat} onChange={(e) => setResultat(e.target.value)} />
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
          <Button type="submit" disabled={updateInteraction.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
