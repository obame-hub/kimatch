/**
 * Liste des comptes — servie par la base depuis le 16/08/2026.
 *
 * AVANT. La page chargeait les 2762 comptes pour en afficher vingt, puis filtrait et triait en
 * mémoire. Même motif que la liste des sites avant le 15/08, à une différence près : ici il n'y a
 * aucun agrégat métier à calculer, seulement des jointures à aplatir. Une VUE suffit donc, sans
 * fonction SQL — voir la migration 20260816120000 pour le raisonnement complet.
 *
 * APRÈS. `useListeServeur` interroge `v_comptes_liste` : PostgREST pagine, trie et filtre comme
 * sur une table, et le total remonte par `count: 'exact'` sans requête supplémentaire.
 *
 * LA COLONNE « SITES » ÉTAIT FAUSSE. Elle affichait `comptes.nb_sites`, une valeur figée à
 * l'import : elle ne correspondait plus au nombre réel de sites sur 2642 des 2762 comptes.
 * La vue la recalcule.
 */
import { useNavigate } from 'react-router-dom'
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
import { useListeServeur } from '@/lib/useListeServeur'
import { useState } from 'react'
import type { TypeCompte } from '@/types/domain'

const typeMeta: Record<TypeCompte, { label: string; tone: 'kiwi' | 'blue' | 'amber' | 'neutral' }> = {
  client: { label: 'Consommateur', tone: 'kiwi' },
  fournisseur: { label: 'Fournisseur', tone: 'blue' },
  partenaire: { label: 'Partenaire', tone: 'amber' },
  kiwee: { label: 'KiWee', tone: 'neutral' },
}

interface LigneCompte {
  id: string
  nom: string
  ville: string | null
  segment: string | null
  type_compte: TypeCompte
  nb_sites: number
}

export default function Comptes() {
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState('')

  const liste = useListeServeur<LigneCompte>({
    vue: 'v_comptes_liste',
    colonnesRecherche: ['nom', 'segment', 'ville'],
    triParDefaut: 'nom',
    // Le filtre par type descend en base plutôt que de porter sur les lignes déjà chargées :
    // sans cela, filtrer « Fournisseur » n'aurait montré que ceux présents dans la tranche.
    filtres: { type_compte: typeFilter || null },
  })

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

        <ListToolbar query={liste.query} onQueryChange={liste.setQuery} placeholder="Rechercher un compte, une ville…" count={liste.total}>
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
                <SortableTh label="Nom" sortKey="nom" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <th className="px-5 py-3 font-medium">Type</th>
                <SortableTh label="Segment" sortKey="segment" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <SortableTh label="Ville" sortKey="ville" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
                <SortableTh label="Sites" sortKey="nb_sites" activeKey={liste.tri} dir={liste.sens} onSort={liste.trierPar} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {liste.isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
                </tr>
              )}
              {liste.erreur && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-red-600">{liste.erreur}</td>
                </tr>
              )}
              {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-navy-400">
                    {liste.query.trim() || typeFilter
                      ? 'Aucun compte ne correspond à la recherche.'
                      : "Aucun compte pour l'instant — clique sur « Nouveau compte » pour en créer un."}
                  </td>
                </tr>
              )}
              {liste.lignes.map((compte) => (
                <tr
                  key={compte.id}
                  onClick={() => navigate(`/comptes/${compte.id}`)}
                  className="cursor-pointer transition-colors hover:bg-navy-50"
                >
                  <td className="px-5 py-3 font-medium text-navy-800">{compte.nom}</td>
                  <td className="px-5 py-3">
                    <Badge tone={typeMeta[compte.type_compte]?.tone ?? 'neutral'}>
                      {typeMeta[compte.type_compte]?.label ?? compte.type_compte}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-navy-600">{compte.segment}</td>
                  <td className="px-5 py-3 text-navy-600">{compte.ville}</td>
                  <td className="px-5 py-3 text-navy-600">{compte.nb_sites}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PiedDeListe
            affiches={liste.lignes.length}
            total={liste.total}
            reste={liste.reste}
            onAfficherPlus={liste.afficherPlus}
            tailleTrancheSuivante={liste.tailleTrancheSuivante}
            libelle="comptes"
          />
        </Card>
      </div>
    </div>
  )
}
