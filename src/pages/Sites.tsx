import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, List, Map as MapIcon } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { SortableTh } from '@/components/ui/sortable-th'
import { useListControls } from '@/lib/useListControls'
import { useSites, useCreateSite } from '@/lib/data/sites'
import { useComptes } from '@/lib/data/comptes'
import { useSignaux } from '@/lib/data/signaux'
import { useContrats } from '@/lib/data/contrats'
import { useRecommandations } from '@/lib/data/recommandations'
import { useMandats } from '@/lib/data/mandats'
import { useActions } from '@/lib/data/actions'
import { useCompteurs } from '@/lib/data/compteurs'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_SITES } from '@/lib/referenceFallbacks'
import { computeSiteHealth } from '@/lib/siteHealth'
import { SiteHealthBadge } from '@/components/site/SiteHealthBadge'
import { SitesMap } from '@/components/site/SitesMap'
import { cn } from '@/lib/utils'

function CreateSiteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: comptes } = useComptes()
  const { data: typesRef } = useReferenceTable('types_sites')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_SITES
  const createSite = useCreateSite()

  const [nom, setNom] = useState('')
  const [compteId, setCompteId] = useState('')
  const [typeSiteId, setTypeSiteId] = useState('')
  const [ville, setVille] = useState('')
  const [codePostal, setCodePostal] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setNom('')
    setCompteId('')
    setTypeSiteId('')
    setVille('')
    setCodePostal('')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const compte = comptes?.find((c) => c.id === compteId)
    const type = types.find((t) => t.id === typeSiteId)
    if (!nom || !compte) return

    const result = await createSite.mutateAsync({
      nom,
      compte_id: compte.id,
      compte_nom: compte.nom,
      type_site_id: typeSiteId || null,
      type_site_libelle: type?.libelle ?? '',
      ville,
      code_postal: codePostal,
    })
    setFeedback(result.persisted ? 'Site créé.' : 'Site ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau site" description="Ajouter un site au patrimoine d'un compte existant.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="Nom du site">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Ex. Résidence Les Tilleuls" />
        </FormField>
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => setCompteId(e.target.value)} required>
            <option value="">Sélectionner un compte…</option>
            {comptes?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Type de site">
          <Select value={typeSiteId} onChange={(e) => setTypeSiteId(e.target.value)}>
            <option value="">Sélectionner un type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ville">
            <Input value={ville} onChange={(e) => setVille(e.target.value)} />
          </FormField>
          <FormField label="Code postal">
            <Input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} />
          </FormField>
        </div>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createSite.isPending}>Créer le site</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Sites() {
  const { data: sites, isLoading } = useSites()
  const { data: signaux } = useSignaux()
  const { data: contrats } = useContrats()
  const { data: recommandations } = useRecommandations()
  const { data: mandats } = useMandats()
  const { data: actions } = useActions()
  const { data: compteurs } = useCompteurs()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [view, setView] = useState<'liste' | 'carte'>('liste')

  const { query, setQuery, sortKey, sortDir, toggleSort, items: filteredSites } = useListControls(sites, {
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
          <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un site, compte, ville…" />
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

        {view === 'carte' && (
          <SitesMap
            sites={(filteredSites ?? []).map((site) => ({
              id: site.id,
              nom: site.nom,
              ville: site.ville,
              compte_nom: site.compte_nom,
              latitude: site.latitude,
              longitude: site.longitude,
              tone: computeSiteHealth({
                signaux: signaux?.filter((s) => s.site_id === site.id) ?? [],
                contrats: contrats?.filter((c) => c.site_id === site.id) ?? [],
                recommandations: recommandations?.filter((r) => r.sites.some((rs) => rs.id === site.id)) ?? [],
                mandat: mandats?.find((m) => m.compte_id === site.compte_id && m.site_ids.includes(site.id)),
                actions: actions?.filter((a) => a.site_id === site.id) ?? [],
                compteurs: compteurs?.filter((c) => c.site_id === site.id) ?? [],
              }).tone,
            }))}
          />
        )}

        {view === 'liste' && (
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
              {filteredSites?.map((site) => {
                const health = computeSiteHealth({
                  signaux: signaux?.filter((s) => s.site_id === site.id) ?? [],
                  contrats: contrats?.filter((c) => c.site_id === site.id) ?? [],
                  recommandations: recommandations?.filter((r) => r.sites.some((s) => s.id === site.id)) ?? [],
                  mandat: mandats?.find((m) => m.compte_id === site.compte_id && m.site_ids.includes(site.id)),
                  actions: actions?.filter((a) => a.site_id === site.id) ?? [],
                  compteurs: compteurs?.filter((c) => c.site_id === site.id) ?? [],
                })
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
        </Card>
        )}
      </div>
      <CreateSiteDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
