import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Radio, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useSignal, useUpdateSignalPartiel, useDeleteSignal, type PatchSignal } from '@/lib/data/signaux'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_SIGNAUX } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'

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

  const [confirmDelete, setConfirmDelete] = useState(false)

  // Edition en place : la modale « Modifier » disparait.
  const updateSignalPartiel = useUpdateSignalPartiel()
  const majSignal = async (patch: PatchSignal) => {
    await updateSignalPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  const retourInline = {
    onSaved: () => { setToast('✓ enregistré'); setTimeout(() => setToast(null), 2200) },
    onError: (e: Error) => { setToast(`Erreur : ${e.message}`); setTimeout(() => setToast(null), 2200) },
  }

  const suppression = useSuppression()

  function handleDelete() {
    if (!signal) return
    suppression.supprimer(
      () => deleteSignal.mutateAsync(signal.id),
      () => navigate('/signaux'),
    )
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
                      {/* Plus de bouton « Modifier » : gravite et description s'editent en place. */}
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
              {/* Edition en place : la gravite d'un signal se requalifie souvent apres coup, et
                  la description n'apparaissait PAS tant qu'elle etait vide -- rien n'invitait a
                  la remplir. La gravite est bornee a 0-100 comme dans l'ancienne modale. */}
              {canManage ? (
                <>
                  <InlineField
                    variant="number"
                    label="Gravité (0 à 100)"
                    unit="/100"
                    emptyLabel="qualifier la gravité"
                    value={signal.gravite ?? null}
                    onCommit={(v) => majSignal({ gravite: v == null ? null : Math.max(0, Math.min(100, v)) })}
                    {...retourInline}
                  />
                  <InlineField
                    variant="longtext"
                    label="Description"
                    emptyLabel="ajouter une description"
                    rows={3}
                    value={signal.description ?? ''}
                    onCommit={(v) => majSignal({ commentaire: v.trim() || null })}
                    {...retourInline}
                  />
                </>
              ) : (
                <>
                  <p><span className="text-navy-400">Gravité :</span> {signal.gravite != null ? `${signal.gravite}/100` : 'Non qualifiée'}</p>
                  {signal.description && <p className="text-navy-600">{signal.description}</p>}
                </>
              )}
              <HistoriqueDiscret tableNom="signaux" ligneId={signal.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {signal && (
        <>

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer ce signal ?"
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

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}
