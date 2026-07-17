import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { useSites } from '@/lib/data/sites'

export default function Sites() {
  const { data: sites, isLoading } = useSites()
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Sites" />
      <div className="p-6">
        <PageHeader
          title="Sites"
          description="L'objet central du patrimoine énergétique — chaque recommandation, signal et contrat s'y rattache."
        />

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <th className="px-5 py-3 font-medium">Site</th>
                <th className="px-5 py-3 font-medium">Compte</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Ville</th>
                <th className="px-5 py-3 font-medium">Compteurs</th>
                <th className="px-5 py-3 font-medium">Signaux ouverts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
                </tr>
              )}
              {sites?.map((site) => (
                <tr
                  key={site.id}
                  onClick={() => navigate(`/sites/${site.id}`)}
                  className="cursor-pointer hover:bg-navy-50"
                >
                  <td className="px-5 py-3 font-medium text-navy-800">{site.nom}</td>
                  <td className="px-5 py-3 text-navy-600">
                    <EntityLink to={`/comptes/${site.compte_id}`}>{site.compte_nom}</EntityLink>
                  </td>
                  <td className="px-5 py-3 text-navy-600">{site.type_site}</td>
                  <td className="px-5 py-3 text-navy-600">{site.ville} ({site.code_postal})</td>
                  <td className="px-5 py-3 text-navy-600">{site.nb_compteurs}</td>
                  <td className="px-5 py-3">
                    {site.nb_signaux_ouverts > 0 ? (
                      <Badge tone="amber">{site.nb_signaux_ouverts} ouvert{site.nb_signaux_ouverts > 1 ? 's' : ''}</Badge>
                    ) : (
                      <Badge tone="neutral">Aucun</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
