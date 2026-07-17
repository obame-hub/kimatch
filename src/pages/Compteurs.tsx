import { useNavigate } from 'react-router-dom'
import { Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useCompteurs } from '@/lib/data/compteurs'

export default function Compteurs() {
  const { data: compteurs, isLoading } = useCompteurs()
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Compteurs" />
      <div className="p-6">
        <PageHeader
          title="Compteurs"
          description="Les points de livraison qui alimentent chaque site en énergie — électricité et gaz sont suivis séparément."
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
    </div>
  )
}
