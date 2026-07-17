import { useNavigate } from 'react-router-dom'
import { FileSignature, Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useContrats } from '@/lib/data/contrats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE } from '@/lib/referenceFallbacks'

export default function Contrats() {
  const { data: contrats, isLoading } = useContrats()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Contrats" />
      <div className="p-6">
        <PageHeader
          title="Contrats"
          description="Contrats de fourniture d'énergie liés à chaque site — électricité et gaz."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {contrats?.map((c) => {
            const label = statuts.find((s) => s.code === c.statut)?.libelle ?? c.statut
            const Icon = c.type_energie === 'gaz' ? Flame : Zap
            return (
              <Card
                key={c.id}
                onClick={() => navigate(`/contrats/${c.id}`)}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="font-display font-medium text-navy-800">{c.fournisseur_nom}</p>
                  </div>
                  <Badge tone={STATUT_CONTRAT_TONE[c.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-navy-500">
                  <p>Site : <EntityLink to={`/sites/${c.site_id}`}>{c.site_nom}</EntityLink></p>
                  {c.reference_fournisseur && <p>Référence : {c.reference_fournisseur}</p>}
                  <p>
                    {c.date_debut ? new Date(c.date_debut).toLocaleDateString('fr-FR') : '—'}
                    {' → '}
                    {c.date_fin ? new Date(c.date_fin).toLocaleDateString('fr-FR') : '—'}
                  </p>
                </div>
              </Card>
            )
          })}
        </div>
        {!isLoading && contrats?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-navy-400">
            <FileSignature className="h-8 w-8" />
            <p className="text-sm">Aucun contrat pour le moment.</p>
          </div>
        )}
      </div>
    </div>
  )
}
