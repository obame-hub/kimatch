import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMandats } from '@/lib/data/mandats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'

export default function Mandats() {
  const { data: mandats, isLoading } = useMandats()
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Mandats" />
      <div className="p-6">
        <PageHeader
          title="Mandats"
          description="Le mandat autorise KiWee à intervenir sur un périmètre de sites — il ne se confond pas avec le périmètre étudié par une recommandation."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {mandats?.map((m) => {
            const label = statuts.find((s) => s.code === m.statut)?.libelle ?? m.statut
            return (
              <Card
                key={m.id}
                onClick={() => navigate(`/mandats/${m.id}`)}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <p className="font-display font-medium text-navy-800">{m.compte_nom}</p>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-navy-500">
                  <p>Sites couverts : <span className="font-medium text-navy-700">{m.nb_sites_couverts}</span></p>
                  <p>Signé le : {m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
