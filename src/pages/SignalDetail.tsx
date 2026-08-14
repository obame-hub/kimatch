import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Radio, Pencil, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Textarea } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useSignal, useUpdateSignal, useDeleteSignal } from '@/lib/data/signaux'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage } from '@/lib/data/roles'
import { FALLBACK_STATUTS_SIGNAUX } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import type { Signal } from '@/types/domain'

export default function SignalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: signal } = useSignal(id)
  const { data: statutsRef } = useReferenceTable('statuts_signaux')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_SIGNAUX
  const canManage = useCanManage(signal?.proprietaire_id)
  const deleteSignal = useDeleteSignal()
  const goBack = useGoBack('/signaux')

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    if (!signal) return
    await deleteSignal.mutateAsync(signal.id)
    navigate('/signaux')
  }

  return (
    <div>
      <Topbar crumb="Signaux" title={signal?.type_signal ?? 'Signal'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux signaux
        </Button>

        {!signal ? (
          <p className="text-sm text-navy-500">Signal introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
                    <Radio className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{signal.type_signal}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="amber">{statuts.find((s) => s.code === signal.statut)?.libelle ?? signal.statut}</Badge>
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
              <p><span className="text-navy-400">Site :</span> <EntityLink to={`/sites/${signal.site_id}`}>{signal.site_nom}</EntityLink></p>
              {signal.recommandation_id && (
                <p>
                  <span className="text-navy-400">Recommandation liée :</span>{' '}
                  <EntityLink to={`/recommandations/${signal.recommandation_id}`}>{signal.recommandation_nom}</EntityLink>
                </p>
              )}
              {signal.conseiller && <p><span className="text-navy-400">Responsable :</span> {signal.conseiller}</p>}
              <p><span className="text-navy-400">Créé le :</span> {new Date(signal.date_creation).toLocaleDateString('fr-FR')}</p>
              <p><span className="text-navy-400">Gravité :</span> {signal.gravite != null ? `${signal.gravite}/100` : 'Non qualifiée'}</p>
              {signal.description && <p className="text-navy-600">{signal.description}</p>}
              <HistoriqueDiscret tableNom="signaux" ligneId={signal.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {signal && (
        <>
          <EditSignalDialog open={editOpen} onClose={() => setEditOpen(false)} signal={signal} />

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer ce signal ?"
            description="Cette action est irréversible."
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteSignal.isPending} onClick={handleDelete}>
                Supprimer définitivement
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  )
}

function EditSignalDialog({ open, onClose, signal }: { open: boolean; onClose: () => void; signal: Signal }) {
  const updateSignal = useUpdateSignal()
  const [description, setDescription] = useState(signal.description ?? '')
  const [gravite, setGravite] = useState(signal.gravite != null ? String(signal.gravite) : '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDescription(signal.description ?? '')
    setGravite(signal.gravite != null ? String(signal.gravite) : '')
    setFeedback(null)
  }, [open, signal])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateSignal.mutateAsync({
        id: signal.id,
        commentaire: description || null,
        gravite: gravite === '' ? null : Math.max(0, Math.min(100, Number(gravite))),
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le signal" description="Mettre à jour la description du signal.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Description">
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Gravité (0 à 100, laisser vide si non qualifiée)">
          <Input type="number" min={0} max={100} value={gravite} onChange={(e) => setGravite(e.target.value)} placeholder="Ex. 70" />
        </FormField>
        {feedback && <p className="text-xs text-red-600">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={updateSignal.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
