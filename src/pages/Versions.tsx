import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_VERSIONS, STATUT_VERSION_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { SortableTh } from '@/components/ui/sortable-th'
import { useListControls } from '@/lib/useListControls'
import { Tableau, TableauTete, TableauCorps } from '@/components/ui/tableau'

export default function Versions() {
  const { data: recommandations, isLoading } = useRecommandationsListe()
  const { data: statutsRef } = useReferenceTable('statuts_versions_recommandation')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_VERSIONS
  const navigate = useNavigate()

  /* UNE VERSION N'APPARTIENT A PERSONNE : son auteur n'est renseigne qu'une fois sur 2 030. On
     filtre donc les RECOMMANDATIONS avant d'en deplier les versions — « mes versions » veut dire
     « les versions de mes dossiers », et c'est bien la question qu'on se pose ici. */
  const { perimetre, setPerimetre, visibles: recosDuPerimetre } = usePerimetreListe(
    'versions', recommandations,
    { proprietaireId: (r) => r.proprietaire_id, compteId: (r) => r.compte_id },
  )

  const versionsBrutes = recosDuPerimetre?.flatMap((reco) => reco.versions.map((v) => ({ ...v, recoTitre: reco.titre, recoId: reco.id }))) ?? []

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

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher une recommandation, un motif…" count={versionsResult?.length}>
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes versions"
            libelleTous="Toutes les versions"
          />
        </ListToolbar>

        <Card className="p-2.5">
          <Tableau minWidth={720}>
            <TableauTete>
              <tr>
                <SortableTh label="Recommandation" sortKey="recoTitre" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="font-medium">Version</th>
                <th className="font-medium">Motif</th>
                <SortableTh label="Statut" sortKey="statut" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Gain estimé" sortKey="gains_estimes" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Date" sortKey="date_creation" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              </tr>
            </TableauTete>
            <TableauCorps>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-km-faint">Chargement…</td>
                </tr>
              )}
              {versions.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-km-faint">
                    {versionsBrutes.length === 0 ? 'Aucune version pour le moment.' : 'Aucune version ne correspond à la recherche.'}
                  </td>
                </tr>
              )}
              {versions.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => navigate(`/recommandations/${v.recoId}`)}
                  className="cursor-pointer"
                >
                  <td className="font-medium text-km-text">{v.recoTitre}</td>
                  <td className="text-km-muted">{v.nom || '—'}</td>
                  <td className="text-km-muted">{v.motif_creation}</td>
                  <td >
                    <Badge tone={STATUT_VERSION_TONE[v.statut] ?? 'neutral'}>
                      {statuts.find((s) => s.code === v.statut)?.libelle ?? v.statut}
                    </Badge>
                  </td>
                  <td className="text-km-muted">
                    {v.gains_estimes !== null ? `${v.gains_estimes.toLocaleString('fr-FR')} €` : '—'}
                  </td>
                  <td className="text-km-muted">{new Date(v.date_creation).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </TableauCorps>
          </Tableau>
        </Card>
      </div>
    </div>
  )
}
