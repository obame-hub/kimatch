import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useSites } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'

function CreateCompteurDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const createCompteur = useCreateCompteur()

  const [siteId, setSiteId] = useState('')
  const [typeEnergieId, setTypeEnergieId] = useState('')
  const [numeroPdl, setNumeroPdl] = useState('')
  const [utilisation, setUtilisation] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setSiteId('')
    setTypeEnergieId('')
    setNumeroPdl('')
    setUtilisation('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const site = sites?.find((s) => s.id === siteId)
    const energie = energies.find((en) => en.id === typeEnergieId)
    if (!site) return
    const typeEnergie = (energie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'

    const result = await createCompteur.mutateAsync({
      site_id: site.id,
      site_nom: site.nom,
      type_energie_id: typeEnergieId || null,
      type_energie: typeEnergie,
      numero_pdl: numeroPdl,
      utilisation,
    })
    setFeedback(result.persisted ? 'Compteur créé.' : 'Compteur ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau compteur" description="Ajouter un point de livraison à un site.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Site">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Sélectionner un site…</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Énergie">
          <Select value={typeEnergieId} onChange={(e) => setTypeEnergieId(e.target.value)} required>
            <option value="">Sélectionner…</option>
            {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Numéro (PDL / PCE)">
          <Input value={numeroPdl} onChange={(e) => setNumeroPdl(e.target.value)} placeholder="Ex. PDL-30001245" />
        </FormField>
        <FormField label="Utilisation">
          <Input value={utilisation} onChange={(e) => setUtilisation(e.target.value)} placeholder="Ex. Parties communes, Chaufferie…" />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createCompteur.isPending}>Créer le compteur</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Compteurs() {
  const { data: compteurs, isLoading } = useCompteurs()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <Topbar title="Compteurs" />
      <div className="p-6">
        <PageHeader
          title="Compteurs"
          description="Les points de livraison qui alimentent chaque site en énergie — électricité et gaz sont suivis séparément."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau compteur</Button>}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {compteurs?.map((c) => (
            <Card
              key={c.id}
              onClick={() => navigate(`/compteurs/${c.id}`)}
              className="animate-fade-up cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      'flex h-8 w-8 items-center justify-center rounded-lg ' +
                      (c.type_energie === 'electricite' ? 'bg-amber-gradient text-white' : 'bg-navy-800 text-white')
                    }
                  >
                    {c.type_energie === 'electricite' ? <Zap className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-navy-800"><EntityLink to={`/sites/${c.site_id}`}>{c.site_nom}</EntityLink></p>
                    <p className="text-xs text-navy-500">{c.utilisation}</p>
                  </div>
                </div>
                <Badge tone={c.statut === 'actif' ? 'kiwi' : 'neutral'}>{c.statut}</Badge>
              </div>
              <p className="mt-3 font-mono text-xs text-navy-400">{c.numero_pdl}</p>
            </Card>
          ))}
        </div>
      </div>
      <CreateCompteurDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
