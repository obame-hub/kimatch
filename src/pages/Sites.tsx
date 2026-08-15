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
 * Le chemin d'avant est conservé sous `replin` : entre le déploiement du code et l'application de
 * la migration par Naoëlle ou Michel, la fonction n'existe pas encore en base et la page doit
 * continuer à s'afficher. Une fois la migration passée, ce chemin ne s'exécute plus jamais.
 */
import { useEffect, useMemo, useState } from 'react'
import { CreationCompteurDialog } from '@/components/compteur/CreationCompteurDialog'
import { useTranchesAffichage } from '@/lib/useTranchesAffichage'
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
import { useListControls } from '@/lib/useListControls'
import { useFrappePosee } from '@/lib/useFrappePosee'
import {
  useSites,
  useSitesListe,
  useSitesCarte,
  FonctionListeAbsente,
  type TriSites,
} from '@/lib/data/sites'
import { useSignaux } from '@/lib/data/signaux'
import { useContrats } from '@/lib/data/contrats'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { useMandats } from '@/lib/data/mandats'
import { useCompteurs } from '@/lib/data/compteurs'
import { computeSiteHealth, construireSante, tonDuScore, type SiteHealth } from '@/lib/siteHealth'
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

  // La migration n'est pas encore appliquée : on repasse par l'ancien chargement.
  const replin =
    listeServeur.error instanceof FonctionListeAbsente || carteServeur.error instanceof FonctionListeAbsente

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
          <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un site, compte, ville…" count={replin ? undefined : total} />
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

        {replin ? (
          <SitesAncienChemin view={view} query={query} />
        ) : (
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
        )}
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

/**
 * Ancien chargement, conservé le temps que la migration soit appliquée en base.
 *
 * Volontairement isolé dans son propre composant : ses six `use*` ne se déclenchent que s'il est
 * monté, donc le chemin normal ne paie rien pour lui. À supprimer une fois la fonction
 * `liste_sites` présente sur tous les environnements.
 */
function SitesAncienChemin({ view, query }: { view: 'liste' | 'carte'; query: string }) {
  const navigate = useNavigate()
  const { data: sites, isLoading } = useSites()
  const { data: signaux } = useSignaux()
  const { data: contrats } = useContrats()
  const { data: recommandations } = useRecommandationsListe()
  const { data: mandats } = useMandats()
  const { data: compteurs } = useCompteurs()

  // La barre de recherche appartient au composant parent : on applique sa saisie ici, avant de
  // confier le tri à useListControls (dont l'état de recherche interne reste vide).
  const sitesCherches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sites
    return sites?.filter((s) =>
      [s.nom, s.compte_nom, s.type_site, s.ville].some((f) => (f ?? '').toLowerCase().includes(q)),
    )
  }, [sites, query])

  const { sortKey, sortDir, toggleSort, items: filteredSites } = useListControls(sitesCherches, {
    searchFields: (s) => [s.nom, s.compte_nom, s.type_site, s.ville],
    sorters: {
      nom: (a, b) => a.nom.localeCompare(b.nom),
      compte_nom: (a, b) => a.compte_nom.localeCompare(b.compte_nom),
      type_site: (a, b) => (a.type_site ?? '').localeCompare(b.type_site ?? ''),
      ville: (a, b) => (a.ville ?? '').localeCompare(b.ville ?? ''),
      nb_compteurs: (a, b) => a.nb_compteurs - b.nb_compteurs,
      nb_signaux_ouverts: (a, b) => a.nb_signaux_ouverts - b.nb_signaux_ouverts,
    },
    defaultSort: 'nom',
  })

  const tranche = useTranchesAffichage(filteredSites, `${query}|${sortKey}|${sortDir}`)

  const santeDe = (site: NonNullable<typeof sites>[number]) =>
    computeSiteHealth({
      signaux: signaux?.filter((s) => s.site_id === site.id) ?? [],
      contrats: contrats?.filter((c) => c.site_id === site.id) ?? [],
      recommandations: recommandations?.filter((r) => r.sites.some((rs) => rs.id === site.id)) ?? [],
      mandat: mandats?.find((m) => m.compte_id === site.compte_id && m.site_ids.includes(site.id)),
      compteurs: compteurs?.filter((c) => c.site_id === site.id) ?? [],
    })

  if (view === 'carte') {
    return (
      <SitesMap
        sites={(filteredSites ?? []).map((site): SitesMapItem => ({
          id: site.id,
          nom: site.nom,
          ville: site.ville,
          compte_nom: site.compte_nom,
          latitude: site.latitude,
          longitude: site.longitude,
          tone: santeDe(site).tone,
        }))}
      />
    )
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
          <tr>
            <SortableTh label="Site" sortKey="nom" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh label="Compte" sortKey="compte_nom" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh label="Type" sortKey="type_site" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh label="Ville" sortKey="ville" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh label="Compteurs" sortKey="nb_compteurs" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh label="Signaux ouverts" sortKey="nb_signaux_ouverts" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <th className="px-5 py-3 font-medium">Santé</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100">
          {isLoading && (
            <tr>
              <td colSpan={7} className="px-5 py-6 text-center text-navy-400">Chargement…</td>
            </tr>
          )}
          {!isLoading && filteredSites?.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-10 text-center text-sm text-navy-400">
                {sites?.length === 0
                  ? "Aucun site pour l'instant — un site représente un bâtiment, un immeuble ou un local rattaché à un compte (syndic, entreprise…). Clique sur « Nouveau site » pour en créer un."
                  : 'Aucun site ne correspond à la recherche.'}
              </td>
            </tr>
          )}
          {tranche.visibles.map((site) => (
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
                <SiteHealthBadge health={santeDe(site)} />
              </td>
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
        libelle="sites"
      />
    </Card>
  )
}
