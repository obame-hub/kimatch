import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRecommandations } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'

export default function Versions() {
  const { data: recommandations, isLoading } = useRecommandations()
  const { data: statutsRef } = useReferenceTable('statuts_versions_recommandation')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_VERSIONS
  const navigate = useNavigate()

  const versions =
    recommandations
      ?.flatMap((reco) => reco.versions.map((v) => ({ ...v, recoTitre: reco.titre, recoId: reco.id })))
      .sort((a, b) => (a.date_creation < b.date_creation ? 1 : -1)) ?? []

  return (
    <div>
      <Topbar title="Versions" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Versions"
          description="Chaque recommandation évolue par versions successives — une version présentée n'est jamais modifiée, on en crée une nouvelle."
        />

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <th className="px-5 py-3 font-medium">Recommandation</th>
                <th className="px-5 py-3 font-medium">Version</th>
                <th className="px-5 py-3 font-medium">Motif</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Gain estimé</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
                </tr>
              )}
              {versions.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-navy-400">Aucune version pour le moment.</td>
                </tr>
              )}
              {versions.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => navigate(`/recommandations/${v.recoId}`)}
                  className="cursor-pointer transition-colors hover:bg-navy-50"
                >
                  <td className="px-5 py-3 font-medium text-navy-800">{v.recoTitre}</td>
                  <td className="px-5 py-3 text-navy-600">{v.nom || '—'}</td>
                  <td className="px-5 py-3 text-navy-600">{v.motif_creation}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUT_VERSION_TONE[v.statut] ?? 'neutral'}>
                      {statuts.find((s) => s.code === v.statut)?.libelle ?? v.statut}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-navy-600">
                    {v.gains_estimes !== null ? `${v.gains_estimes.toLocaleString('fr-FR')} €` : '—'}
                  </td>
                  <td className="px-5 py-3 text-navy-600">{new Date(v.date_creation).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
