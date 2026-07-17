import { useNavigate } from 'react-router-dom'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useComptes } from '@/lib/data/comptes'
import { EllisphereSearch } from '@/components/ellisphere/EllisphereSearch'
import type { TypeCompte } from '@/types/domain'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Client', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

export default function Comptes() {
  const { data: comptes, isLoading } = useComptes()
  const navigate = useNavigate()

  return (
    <div>
      <Topbar title="Comptes" />
      <div className="p-6">
        <PageHeader
          title="Comptes"
          description="Le compte représente la relation (client, fournisseur, partenaire) — la valeur se crée sur les sites qui lui sont rattachés."
        />

        <EllisphereSearch />

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <th className="px-5 py-3 font-medium">Nom</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Segment</th>
                <th className="px-5 py-3 font-medium">Ville</th>
                <th className="px-5 py-3 font-medium">Sites</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
                </tr>
              )}
              {comptes?.map((compte) => (
                <tr
                  key={compte.id}
                  onClick={() => navigate(`/comptes/${compte.id}`)}
                  className="cursor-pointer transition-colors hover:bg-navy-50"
                >
                  <td className="px-5 py-3 font-medium text-navy-800">{compte.nom}</td>
                  <td className="px-5 py-3">
                    <Badge tone={typeMeta[compte.type_compte].tone}>{typeMeta[compte.type_compte].label}</Badge>
                  </td>
                  <td className="px-5 py-3 text-navy-600">{compte.segment}</td>
                  <td className="px-5 py-3 text-navy-600">{compte.ville}</td>
                  <td className="px-5 py-3 text-navy-600">{compte.nb_sites}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
