import { useState } from 'react'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useNavigate } from 'react-router-dom'
import { Plus, Sparkle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { EtapeCompact } from '@/components/ui/etape-stepper'
import { Select } from '@/components/ui/form'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_ETAPES_RECOMMANDATION, ETAPE_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListControls } from '@/lib/useListControls'
import { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

/** Le formulaire de création vit désormais dans son propre fichier, réécrit le 15/08/2026 en
 *  parcours à quatre étapes calqué sur l'OpportuniteWizard de Tools. Il reste réexporté ici :
 *  CompteDetail l'importe depuis cette page depuis l'origine. */
export { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

export default function Recommandations() {
  const { data: recommandations, isLoading } = useRecommandationsListe()
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [etapeFilter, setEtapeFilter] = useState('')

  const recommandationsFiltreesParEtape = etapeFilter ? recommandations?.filter((r) => r.etape === etapeFilter) : recommandations

  const { query, setQuery, sortKey, setSortKey, items: filteredRecommandations } = useListControls(recommandationsFiltreesParEtape, {
    searchFields: (r) => [r.titre, r.compte_nom, r.conseiller],
    sorters: {
      titre: (a, b) => a.titre.localeCompare(b.titre),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      priorite: (a, b) => a.priorite - b.priorite,
    },
    defaultSort: 'titre',
  })

  const tranche = useTranchesAffichage(filteredRecommandations, `${query}|${sortKey}`)

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Recommandations"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher une recommandation, un compte…" count={filteredRecommandations?.length}>
          <Select value={etapeFilter} onChange={(e) => setEtapeFilter(e.target.value)} className="w-auto">
            <option value="">Toutes les étapes</option>
            {etapes.map((e) => <option key={e.id} value={e.code}>{e.libelle}</option>)}
          </Select>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="w-auto">
            <option value="titre">Trier par titre</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="priorite">Trier par priorité</option>
          </Select>
        </ListToolbar>

        {!isLoading && recommandations?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            Aucune recommandation pour l'instant — c'est le cœur du métier KiWee : une proposition chiffrée (optimisations, offres) pour un ou plusieurs sites. Utilise « Nouvelle recommandation » pour en créer une.
          </p>
        )}
        {!isLoading && recommandations && recommandations.length > 0 && filteredRecommandations?.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">Aucune recommandation ne correspond à la recherche.</p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {tranche.visibles.map((reco) => {
            const etapeLabel = etapes.find((e) => e.code === reco.etape)?.libelle ?? reco.etape
            return (
              <Card
                key={reco.id}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => navigate(`/recommandations/${reco.id}`)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                      <Sparkle className="h-4 w-4" />
                    </span>
                    <p className="font-display font-medium text-navy-800">{reco.titre}</p>
                  </div>
                  <Badge tone={ETAPE_TONE[reco.etape] ?? 'neutral'}>{etapeLabel}</Badge>
                </div>
                <p className="text-xs text-navy-500">
                  <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink>
                  {' · '}
                  {reco.sites.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ', '}
                      <EntityLink to={`/sites/${s.id}`}>{s.nom}</EntityLink>
                    </span>
                  ))}
                </p>

                <div className="mt-4">
                  <EtapeCompact steps={etapes} currentCode={reco.etape} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-navy-400">
                  <span>{reco.conseiller}</span>
                  <span>{reco.versions.length} version{reco.versions.length > 1 ? 's' : ''}</span>
                </div>
              </Card>
            )
          })}
          <PiedDeListe
            affiches={tranche.visibles.length}
            total={tranche.total}
            reste={tranche.reste}
            onAfficherPlus={tranche.afficherPlus}
            tailleTrancheSuivante={tranche.tailleTrancheSuivante}
            libelle="opportunités"
          />
        </div>
      </div>
      {showCreate && (
        <CreateRecommandationDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(recoId) => navigate(`/recommandations/${recoId}`)}
        />
      )}
    </div>
  )
}
