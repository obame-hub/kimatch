import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { heureDe, instantTache } from '@/lib/heureTache'
import { ArrowLeft, CheckSquare, Check, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import { useAction, useUpdateActionPartiel, useDeleteAction, useCompleteAction, type PatchAction } from '@/lib/data/actions'
import { useSites } from '@/lib/data/sites'
import { useContacts } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_ACTIONS } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'

/** Le chemin d'une tâche, dans l'ordre de `statuts_actions`. « Annulée » n'en est pas : c'est la
 *  sortie, et la frise la porte en finalité. */
const JALONS_TACHE = ['A_FAIRE', 'EN_COURS', 'EN_ATTENTE', 'TERMINEE'] as const

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

  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: sites } = useSites()
  const { data: contacts } = useContacts()

  // Edition en place : la modale « Modifier » disparait, on corrige la ou on lit.
  const updateActionPartiel = useUpdateActionPartiel()
  const majAction = async (patch: PatchAction) => {
    await updateActionPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }
  const retourInline = {
    onSaved: () => showToast('✓ enregistré'),
    onError: (e: Error) => showToast(`Erreur : ${e.message}`),
  }

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
          <p className="text-sm text-km-muted">Tâche introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-km-amber-soft text-amber-600">
                    <CheckSquare className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">{action.titre}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {/* La pastille de statut est partie : la frise juste en dessous la dit mieux, et
                      deux endroits à tenir d'accord finissent toujours par diverger (Naoëlle,
                      03/09/2026). */}
                  {canManage && (
                    <>
                      {/* Plus de bouton « Modifier » : les champs s'editent en place ci-dessous. */}
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
              {/* ══ LA FRISE DE LA TÂCHE ══════════════════════════════════════════════════════════

                  QUATRE JALONS, UNE SORTIE. `statuts_actions` en compte cinq, dans cet ordre : À
                  faire, En cours, En attente, Terminée, Annulée. Les quatre premiers sont le
                  chemin ; « Annulée » est une sortie — une tâche annulée n'est pas plus avancée
                  qu'une tâche terminée, c'est autre chose.

                  « EN ATTENTE » RESTE UN JALON, alors qu'on peut très bien passer d'« En cours » à
                  « Terminée » sans y toucher. Une frise ne dit pas ce qu'il FAUT franchir, elle
                  situe : sauter un cran est un cas courant sur tous les objets, et la retirer
                  priverait d'un état que le métier a posé en base. */}
              <FriseStatut
                teinte="tache"
                jalons={JALONS_TACHE.map((code) => ({
                  code,
                  libelle: statuts.find((s) => s.code === code)?.libelle ?? code,
                }))}
                courant={action.statut === 'ANNULEE' ? 'A_FAIRE' : action.statut}
                finalite={
                  action.statut === 'ANNULEE'
                    ? {
                        libelle: statuts.find((s) => s.code === 'ANNULEE')?.libelle ?? 'Annulée',
                        perdue: false,
                        neutre: true,
                      }
                    : null
                }
                onJalon={
                  canManage
                    ? (code: string) => {
                        const statut = statuts.find((s) => s.code === code)
                        if (!statut || statut.code === action.statut) return
                        majAction({ statut_id: statut.id })
                          .then(() => showToast(`✓ ${statut.libelle}`))
                          .catch((e) => showToast(e instanceof Error ? `Erreur : ${e.message}` : 'Enregistrement impossible'))
                      }
                    : undefined
                }
                issues={
                  canManage && action.statut !== 'ANNULEE'
                    ? [{ code: 'ANNULEE', libelle: statuts.find((s) => s.code === 'ANNULEE')?.libelle ?? 'Annulée' }]
                    : undefined
                }
              />

              <p><span className="text-km-faint">Type :</span> {action.type_action}</p>
              <p><span className="text-km-faint">Créée le :</span> {new Date(action.date_creation).toLocaleDateString('fr-FR')}</p>
              {action.responsable && <p><span className="text-km-faint">Responsable :</span> {action.responsable}</p>}
              {action.date_realisation && (
                <p><span className="text-km-faint">Terminée le :</span> {new Date(action.date_realisation).toLocaleDateString('fr-FR')}</p>
              )}
              {action.recommandation_id && (
                <p><span className="text-km-faint">Recommandation liée :</span> <EntityLink to={`/recommandations/${action.recommandation_id}`}>{action.recommandation_titre}</EntityLink></p>
              )}

              {/* Edition en place. Une tache est l'objet qu'on retouche le plus souvent -- une
                  echeance repoussee, un commentaire complete apres un appel -- et c'etait
                  justement la seule fiche ou il fallait ouvrir une modale pour le faire.
                  Le rattachement au site et au contact reste en lecture pour qui ne gere pas la
                  tache, mais les liens restent cliquables dans les deux cas. */}
              {canManage ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <InlineField
                      variant="text"
                      label="Titre"
                      value={action.titre}
                      // `titre` est NOT NULL en base : une tache sans intitule serait illisible
                      // dans la liste des taches, ou c'est la seule colonne affichee.
                      onCommit={async (titre) => {
                        if (titre.trim() === '') throw new Error("L'intitulé de la tâche est obligatoire.")
                        await majAction({ titre: titre.trim() })
                      }}
                      {...retourInline}
                    />
                  </div>
                  <InlineField
                    variant="number"
                    label="Priorité"
                    unit=""
                    value={action.priorite}
                    onCommit={(v) => majAction({ priorite: v ?? action.priorite })}
                    {...retourInline}
                  />
                  <InlineField
                    variant="date"
                    label="Échéance"
                    emptyLabel="ajouter une échéance"
                    value={action.echeance ? action.echeance.slice(0, 10) : null}
                    /* MODIFIER LA DATE NE DOIT PAS EFFACER L'HEURE. Le champ en ligne ne rend
                       qu'une date ; envoyée telle quelle, elle remplaçait un instant « 26/08 à
                       09:30 » par minuit UTC. On recompose donc l'instant en gardant l'heure. */
                    onCommit={(d) => majAction({ date_prevue: instantTache(d, heureDe(action.echeance)) })}
                    {...retourInline}
                  />
                  <InlineField
                    variant="select"
                    label="Site"
                    emptyLabel="rattacher un site"
                    value={action.site_id ?? ''}
                    options={(sites ?? []).map((s) => ({ value: s.id, label: s.nom }))}
                    onCommit={(v) => majAction({ site_id: v || null })}
                    {...retourInline}
                  />
                  <InlineField
                    variant="select"
                    label="Contact"
                    emptyLabel="rattacher un contact"
                    value={action.contact_id ?? ''}
                    options={(contacts ?? []).map((c) => ({ value: c.id, label: `${c.prenom ?? ''} ${c.nom ?? ''}`.trim() }))}
                    onCommit={(v) => majAction({ contact_id: v || null })}
                    {...retourInline}
                  />
                  <div className="sm:col-span-2">
                    <InlineField
                      variant="longtext"
                      label="Commentaire"
                      value={action.commentaire ?? ''}
                      onCommit={(v) => majAction({ commentaire: v.trim() || null })}
                      {...retourInline}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p><span className="text-km-faint">Priorité :</span> {action.priorite}</p>
                  <p>
                    <span className="text-km-faint">Échéance :</span>{' '}
                    {action.echeance ? new Date(action.echeance).toLocaleDateString('fr-FR') : '—'}
                  </p>
                  {action.site_id && (
                    <p><span className="text-km-faint">Site :</span> <EntityLink to={`/sites/${action.site_id}`}>{action.cible_label}</EntityLink></p>
                  )}
                  {action.contact_id && (
                    <p><span className="text-km-faint">Contact :</span> <EntityLink to={`/contacts/${action.contact_id}`}>{action.contact_nom}</EntityLink></p>
                  )}
                  {action.commentaire && <p className="text-km-muted">{action.commentaire}</p>}
                </>
              )}

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

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer cette tâche ?"
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
