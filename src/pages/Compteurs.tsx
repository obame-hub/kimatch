/**
 * Liste des compteurs — le seul objet du patrimoine qui n'avait pas la sienne.
 *
 * Diapositive 8 de Michel : le patrimoine, c'est « Compte · Contacts · Sites · Compteurs · Mandats ·
 * Contrats · Documents ». Six de ces sept objets avaient une liste ; les compteurs ne se voyaient
 * qu'à travers un site, alors que ce sont eux qui portent l'échéance — donc le moment de rappeler.
 *
 * ELLE EST FAITE POUR LES DIAPOSITIVES 6 ET 7, pas seulement pour lister. La 6 distingue l'échéance
 * prouvée de l'estimée ; la 7 décrit la réactivation, qui commence par « détecter les échéances
 * inexploitables : absentes ou dépassées ». Les filtres de cette page sont exactement ces cas, et
 * les nombres mesurés en production le 24/08/2026 disent pourquoi ils comptent :
 *   1 036 prouvées · 6 275 estimées · 588 sans aucune échéance · 3 861 déjà dépassées
 *
 * LA VOLUMÉTRIE EST ASSUMÉE, PAS IGNORÉE. Cette page charge les 7 899 compteurs et les 1 600
 * contrats, puis filtre dans le navigateur — le travers que la liste des sites a justement quitté le
 * 15/08/2026 en passant par une fonction en base. Le tri propre serait une fonction `liste_compteurs`
 * rendant la tranche demandée, déjà filtrée et déjà notée. C'est une migration, donc à appliquer par
 * Naoëlle ou Michel : d'ici là cette page reste utilisable, et les deux chargements sont partagés
 * avec le reste de l'application par le cache de TanStack Query.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gauge, Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { SortableTh } from '@/components/ui/sortable-th'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { BadgeEcheance } from '@/components/compteur/BadgeEcheance'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContrats } from '@/lib/data/contrats'
import { useListControls } from '@/lib/useListControls'
import { natureEcheance, type EcheanceCompteur } from '@/lib/echeance'
import { cn } from '@/lib/utils'

const TRANCHE_INITIALE = 100
const TRANCHE_SUIVANTE = 200

/** Les cas de la diapositive 7 : « absentes ou dépassées », plus ce qui arrive. */
type Filtre = 'tous' | 'absente' | 'depassee' | 'six_mois' | 'prouvee' | 'estimee'

const FILTRES: { cle: Filtre; libelle: string; aide: string }[] = [
  { cle: 'tous', libelle: 'Tous', aide: 'Tous les compteurs du patrimoine.' },
  { cle: 'absente', libelle: 'Sans échéance', aide: 'Aucune date, ni prouvée ni estimée : le compteur reste à qualifier.' },
  { cle: 'depassee', libelle: 'Dépassée', aide: 'L’échéance est passée : la donnée est inexploitable en l’état.' },
  { cle: 'six_mois', libelle: 'Dans 6 mois', aide: 'L’échéance tombe dans les six prochains mois.' },
  { cle: 'prouvee', libelle: 'Prouvée', aide: 'Un contrat rattaché dans Kimatch porte cette date.' },
  { cle: 'estimee', libelle: 'Estimée', aide: 'Date déclarée par le client, sans contrat pour l’attester.' },
]

export default function Compteurs({ sansEntete }: { sansEntete?: boolean }) {
  const navigate = useNavigate()
  const { data: compteurs, isLoading } = useCompteurs()
  const { data: contrats } = useContrats()
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [limite, setLimite] = useState(TRANCHE_INITIALE)

  // Les contrats indexés par compteur : sans cet index, chaque ligne relirait les 1 600 contrats.
  const contratsParCompteur = useMemo(() => {
    const m = new Map<string, { date_fin: string | null }[]>()
    for (const ct of contrats ?? []) {
      for (const k of ct.compteurs) {
        m.set(k.id, [...(m.get(k.id) ?? []), { date_fin: ct.date_fin }])
      }
    }
    return m
  }, [contrats])

  const jour = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const dansSixMois = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // La nature calculée une fois par compteur, portée à côté de lui : les filtres, le tri et
  // l'affichage la relisent au lieu de la recalculer chacun.
  const enrichis = useMemo(() => {
    return (compteurs ?? []).map((c) => ({
      c,
      e: natureEcheance(c.date_echeance, contratsParCompteur.get(c.id) ?? []),
    }))
  }, [compteurs, contratsParCompteur])

  const comptes = useMemo(() => {
    const n = { absente: 0, depassee: 0, six_mois: 0, prouvee: 0, estimee: 0 }
    for (const { e } of enrichis) {
      if (e.nature === 'ABSENTE') n.absente++
      else {
        if (e.nature === 'PROUVEE') n.prouvee++
        else n.estimee++
        if (e.date && e.date < jour) n.depassee++
        else if (e.date && e.date <= dansSixMois) n.six_mois++
      }
    }
    return n
  }, [enrichis, jour, dansSixMois])

  const filtres = useMemo(() => {
    return enrichis.filter(({ e }) => {
      switch (filtre) {
        case 'absente': return e.nature === 'ABSENTE'
        case 'depassee': return !!e.date && e.date < jour
        case 'six_mois': return !!e.date && e.date >= jour && e.date <= dansSixMois
        case 'prouvee': return e.nature === 'PROUVEE'
        case 'estimee': return e.nature === 'ESTIMEE'
        default: return true
      }
    })
  }, [enrichis, filtre, jour, dansSixMois])

  const { query, setQuery, sortKey, sortDir, toggleSort, items } = useListControls(filtres, {
    searchFields: ({ c }) => [c.numero_pdl, c.site_nom, c.localisation_site, c.ville, c.type_energie],
    sorters: {
      numero_pdl: (a, b) => a.c.numero_pdl.localeCompare(b.c.numero_pdl),
      site_nom: (a, b) => a.c.site_nom.localeCompare(b.c.site_nom),
      type_energie: (a, b) => a.c.type_energie.localeCompare(b.c.type_energie),
      // Les compteurs sans échéance en dernier : ce sont ceux dont on ne sait rien, pas ceux dont
      // l'échéance serait « très ancienne ».
      echeance: (a, b) => (a.e.date ?? '9999').localeCompare(b.e.date ?? '9999'),
      consommation: (a, b) => (b.c.consommation_annuelle_mwh ?? -1) - (a.c.consommation_annuelle_mwh ?? -1),
    },
    defaultSort: 'echeance',
  })

  const lignes = (items ?? []).slice(0, limite)
  const total = items?.length ?? 0

  return (
    <div>
      {!sansEntete && <Topbar title="Compteurs" />}
      <div className={sansEntete ? '' : 'p-4 sm:p-6'}>
        <PageHeader
          icone={<Gauge className="h-[19px] w-[19px]" strokeWidth={2.1} />}
          teinte="from-navy-700 to-navy-500"
          title="Compteurs"
          description="Les points de livraison — PDL en électricité, PCE en gaz. C’est le compteur qui porte l’échéance, donc le moment d’agir."
        />

        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          {FILTRES.map((f) => {
            const n = f.cle === 'tous' ? (compteurs?.length ?? 0) : comptes[f.cle]
            return (
              <button
                key={f.cle}
                type="button"
                title={f.aide}
                onClick={() => { setFiltre(f.cle); setLimite(TRANCHE_INITIALE) }}
                className={cn(
                  'rounded-kw-md border px-2.5 py-1.5 text-kw-xs font-semibold',
                  filtre === f.cle
                    ? 'border-ink-800 bg-ink-800 text-white'
                    : 'border-kw-border bg-white text-kw-meta hover:bg-kw-subtle',
                )}
              >
                {f.libelle}
                <span className={cn('ml-1.5 font-mono', filtre === f.cle ? 'text-white/70' : 'text-kw-meta')}>{n}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-3.5">
          <ListToolbar query={query} onQueryChange={setQuery} placeholder="Rechercher un PDL, un site, une ville…" count={total} />
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-400">
              <tr>
                <SortableTh label="Point de livraison" sortKey="numero_pdl" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Site" sortKey="site_nom" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Énergie" sortKey="type_energie" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Échéance" sortKey="echeance" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-5 py-3 font-medium">Nature</th>
                <SortableTh label="Consommation" sortKey="consommation" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-navy-400">Chargement…</td></tr>
              )}
              {!isLoading && lignes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-navy-400">
                    {query.trim() ? 'Aucun compteur ne correspond à la recherche.' : 'Aucun compteur dans ce filtre.'}
                  </td>
                </tr>
              )}
              {lignes.map(({ c, e }) => (
                <LigneCompteur key={c.id} compteur={c} echeance={e} jour={jour} onOuvrir={() => navigate(`/compteurs/${c.id}`)} />
              ))}
            </tbody>
          </table>
          <PiedDeListe
            affiches={lignes.length}
            total={total}
            reste={total - lignes.length}
            onAfficherPlus={() => setLimite((n) => n + TRANCHE_SUIVANTE)}
            tailleTrancheSuivante={TRANCHE_SUIVANTE}
            libelle="compteurs"
          />
        </Card>
      </div>
    </div>
  )
}

function LigneCompteur({
  compteur,
  echeance,
  jour,
  onOuvrir,
}: {
  compteur: { id: string; numero_pdl: string; site_id: string; site_nom: string; type_energie: string; localisation_site?: string | null; consommation_annuelle_mwh: number | null }
  echeance: EcheanceCompteur
  jour: string
  onOuvrir: () => void
}) {
  const gaz = compteur.type_energie === 'gaz'
  const depassee = !!echeance.date && echeance.date < jour
  return (
    <tr onClick={onOuvrir} className="cursor-pointer hover:bg-navy-50">
      <td className="px-5 py-3 font-mono text-xs font-medium text-navy-800">
        {compteur.numero_pdl}
        {compteur.localisation_site && (
          <span className="ml-2 font-sans text-navy-400">{compteur.localisation_site}</span>
        )}
      </td>
      <td className="px-5 py-3 text-navy-600">
        <EntityLink to={`/sites/${compteur.site_id}`}>{compteur.site_nom}</EntityLink>
      </td>
      <td className="px-5 py-3">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', gaz ? 'text-orange-600' : 'text-amber-600')}>
          {gaz ? <Flame className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
          {gaz ? 'Gaz' : 'Électricité'}
        </span>
      </td>
      <td className="px-5 py-3">
        {echeance.date ? (
          <span className={cn('text-navy-700', depassee && 'font-semibold text-kw-red')}>
            {new Date(echeance.date + 'T12:00:00').toLocaleDateString('fr-FR')}
            {depassee && <span className="ml-1.5 text-[10px] font-bold uppercase">dépassée</span>}
          </span>
        ) : (
          <span className="text-navy-300">—</span>
        )}
      </td>
      <td className="px-5 py-3"><BadgeEcheance e={echeance} dense /></td>
      <td className="px-5 py-3 text-navy-600">
        {compteur.consommation_annuelle_mwh != null
          ? `${compteur.consommation_annuelle_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh`
          : <Badge tone="neutral">Non renseignée</Badge>}
      </td>
    </tr>
  )
}
