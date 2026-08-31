import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useInteractions, useUpdateInteractionPartiel, useDeleteInteraction, type PatchInteraction } from '@/lib/data/interactions'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useGoBack } from '@/lib/useGoBack'
import { useSuppression } from '@/lib/useSuppression'
import { InteractionSentence } from '@/lib/interactionSentence'

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
  const goBack = useGoBack('/interactions')

  const canManage = useCanManage(interaction?.proprietaire_id)
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  // Edition en place : la modale « Modifier » disparait.
  const updateInteractionPartiel = useUpdateInteractionPartiel()
  const majInteraction = async (patch: PatchInteraction) => {
    await updateInteractionPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  const retourInline = {
    onSaved: () => { setToast('✓ enregistré'); setTimeout(() => setToast(null), 2200) },
    onError: (e: Error) => { setToast(`Erreur : ${e.message}`); setTimeout(() => setToast(null), 2200) },
  }
  const [confirmDelete, setConfirmDelete] = useState(false)

  const suppression = useSuppression()

  function handleDelete() {
    if (!interaction) return
    suppression.supprimer(
      () => deleteInteraction.mutateAsync(interaction.id),
      () => navigate('/interactions'),
    )
  }

  return (
    <div>
      <Topbar crumb="Interactions" title={interaction?.objet || interaction?.type_interaction || 'Interaction'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux interactions
        </Button>

        {!interaction ? (
          <p className="text-sm text-km-muted">Interaction introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-500">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{interaction.objet || interaction.type_interaction}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{interaction.type_interaction}</Badge>
                  {canManage && (
                    <>
                      {/* Plus de bouton « Modifier » : tout s'edite en place ci-dessous. */}
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
              <p className="rounded-lg bg-km-bg p-2.5 text-km-text">
                <InteractionSentence interaction={interaction} />
              </p>
              <p>
                <span className="text-km-faint">Compte :</span>{' '}
                {interaction.compte_id ? (
                  <EntityLink to={`/comptes/${interaction.compte_id}`}>{interaction.compte_nom}</EntityLink>
                ) : (
                  interaction.compte_nom || '—'
                )}
              </p>
              <p>
                <span className="text-km-faint">Site :</span>{' '}
                {interaction.site_id ? (
                  <EntityLink to={`/sites/${interaction.site_id}`}>{interaction.site_nom}</EntityLink>
                ) : (
                  interaction.site_nom || '—'
                )}
              </p>
              {interaction.contact_nom && (
                <p>
                  <span className="text-km-faint">Contact :</span>{' '}
                  {interaction.contact_id ? (
                    <EntityLink to={`/contacts/${interaction.contact_id}`}>{interaction.contact_nom}</EntityLink>
                  ) : (
                    interaction.contact_nom
                  )}
                </p>
              )}
              {interaction.recommandation_id && (
                <p>
                  <span className="text-km-faint">Recommandation :</span>{' '}
                  <EntityLink to={`/recommandations/${interaction.recommandation_id}`}>{interaction.recommandation_nom}</EntityLink>
                </p>
              )}
              {/* Edition en place. Une interaction se complete apres coup -- on note l'objet en
                  raccrochant, le resume et le resultat viennent apres. Sens, resume et resultat
                  n'apparaissaient PAS tant qu'ils etaient vides : il fallait ouvrir la modale
                  pour savoir qu'ils existaient. */}
              {canManage ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InlineField
                    variant="date"
                    label="Date"
                    value={interaction.date_interaction ? interaction.date_interaction.slice(0, 10) : null}
                    // La colonne est un horodatage : on renvoie de l'ISO complet, pas la seule
                    // date, sinon l'heure d'origine saute a minuit UTC.
                    onCommit={(d) => majInteraction({
                      date_interaction: d ? new Date(d).toISOString() : interaction.date_interaction,
                    })}
                    {...retourInline}
                  />
                  <InlineField
                    variant="select"
                    label="Sens"
                    emptyLabel="entrant ou sortant ?"
                    value={interaction.sens ?? ''}
                    options={SENS_OPTIONS.filter((s) => s.value !== '')}
                    onCommit={(v) => majInteraction({ sens: v || null })}
                    {...retourInline}
                  />
                  <div className="sm:col-span-2">
                    <InlineField
                      variant="text"
                      label="Objet"
                      emptyLabel="ajouter un objet"
                      value={interaction.objet ?? ''}
                      onCommit={(v) => majInteraction({ objet: v.trim() || null })}
                      {...retourInline}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <InlineField
                      variant="longtext"
                      label="Résumé"
                      emptyLabel="ajouter un résumé"
                      rows={3}
                      value={interaction.resume ?? ''}
                      onCommit={(v) => majInteraction({ resume: v.trim() || null })}
                      {...retourInline}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <InlineField
                      variant="text"
                      label="Résultat"
                      emptyLabel="ajouter un résultat"
                      value={interaction.resultat ?? ''}
                      onCommit={(v) => majInteraction({ resultat: v.trim() || null })}
                      {...retourInline}
                    />
                  </div>
                  {isAdmin && (
                    <InlineField
                      variant="select"
                      label="Propriétaire"
                      emptyLabel="aucun"
                      value={interaction.proprietaire_id ?? ''}
                      options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                      onCommit={(v) => majInteraction({ proprietaire_id: v || null })}
                      {...retourInline}
                    />
                  )}
                </div>
              ) : (
                <>
                  {interaction.sens && (
                    <p><span className="text-km-faint">Sens :</span> {interaction.sens}</p>
                  )}
                  {interaction.resume && (
                    <p><span className="text-km-faint">Résumé :</span> {interaction.resume}</p>
                  )}
                  {interaction.resultat && (
                    <p><span className="text-km-faint">Résultat :</span> {interaction.resultat}</p>
                  )}
                </>
              )}
              {(interaction.appel_manque || interaction.messagerie_vocale) && (
                <p>
                  {interaction.appel_manque && <Badge tone="amber">Appel manqué</Badge>}
                  {interaction.messagerie_vocale && <Badge tone="amber">Messagerie vocale</Badge>}
                </p>
              )}
              {interaction.duree_appel_secondes != null && (
                <p><span className="text-km-faint">Durée :</span> {Math.floor(interaction.duree_appel_secondes / 60)} min {interaction.duree_appel_secondes % 60}s</p>
              )}
              {interaction.numero_correspondant && (
                <p><span className="text-km-faint">Numéro :</span> {interaction.numero_correspondant}</p>
              )}
              {interaction.decroche_par && (
                <p><span className="text-km-faint">Décroché par :</span> {interaction.decroche_par}</p>
              )}
              {interaction.enregistrement_url && (
                <p>
                  <span className="text-km-faint">Enregistrement :</span>{' '}
                  <a href={interaction.enregistrement_url} target="_blank" rel="noreferrer" className="text-sky-600 underline">
                    Écouter l'appel
                  </a>
                </p>
              )}
              {interaction.issue_libelle && (
                <p><span className="text-km-faint">Motif / issue :</span> <Badge tone="amber">{interaction.issue_libelle}</Badge></p>
              )}
              <p><span className="text-km-faint">Auteur :</span> {interaction.auteur}</p>
              <p><span className="text-km-faint">Date :</span> {new Date(interaction.date_interaction).toLocaleDateString('fr-FR')}</p>
              <HistoriqueDiscret tableNom="interactions" ligneId={interaction.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {interaction && (
        <>

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer cette interaction ?"
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
