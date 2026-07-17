import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Select, Textarea } from '@/components/ui/form'
import { useSignaux, useCreateSignal } from '@/lib/data/signaux'
import { useSites } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_SIGNAUX, FALLBACK_TYPES_SIGNAUX } from '@/lib/referenceFallbacks'
import type { Signal } from '@/types/domain'
import { cn } from '@/lib/utils'

function SignalCard({ signal }: { signal: Signal }) {
  const navigate = useNavigate()
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/sites/${signal.site_id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/sites/${signal.site_id}`)}
      className="animate-fade-up cursor-pointer p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-navy-800">{signal.site_nom}</p>
        {signal.priorite === 'haute' && <span className="h-1.5 w-1.5 shrink-0 translate-y-1 rounded-full bg-red-500" />}
      </div>
      <p className="mt-1 text-xs text-navy-500">{signal.type_signal}</p>
      <p className="mt-2 line-clamp-2 text-xs text-navy-400">{signal.description}</p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-navy-400">
        <span>{signal.conseiller}</span>
        <span>{new Date(signal.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
      </div>
    </Card>
  )
}

function CreateSignalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: typesRef } = useReferenceTable('types_signaux')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_SIGNAUX
  const createSignal = useCreateSignal()

  const [siteId, setSiteId] = useState('')
  const [typeSignalId, setTypeSignalId] = useState('')
  const [description, setDescription] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setSiteId('')
    setTypeSignalId('')
    setDescription('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const site = sites?.find((s) => s.id === siteId)
    const type = types.find((t) => t.id === typeSignalId)
    if (!site) return

    const result = await createSignal.mutateAsync({
      site_id: site.id,
      site_nom: site.nom,
      type_signal_id: typeSignalId || null,
      type_signal_libelle: type?.libelle ?? '',
      description,
    })
    setFeedback(result.persisted ? 'Signal créé.' : 'Signal ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau signal" description="Signaler un événement à surveiller sur un site.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Site">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Sélectionner un site…</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Type de signal">
          <Select value={typeSignalId} onChange={(e) => setTypeSignalId(e.target.value)}>
            <option value="">Sélectionner un type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Description">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détails du signal…" />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createSignal.isPending}>Créer le signal</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Signaux() {
  const { data: signaux, isLoading } = useSignaux()
  const { data: statutsRef } = useReferenceTable('statuts_signaux')
  const columns = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_SIGNAUX
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <Topbar title="Signaux" />
      <div className="p-6">
        <PageHeader
          title="Signaux"
          description="Un signal attire l'attention — il ne déclenche jamais automatiquement une recommandation. Il suit un cycle : détection, contact, intérêt confirmé, puis mandat."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau signal</Button>}
        />

        {isLoading ? (
          <p className="text-sm text-navy-400">Chargement…</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((col) => {
              const items = signaux?.filter((s) => s.statut === col.code) ?? []
              return (
                <div
                  key={col.id}
                  style={{ borderTopColor: col.couleur ?? undefined }}
                  className={cn('flex w-[240px] shrink-0 flex-col rounded-xl border-t-4 bg-navy-50/60 p-3')}
                >
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.couleur ?? '#8698ba' }} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">{col.libelle}</p>
                    <span className="ml-auto rounded-full bg-navy-200/70 px-1.5 py-0.5 text-[10px] font-medium text-navy-600">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5">
                    {items.length === 0 && <p className="px-1 text-[11px] text-navy-400">Vide</p>}
                    {items.map((signal) => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <CreateSignalDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
