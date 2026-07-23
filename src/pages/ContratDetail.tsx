import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Pencil, Trash2 } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useContrats, useUpdateContrat, useDeleteContrat } from '@/lib/data/contrats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE } from '@/lib/referenceFallbacks'
import { useGoBack } from '@/lib/useGoBack'
import { cn } from '@/lib/utils'
import type { Contrat } from '@/types/domain'

export default function ContratDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: contrats } = useContrats()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const contrat = contrats?.find((c) => c.id === id)
  const Icon = contrat?.type_energie === 'gaz' ? Flame : Zap
  const canManage = useCanManage(contrat?.proprietaire_id)
  const deleteContrat = useDeleteContrat()
  const goBack = useGoBack('/contrats')

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    if (!contrat) return
    await deleteContrat.mutateAsync(contrat.id)
    navigate('/contrats')
  }

  return (
    <div>
      <Topbar crumb="Contrats" title={contrat?.fournisseur_nom ?? 'Contrat'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux contrats
        </Button>

        {!contrat ? (
          <p className="text-sm text-navy-500">Contrat introuvable.</p>
        ) : (
          <Card className="max-w-xl p-6">
            <CardHeader className="px-0 pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', contrat.type_energie === 'gaz' ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-500')}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="font-display text-base">
                    {contrat.fournisseur_compte_id ? (
                      <EntityLink to={`/comptes/${contrat.fournisseur_compte_id}`}>{contrat.fournisseur_nom}</EntityLink>
                    ) : (
                      contrat.fournisseur_nom
                    )}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUT_CONTRAT_TONE[contrat.statut] ?? 'neutral'}>
                    {statuts.find((s) => s.code === contrat.statut)?.libelle ?? contrat.statut}
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
              <p><span className="text-navy-400">Site :</span> <EntityLink to={`/sites/${contrat.site_id}`}>{contrat.site_nom}</EntityLink></p>
              <p><span className="text-navy-400">Énergie :</span> <Badge tone="neutral">{contrat.type_energie === 'gaz' ? 'Gaz' : 'Électricité'}</Badge></p>
              {contrat.reference_fournisseur && (
                <p><span className="text-navy-400">Référence fournisseur :</span> {contrat.reference_fournisseur}</p>
              )}
              <p>
                <span className="text-navy-400">Début :</span>{' '}
                {contrat.date_debut ? new Date(contrat.date_debut).toLocaleDateString('fr-FR') : '—'}
              </p>
              <p>
                <span className="text-navy-400">Fin :</span>{' '}
                {contrat.date_fin ? new Date(contrat.date_fin).toLocaleDateString('fr-FR') : '—'}
              </p>
              {contrat.compteurs.length > 0 && (
                <div>
                  <span className="text-navy-400">Compteurs couverts :</span>
                  <div className="mt-1.5 space-y-1">
                    {contrat.compteurs.map((c) => (
                      <p key={c.id}>
                        <EntityLink to={`/compteurs/${c.id}`}>{c.numero_pdl} — {c.utilisation}</EntityLink>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <HistoriqueDiscret tableNom="contrats" ligneId={contrat.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {contrat && (
        <>
          <EditContratDialog open={editOpen} onClose={() => setEditOpen(false)} contrat={contrat} />

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Supprimer ce contrat ?"
            description="Cette action est irréversible. Les compteurs rattachés ne seront pas supprimés mais perdront leur lien à ce contrat."
          >
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
              <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={deleteContrat.isPending} onClick={handleDelete}>
                Supprimer définitivement
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  )
}

function EditContratDialog({ open, onClose, contrat }: { open: boolean; onClose: () => void; contrat: Contrat }) {
  const updateContrat = useUpdateContrat()
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()

  const [referenceFournisseur, setReferenceFournisseur] = useState(contrat.reference_fournisseur ?? '')
  const [dateDebut, setDateDebut] = useState(contrat.date_debut ? contrat.date_debut.slice(0, 10) : '')
  const [dateFin, setDateFin] = useState(contrat.date_fin ? contrat.date_fin.slice(0, 10) : '')
  const [proprietaireId, setProprietaireId] = useState(contrat.proprietaire_id ?? '')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setReferenceFournisseur(contrat.reference_fournisseur ?? '')
    setDateDebut(contrat.date_debut ? contrat.date_debut.slice(0, 10) : '')
    setDateFin(contrat.date_fin ? contrat.date_fin.slice(0, 10) : '')
    setProprietaireId(contrat.proprietaire_id ?? '')
    setFeedback(null)
  }, [open, contrat])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateContrat.mutateAsync({
        id: contrat.id,
        reference_fournisseur: referenceFournisseur || null,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        proprietaire_id: proprietaireId || null,
      })
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Modifier le contrat" description="Mettre à jour les informations du contrat.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Référence fournisseur">
          <Input value={referenceFournisseur} onChange={(e) => setReferenceFournisseur(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date de début">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </FormField>
          <FormField label="Date de fin">
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </FormField>
        </div>
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
          <Button type="submit" disabled={updateContrat.isPending}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
