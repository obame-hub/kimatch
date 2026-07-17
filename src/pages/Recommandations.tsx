import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { EtapeCompact } from '@/components/ui/etape-stepper'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { useRecommandations, useCreateRecommandation } from '@/lib/data/recommandations'
import { useMandats } from '@/lib/data/mandats'
import { useSites } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, ETAPE_TONE, FALLBACK_TYPES_OBJECTIFS } from '@/lib/referenceFallbacks'

const PRIORITE_OPTIONS = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Basse' },
]

function CreateRecommandationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: mandats } = useMandats()
  const { data: sites } = useSites()
  const { data: objectifsRef } = useReferenceTable('types_objectifs')
  const objectifs = objectifsRef && objectifsRef.length > 0 ? objectifsRef : FALLBACK_TYPES_OBJECTIFS
  const createRecommandation = useCreateRecommandation()

  const [titre, setTitre] = useState('')
  const [mandatId, setMandatId] = useState('')
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [objectifId, setObjectifId] = useState('')
  const [priorite, setPriorite] = useState(2)
  const [description, setDescription] = useState('')
  const [commentaireInterne, setCommentaireInterne] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const mandat = mandats?.find((m) => m.id === mandatId)
  const sitesDuCompte = sites?.filter((s) => s.compte_id === mandat?.compte_id) ?? []

  function reset() {
    setTitre('')
    setMandatId('')
    setSiteIds([])
    setObjectifId('')
    setPriorite(2)
    setDescription('')
    setCommentaireInterne('')
    setFeedback(null)
  }

  function toggleSite(id: string) {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mandat) return
    const objectif = objectifs.find((o) => o.id === objectifId)
    const sitesChoisis = sitesDuCompte.filter((s) => siteIds.includes(s.id)).map((s) => ({ id: s.id, nom: s.nom }))

    const result = await createRecommandation.mutateAsync({
      titre,
      mandat_id: mandat.id,
      compte_id: mandat.compte_id,
      compte_nom: mandat.compte_nom,
      sites: sitesChoisis,
      objectif_id: objectifId || null,
      objectif_libelle: objectif?.libelle ?? '',
      priorite,
      description,
      commentaire_interne: commentaireInterne,
    })
    setFeedback(result.persisted ? 'Recommandation créée.' : 'Recommandation ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouvelle recommandation" description="Créer une recommandation rattachée à un mandat existant.">
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <FormField label="Titre">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} required placeholder="Ex. Renouvellement contrat — Résidence Les Tilleuls" />
        </FormField>
        <FormField label="Mandat">
          <Select value={mandatId} onChange={(e) => { setMandatId(e.target.value); setSiteIds([]) }} required>
            <option value="">Sélectionner un mandat…</option>
            {mandats?.map((m) => <option key={m.id} value={m.id}>{m.compte_nom}</option>)}
          </Select>
        </FormField>
        {mandatId && (
          <FormField label="Sites concernés">
            {sitesDuCompte.length === 0 ? (
              <p className="text-xs text-navy-400">Ce compte n'a aucun site.</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-navy-200 p-2">
                {sitesDuCompte.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-navy-700">
                    <input type="checkbox" checked={siteIds.includes(s.id)} onChange={() => toggleSite(s.id)} />
                    {s.nom}
                  </label>
                ))}
              </div>
            )}
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Objectif">
            <Select value={objectifId} onChange={(e) => setObjectifId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {objectifs.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
            </Select>
          </FormField>
          <FormField label="Priorité">
            <Select value={priorite} onChange={(e) => setPriorite(Number(e.target.value))}>
              {PRIORITE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Commentaire interne">
          <Textarea rows={2} value={commentaireInterne} onChange={(e) => setCommentaireInterne(e.target.value)} placeholder="Visible en interne uniquement" />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createRecommandation.isPending || !mandatId}>Créer la recommandation</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Recommandations() {
  const { data: recommandations, isLoading } = useRecommandations()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-6">
        <PageHeader
          title="Recommandations"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {recommandations?.map((reco) => {
            const etapeLabel = etapes.find((e) => e.code === reco.etape)?.libelle ?? reco.etape
            return (
              <Card
                key={reco.id}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => navigate(`/recommandations/${reco.id}`)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-display font-medium text-navy-800">{reco.titre}</p>
                  <Badge tone={ETAPE_TONE[reco.etape] ?? 'neutral'}>{etapeLabel}</Badge>
                </div>
                <p className="text-xs text-navy-500">
                  <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink>
                  {' · '}
                  {reco.sites.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ', '}
                      <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                    </span>
                  ))}
                </p>

                <div className="mt-4">
                  <EtapeCompact steps={etapes} currentCode={reco.etape} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-navy-400">
                  <span>{reco.conseiller}</span>
                  <span>{reco.versions.length} version{reco.versions.length > 1 ? 's' : ''}</span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
      <CreateRecommandationDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
