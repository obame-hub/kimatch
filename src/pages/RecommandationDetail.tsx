import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EtapeStepper } from '@/components/ui/etape-stepper'
import { useRecommandations } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'

export default function RecommandationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: recommandations } = useRecommandations()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const { data: statutsVersionsRef } = useReferenceTable('statuts_versions_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const statutsVersions = statutsVersionsRef && statutsVersionsRef.length > 0 ? statutsVersionsRef : FALLBACK_STATUTS_VERSIONS
  const reco = recommandations?.find((r) => r.id === id)

  return (
    <div>
      <Topbar title={reco?.titre ?? 'Recommandation'} />
      <div className="p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/recommandations')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux recommandations
        </Button>

        {!reco ? (
          <p className="text-sm text-navy-500">Recommandation introuvable.</p>
        ) : (
          <>
            <Card className="mb-4 p-6">
              <p className="mb-5 font-display text-lg font-semibold text-navy-900">{reco.titre}</p>
              <EtapeStepper steps={etapes} currentCode={reco.etape} />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Dossier</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p><span className="text-navy-400">Compte :</span> {reco.compte_nom}</p>
                  <p><span className="text-navy-400">Sites :</span> {reco.sites.join(', ')}</p>
                  <p><span className="text-navy-400">Objectif :</span> {reco.objectif}</p>
                  <p><span className="text-navy-400">Conseiller :</span> {reco.conseiller}</p>
                  <p><span className="text-navy-400">Créée le :</span> {new Date(reco.date_creation).toLocaleDateString('fr-FR')}</p>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Historique des versions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reco.versions.length === 0 && (
                    <p className="text-sm text-navy-400">Aucune version produite pour le moment — analyse en cours.</p>
                  )}
                  {reco.versions.map((version) => {
                    const statutLabel = statutsVersions.find((s) => s.code === version.statut)?.libelle ?? version.statut
                    return (
                      <div key={version.id} className="rounded-lg border border-navy-100 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-navy-800">Version {version.numero}</p>
                          <Badge tone={STATUT_VERSION_TONE[version.statut] ?? 'neutral'}>{statutLabel}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-navy-600">{version.resume}</p>
                        <div className="mt-2 flex items-center justify-between text-xs text-navy-400">
                          <span>Motif : {version.motif_creation}</span>
                          {version.gains_estimes !== null && (
                            <span className="font-medium text-kiwi-700">Gain estimé : {version.gains_estimes.toLocaleString('fr-FR')} €</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
