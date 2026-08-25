import { useState } from 'react'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useNavigate } from 'react-router-dom'
import { Plus, Sparkle, LayoutList, Columns3} from 'lucide-react'
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
import { useKanbanServeur } from '@/lib/useKanbanServeur'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { cn } from '@/lib/utils'
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
  const [vue, setVue] = useState<'liste' | 'kanban'>('liste')

  const liste = useListeServeur<LigneReco>({
    vue: 'v_recommandations_liste',
    colonnesRecherche: ['nom', 'compte_nom', 'conseiller'],
    triParDefaut: 'nom',
    // Le filtre par etape descend en base : sinon il ne porterait que sur la tranche chargee.
    filtres: { etape: etapeFilter || null, compte_proprietaire_id: filtreProprietaire },
  })

  /**
   * LE TABLEAU EST SERVI PAR LA BASE, une requête par colonne.
   *
   * La liste de cette page est paginée côté serveur : construire le tableau à partir de la tranche
   * chargée ferait compter les cent lignes reçues au lieu des 648 réelles, et laisserait des colonnes
   * vides simplement parce que leur page n'a pas été demandée. Voir useKanbanServeur.
   *
   * Les huit étapes, terminales comprises : sur la page d'un objet, le tableau montre tout le
   * pipeline. La recherche et le filtre de propriétaire de la liste s'y appliquent — sans quoi les
   * deux vues montreraient deux populations différentes sous le même bandeau.
   */
  const tableau = useKanbanServeur<LigneReco>({
    vue: 'v_recommandations_liste',
    colonneStatut: 'etape',
    colonnes: etapes.map((e) => ({ code: e.code, libelle: e.libelle })),
    colonnesRecherche: ['nom', 'compte_nom', 'conseiller'],
    recherche: liste.query,
    filtres: { compte_proprietaire_id: filtreProprietaire },
    actif: vue === 'kanban',
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
          {/* « Sur chaque type de page on garde toujours de base le truc » (Michel, 25/08) : la liste
              reste le défaut, le tableau s'ajoute. */}
          <div className="flex items-center gap-1 rounded-kw-lg border-[1.5px] border-kw-border-strong bg-white p-1">
            {([
              { cle: 'liste' as const, libelle: 'Liste', icone: LayoutList },
              { cle: 'kanban' as const, libelle: 'Kanban', icone: Columns3 },
            ]).map((v) => {
              const Icone = v.icone
              return (
                <button
                  key={v.cle}
                  type="button"
                  onClick={() => setVue(v.cle)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-kw-md px-2.5 py-1 text-kw-sm font-bold transition-colors',
                    vue === v.cle ? 'bg-ink-800 text-white' : 'text-kw-label hover:bg-kw-subtle',
                  )}
                >
                  <Icone className="h-3.5 w-3.5" strokeWidth={2.2} />
                  {v.libelle}
                </button>
              )
            })}
          </div>
          {/* Le filtre par étape n'a pas de sens en tableau : les étapes SONT les colonnes. */}
          {vue === 'liste' && <Select value={etapeFilter} onChange={(e) => setEtapeFilter(e.target.value)} className="w-auto">
            <option value="">Toutes les étapes</option>
            {etapes.map((e) => <option key={e.id} value={e.code}>{e.libelle}</option>)}
          </Select>}
          {vue === 'liste' && <Select value={liste.tri} onChange={(e) => liste.trierPar(e.target.value)} className="w-auto">
            <option value="nom">Trier par titre</option>
            <option value="compte_nom">Trier par compte</option>
            <option value="priorite">Trier par priorité</option>
          </Select>}
        </ListToolbar>

        {liste.erreur && <p className="mb-4 text-sm text-red-600">{liste.erreur}</p>}
        {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
          <p className="mb-4 text-sm text-navy-400">
            {liste.query.trim() || etapeFilter
              ? 'Aucune recommandation ne correspond à la recherche.'
              : "Aucune recommandation pour l'instant — c'est le cœur du métier KiWee : une proposition chiffrée (optimisations, offres) pour un ou plusieurs sites. Utilise « Nouvelle recommandation » pour en créer une."}
          </p>
        )}
        {vue === 'kanban' ? (
          <TableauKanban
            colonnes={(tableau.data ?? []).map((c) => ({ code: c.code, libelle: c.libelle }))}
            cartes={Object.fromEntries(
              (tableau.data ?? []).map((c) => [
                c.code,
                c.lignes.map((r) => ({
                  id: r.id,
                  titre: r.nom,
                  sousTitre: r.compte_nom ?? undefined,
                  mention: r.nb_versions > 1 ? `${r.nb_versions} versions` : undefined,
                  to: `/recommandations/${r.id}`,
                })),
              ]),
            )}
            /* LE TOTAL VIENT DE LA BASE, pas du nombre de cartes reçues : dix par colonne sont
               demandées, et une colonne peut en compter six cents. */
            totaux={Object.fromEntries((tableau.data ?? []).map((c) => [c.code, c.total]))}
            siVide={tableau.isLoading ? 'Chargement…' : 'Aucune recommandation ne correspond.'}
          />
        ) : (
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
        )}
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
