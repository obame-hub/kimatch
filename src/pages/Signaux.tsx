import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { useSignaux } from '@/lib/data/signaux'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_SIGNAUX } from '@/lib/referenceFallbacks'
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

export default function Signaux() {
  const { data: signaux, isLoading } = useSignaux()
  const { data: statutsRef } = useReferenceTable('statuts_signaux')
  const columns = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_SIGNAUX

  return (
    <div>
      <Topbar title="Signaux" />
      <div className="p-6">
        <PageHeader
          title="Signaux"
          description="Un signal attire l'attention — il ne déclenche jamais automatiquement une recommandation. Il suit un cycle : détection, contact, intérêt confirmé, puis mandat."
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
    </div>
  )
}
