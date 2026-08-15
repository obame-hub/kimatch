/**
 * Liste des sites — servie par la base depuis le 15/08/2026.
 *
 * AVANT. La page montait six chargements complets (useSites, useSignaux, useContrats,
 * useRecommandationsListe, useMandats, useCompteurs) pour afficher vingt lignes, puis recalculait
 * la santé de chaque site dans le navigateur en refiltrant ces six tableaux site par site : les
 * 6348 sites et 7886 compteurs traversaient le réseau à chaque visite, 87 requêtes PostgREST, et
 * un coût qui grossissait avec la base.
 *
 * APRÈS. Une seule requête (fonction `liste_sites`) rend la tranche demandée, déjà filtrée, triée,
 * comptée et notée. La recherche et le tri repartent en base au lieu de porter sur un tableau
 * chargé en mémoire, donc ils portent sur TOUS les sites et plus seulement sur ce qui avait été
 * téléchargé. Mesuré sur la production le 15/08/2026 : ~140 ms pour 100 lignes.
 *
 * Le chemin d'avant avait été gardé en repli le temps que la migration soit appliquée ; elle l'a
 * été le 15/08/2026 (fonctions `liste_sites` et `carte_sites` vérifiées en base, production
 * mesurée à ~131 ms), il a donc été retiré le jour même.
 */
import { useEffect, useState } from 'react'
import { CreationCompteurDialog } from '@/components/compteur/CreationCompteurDialog'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, List, Map as MapIcon } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { SortableTh } from '@/components/ui/sortable-th'
import { useFrappePosee } from '@/lib/useFrappePosee'
import { useSites, useSitesListe, useSitesCarte, type TriSites } from '@/lib/data/sites'
import { construireSante, tonDuScore, type SiteHealth } from '@/lib/siteHealth'
import { SiteHealthBadge } from '@/components/site/SiteHealthBadge'
import { SitesMap, type SitesMapItem } from '@/components/site/SitesMap'
import { cn } from '@/lib/utils'

/** Première tranche affichée, puis pas d'agrandissement — repris de useTranchesAffichage. */
const TRANCHE_INITIALE = 100
const TRANCHE_SUIVANTE = 200

export default function Sites() {
  const navigate = useNavigate()
  const location = useLocation()
  const openCreateForCompteId = (location.state as { openCreateForCompteId?: string } | null)?.openCreateForCompteId
  const [showCreate, setShowCreate] = useState(!!openCreateForCompteId)
  const [view, setView] = useState<'liste' | 'carte'>('liste')
  const [toast, setToast] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [tri, setTri] = useState<TriSites>('nom')
  const [sens, setSens] = useState<'asc' | 'desc'>('asc')
  const [limite, setLimite] = useState(TRANCHE_INITIALE)

  // Chaque lettre relancerait sinon une requête complète.
  const recherche = useFrappePosee(query)

  // Revenir à la première tranche dès que la liste change de nature : sans cela, une nouvelle
  // recherche continuerait de demander les 500 lignes chargées pour la précédente.
  useEffect(() => {
    setLimite(TRANCHE_INITIALE)
  }, [recherche, tri, sens])

  useEffect(() => {
    if (openCreateForCompteId) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listeServeur = useSitesListe({ recherche, tri, sens, limite })
  const carteServeur = useSitesCarte(recherche, view === 'carte')

  function trierPar(cle: string) {
    const k = cle as TriSites
    if (k === tri) setSens((s) => (s === 'asc' ? 'desc' : 'asc'))
    else { setTri(k); setSens('asc') }
  }

  const lignes = listeServeur.data ?? []
  const total = lignes[0]?.total ?? 0

  const enTete = (
    <>
      <SortableTh label="Site" sortKey="nom" activeKey={tri} dir={sens} onSort={trierPar} />
      <SortableTh label="Compte" sortKey="compte_nom" activeKey={tri} dir={sens} onSort={trierPar} />
      <SortableTh label="Type" sortKey="type_site" activeKey={tri} dir={sens} onSort={trierPar} />
      <SortableTh label="Ville" sortKey="ville" activeKey={tri} dir={sens} onSort={trierPar} />
      <SortableTh label="Compteurs" sortKey="nb_compteurs" activeKey={tri} dir={sens} onSort={trierPar} />
      <SortableTh label="Signaux ouverts" sortKey="nb_signaux_ouverts" activeKey={tri} dir={sens} onSort={trierPar} />
      <th className="px-5 py-3 font-medium">Santé</th>
    </>
  )

  return (
    <div>
      <Topbar title="Sites" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Sites"
          description="L'objet central du patrimoine énergétique — chaque recommandation, signal et contrat s'y rattache."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau site</Button>}
        />

        <div className="mb-3.5 flex items-center justify-between gap-3">
          <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un site, compte, ville…" count={total} />
          <div className="flex shrink-0 gap-1 rounded-lg border border-navy-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('liste')}
              className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold', view === 'liste' ? 'bg-ink-800 text-white' : 'text-navy-500 hover:bg-navy-50')}
            >
              <List className="h-3.5 w-3.5" /> Liste
            </button>
            <button
              type="button"
              onClick={() => setView('carte')}
              className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold', view === 'carte' ? 'bg-ink-800 text-white' : 'text-navy-500 hover:bg-navy-50')}
            >
              <MapIcon className="h-3.5 w-3.5" /> Carte
            </button>
          </div>
        </div>
        <>
            {view === 'carte' && (
              <SitesMap
                sites={(carteServeur.data ?? []).map((s): SitesMapItem => ({
                  id: s.id,
                  nom: s.nom,
                  ville: s.ville,
                  compte_nom: s.compte_nom ?? '',
                  latitude: s.latitude,
                  longitude: s.longitude,
                  tone: tonDuScore(s.score_sante),
                }))}
              />
            )}

            {view === 'liste' && (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
                    <tr>{enTete}</tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {listeServeur.isLoading && (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
                      </tr>
                    )}
                    {!listeServeur.isLoading && lignes.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-sm text-navy-400">
                          {recherche.trim()
                            ? 'Aucun site ne correspond à la recherche.'
                            : "Aucun site pour l'instant — un site représente un bâtiment, un immeuble ou un local rattaché à un compte (syndic, entreprise…). Clique sur « Nouveau site » pour en créer un."}
                        </td>
                      </tr>
                    )}
                    {lignes.map((site) => {
                      const health: SiteHealth = construireSante(site)
                      return (
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
                          <td className="px-5 py-3">
                            <SiteHealthBadge health={health} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <PiedDeListe
                  affiches={lignes.length}
                  total={total}
                  reste={total - lignes.length}
                  onAfficherPlus={() => setLimite((n) => n + TRANCHE_SUIVANTE)}
                  tailleTrancheSuivante={TRANCHE_SUIVANTE}
                  libelle="sites"
                />
              </Card>
            )}
        </>
      </div>
      {/* Exactement le parcours « Nouveau compteur » de la fiche compte, sous un autre nom :
          depuis la décision de William, un site n'est qu'un libellé porté par son point de
          livraison — le créer seul n'aurait aucun contenu. Le compte se choisit dans le dialogue,
          puisqu'on n'arrive pas d'une fiche compte. */}
      {showCreate && (
        <CreationCompteurDialogRelais
          compteIdParDefaut={openCreateForCompteId}
          onClose={() => setShowCreate(false)}
          onSaved={(message) => setToast(message)}
        />
      )}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Le dialogue de création a besoin de la liste des sites pour rapprocher un PDL d'un site
 * existant (matchSitesPourCompteur). Il n'est monté qu'à l'ouverture, donc ce chargement complet
 * ne pèse plus sur l'affichage de la page — c'est le seul endroit qui en a encore besoin.
 */
function CreationCompteurDialogRelais({
  compteIdParDefaut,
  onClose,
  onSaved,
}: {
  compteIdParDefaut?: string
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const { data: sites } = useSites()
  return (
    <CreationCompteurDialog
      open
      onClose={onClose}
      sites={sites ?? []}
      titre="Nouveau site"
      compteIdParDefaut={compteIdParDefaut}
      onSaved={onSaved}
    />
  )
}
