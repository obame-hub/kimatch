import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRecommandations } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { SortableTh } from '@/components/ui/sortable-th'
import { useListControls } from '@/lib/useListControls'

export default function Versions() {
  const { data: recommandations, isLoading } = useRecommandations()
  const { data: statutsRef } = useReferenceTable('statuts_versions_recommandation')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_VERSIONS
  const navigate = useNavigate()

  const versionsBrutes = recommandations?.flatMap((reco) => reco.versions.map((v) => ({ ...v, recoTitre: reco.titre, recoId: reco.id }))) ?? []

  const { query, setQuery, sortKey, sortDir, toggleSort, items: versionsResult } = useListControls(versionsBrutes, {
    searchFields: (v) => [v.recoTitre, v.nom, v.motif_creation],
    sorters: {
      recoTitre: (a, b) => a.recoTitre.localeCompare(b.recoTitre),
      statut: (a, b) => a.statut.localeCompare(b.statut),
      gains_estimes: (a, b) => (a.gains_estimes ?? 0) - (b.gains_estimes ?? 0),
      date_creation: (a, b) => b.date_creation.localeCompare(a.date_creation),
    },
    defaultSort: 'date_creation',
  })
  const versions = versionsResult ?? []

  return (
    <div>
      <Topbar title="Versions" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Versions"
          description="Chaque recommandation évolue par versions successives — une version présentée n'est jamais modifiée, on en crée une nouvelle."
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher une recommandation, un motif…" count={versionsResult?.length} />

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <SortableTh label="Recommandation" sortKey="recoTitre" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium">Version</th>
                <th className="px-5 py-3 font-medium">Motif</th>
                <SortableTh label="Statut" sortKey="statut" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Gain estimé" sortKey="gains_estimes" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Date" sortKey="date_creation" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
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
                  <td colSpan={6} className="px-5 py-6 text-center text-navy-400">
                    {versionsBrutes.length === 0 ? 'Aucune version pour le moment.' : 'Aucune version ne correspond à la recherche.'}
                  </td>
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
