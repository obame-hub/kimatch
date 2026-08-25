import { useState } from 'react'
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
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { FALLBACK_ETAPES_RECOMMANDATION, ETAPE_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { useListeServeur } from '@/lib/useListeServeur'
import { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

/** Le formulaire de création vit désormais dans son propre fichier, réécrit le 15/08/2026 en
 *  parcours à quatre étapes calqué sur l'OpportuniteWizard de Tools. Il reste réexporté ici :
 *  CompteDetail l'importe depuis cette page depuis l'origine. */
export { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

/** Une carte de la liste, telle que `v_recommandations_liste` la renvoie. */
interface LigneReco {
  id: string
  nom: string
  compte_id: string
  compte_nom: string | null
  etape: string
  conseiller: string
  priorite: number
  nb_versions: number
  sites: { id: string; nom: string }[]
}

export default function Recommandations() {
  const { data: etapesRef } = useReferenceTable('etapes_recommandation')
  /**
   * CHAQUE CONSEILLER NE VOIT QUE LES RECOMMANDATIONS DE SES COMPTES. Michel, 25/08/2026, « là en
   * urgence » : « Matthieu veut regarder ses recommandations, mais il a les recommandations de tout
   * le monde ». Accordé par Naoëlle dans le même appel.
   *
   * LE FILTRE EST ICI PARCE QUE CETTE PAGE NE LIT PAS `fetchRecommandations`. J'avais d'abord filtré
   * cette fonction, qui sert les fiches et le tableau de bord — mais /recommandations, l'écran DONT
   * IL PARLE, lit la vue `v_recommandations_liste` par `useListeServeur`. Le filtre était donc partout
   * sauf à l'endroit du reproche. La colonne `compte_proprietaire_id` vient de la migration
   * 20260825120000, écrite pour ça.
   *
   * LES ADMINISTRATEURS VOIENT TOUT — sa phrase en posant la question, « à part toi, moi ». Tant que
   * le rôle n'est pas connu, on ne filtre pas : afficher trop brièvement est moins trompeur que de
   * montrer une liste vide qu'on prendrait pour « je n'ai rien à traiter ».
   */
  const estAdmin = useIsAdmin()
  const { data: monProfil } = useMonProfil()
  const filtreProprietaire = !estAdmin && monProfil?.id ? monProfil.id : null
  const etapes = etapesRef && etapesRef.length > 0 ? etapesRef : FALLBACK_ETAPES_RECOMMANDATION
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [etapeFilter, setEtapeFilter] = useState('')

  const liste = useListeServeur<LigneReco>({
    vue: 'v_recommandations_liste',
    colonnesRecherche: ['nom', 'compte_nom', 'conseiller'],
    triParDefaut: 'nom',
    // Le filtre par etape descend en base : sinon il ne porterait que sur la tranche chargee.
    filtres: { etape: etapeFilter || null, compte_proprietaire_id: filtreProprietaire },
  })

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Recommandations"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <ListToolbar query={liste.query} onQueryChange={liste.setQuery} placeholder="Rechercher une recommandation, un compte…" count={liste.total}>
          <Select value={etapeFilter} onChange={(e) => setEtapeFilter(e.target.value)} className="w-auto">
            <option value="">Toutes les étapes</option>
            {etapes.map((e) => <option key={e.id} value={e.code}>{e.libelle}</option>)}
          </Select>
          <Select value={liste.tri} onChange={(e) => liste.trierPar(e.target.value)} className="w-auto">
            <option value="nom">Trier par titre</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="priorite">Trier par priorité</option>
          </Select>
        </ListToolbar>

        {liste.erreur && <p className="mb-4 text-sm text-red-600">{liste.erreur}</p>}
        {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            {liste.query.trim() || etapeFilter
              ? 'Aucune recommandation ne correspond à la recherche.'
              : "Aucune recommandation pour l'instant — c'est le cœur du métier KiWee : une proposition chiffrée (optimisations, offres) pour un ou plusieurs sites. Utilise « Nouvelle recommandation » pour en créer une."}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {liste.isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {liste.lignes.map((reco) => {
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
                    <p className="font-display font-medium text-navy-800">{reco.nom}</p>
                  </div>
                  <Badge tone={ETAPE_TONE[reco.etape] ?? 'neutral'}>{etapeLabel}</Badge>
                </div>
                <p className="text-xs text-navy-500">
                  <EntityLink to={`/comptes/${reco.compte_id}`}>{reco.compte_nom}</EntityLink>
                  {' · '}
                  {(reco.sites ?? []).map((s, i) => (
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
                  <span>{reco.nb_versions} version{reco.nb_versions > 1 ? 's' : ''}</span>
                </div>
              </Card>
            )
          })}
          <PiedDeListe
            affiches={liste.lignes.length}
            total={liste.total}
            reste={liste.reste}
            onAfficherPlus={liste.afficherPlus}
            tailleTrancheSuivante={liste.tailleTrancheSuivante}
            libelle="recommandations"
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
