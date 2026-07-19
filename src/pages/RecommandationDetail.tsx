import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { EtapeStepper } from '@/components/ui/etape-stepper'
import { useRecommandations } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'

const PRIORITE_LABEL: Record<number, string> = { 1: 'Haute', 2: 'Normale', 3: 'Basse' }

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
      <div className="p-4 sm:p-6">
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
                  <p><span className="text-navy-400">Compte :</span> <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink></p>
                  <p>
                    <span className="text-navy-400">Sites :</span>{' '}
                    {reco.sites.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                      </span>
                    ))}
                  </p>
                  <p><span className="text-navy-400">Objectif :</span> {reco.objectif}</p>
                  {reco.origine && <p><span className="text-navy-400">Origine :</span> {reco.origine}</p>}
                  <p><span className="text-navy-400">Priorité :</span> {PRIORITE_LABEL[reco.priorite] ?? reco.priorite}</p>
                  <p><span className="text-navy-400">Conseiller :</span> {reco.conseiller}</p>
                  <p><span className="text-navy-400">Créée le :</span> {new Date(reco.date_creation).toLocaleDateString('fr-FR')}</p>
                  {reco.description && <p className="text-navy-600">{reco.description}</p>}
                  {reco.commentaire_interne && (
                    <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Note interne : {reco.commentaire_interne}</p>
                  )}
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
                        {version.contenu && <p className="mt-1 text-xs text-navy-500">{version.contenu}</p>}

                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-navy-400">
                          {version.economie_pourcentage !== null && (
                            <span>Économie : <span className="font-medium text-kiwi-700">{version.economie_pourcentage}%</span></span>
                          )}
                          {version.niveau_confiance !== null && <span>Confiance : {version.niveau_confiance}%</span>}
                          {version.date_validite_offres && (
                            <span>Offres valables jusqu'au {new Date(version.date_validite_offres).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs text-navy-400">
                          <span>Motif : {version.motif_creation}</span>
                          {version.gains_estimes !== null && (
                            <span className="font-medium text-kiwi-700">Gain estimé : {version.gains_estimes.toLocaleString('fr-FR')} €</span>
                          )}
                        </div>

                        {version.document_url && (
                          <a
                            href={version.document_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-kiwi-700 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Voir le document
                          </a>
                        )}
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
