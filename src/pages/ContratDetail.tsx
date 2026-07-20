import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useContrats } from '@/lib/data/contrats'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_CONTRATS, STATUT_CONTRAT_TONE } from '@/lib/referenceFallbacks'

export default function ContratDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: contrats } = useContrats()
  const { data: statutsRef } = useReferenceTable('statuts_contrats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_CONTRATS
  const contrat = contrats?.find((c) => c.id === id)
  const Icon = contrat?.type_energie === 'gaz' ? Flame : Zap

  return (
    <div>
      <Topbar crumb="Contrats" title={contrat?.fournisseur_nom ?? 'Contrat'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/contrats')}>
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
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
                <Badge tone={STATUT_CONTRAT_TONE[contrat.statut] ?? 'neutral'}>
                  {statuts.find((s) => s.code === contrat.statut)?.libelle ?? contrat.statut}
                </Badge>
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
