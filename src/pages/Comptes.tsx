import { useNavigate } from 'react-router-dom'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { SortableTh } from '@/components/ui/sortable-th'
import { useListControls } from '@/lib/useListControls'
import { useComptes } from '@/lib/data/comptes'
import { useState } from 'react'
import type { TypeCompte } from '@/types/domain'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Consommateur', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

export default function Comptes() {
  const { data: comptes, isLoading } = useComptes()
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState('')

  const comptesFiltresParType = typeFilter ? comptes?.filter((c) => c.type_compte === typeFilter) : comptes

  const { query, setQuery, sortKey, sortDir, toggleSort, items: filteredComptes } = useListControls(comptesFiltresParType, {
    searchFields: (c) => [c.nom, c.segment, c.ville],
    sorters: {
      nom: (a, b) => a.nom.localeCompare(b.nom),
      segment: (a, b) => (a.segment ?? '').localeCompare(b.segment ?? ''),
      ville: (a, b) => (a.ville ?? '').localeCompare(b.ville ?? ''),
      nb_sites: (a, b) => a.nb_sites - b.nb_sites,
    },
    defaultSort: 'nom',
  })

  const tranche = useTranchesAffichage(filteredComptes, `${query}|${sortKey}|${sortDir}`)

  return (
    <div>
      <Topbar title="Comptes" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Comptes"
          description="Le compte représente la relation (client, fournisseur, partenaire) — la valeur se crée sur les sites qui lui sont rattachés."
          actions={(
            <Button onClick={() => navigate('/comptes/nouveau')}>
              <Plus className="h-4 w-4" /> Nouveau compte
            </Button>
          )}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un compte, une ville…" count={filteredComptes?.length}>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
            <option value="">Tous les types</option>
            {(Object.keys(typeMeta) as TypeCompte[]).map((t) => (
              <option key={t} value={t}>{typeMeta[t].label}</option>
            ))}
          </Select>
        </ListToolbar>

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <SortableTh label="Nom" sortKey="nom" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium">Type</th>
                <SortableTh label="Segment" sortKey="segment" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Ville" sortKey="ville" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Sites" sortKey="nb_sites" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
                </tr>
              )}
              {!isLoading && filteredComptes?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-navy-400">
                    {comptes?.length === 0
                      ? "Aucun compte pour l'instant — clique sur « Nouveau compte » pour en créer un."
                      : 'Aucun compte ne correspond à la recherche.'}
                  </td>
                </tr>
              )}
              {tranche.visibles.map((compte) => (
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
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="comptes"
          />
        </Card>
      </div>
    </div>
  )
}
