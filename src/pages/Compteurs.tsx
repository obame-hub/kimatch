/**
 * Liste des compteurs — le seul objet du patrimoine qui n'avait pas la sienne.
 *
 * Diapositive 8 de Michel : le patrimoine, c'est « Compte · Contacts · Sites · Compteurs · Mandats ·
 * Contrats · Documents ». Six de ces sept objets avaient une liste ; les compteurs ne se voyaient
 * qu'à travers un site, alors que ce sont eux qui portent l'échéance — donc le moment de rappeler.
 *
 * ELLE EST FAITE POUR LES DIAPOSITIVES 6 ET 7, pas seulement pour lister. La 6 distingue l'échéance
 * prouvée de l'estimée ; la 7 décrit la réactivation, qui commence par « détecter les échéances
 * inexploitables : absentes ou dépassées ». Les filtres sont exactement ces cas, et les nombres
 * mesurés en production le 24/08/2026 disent pourquoi ils comptent : sur 7 899 compteurs, 588 n'ont
 * aucune échéance et 3 861 l'ont dépassée.
 *
 * MA PREMIÈRE VERSION A GELÉ L'ONGLET. Elle chargeait les 7 899 compteurs avec leurs huit relations
 * jointes, plus les 1 600 contrats, et filtrait dans le navigateur. J'avais écrit « volumétrie
 * assumée » dans ce même fichier ; à l'ouverture le moteur de rendu s'est bloqué, capture d'écran
 * impossible. Ce n'était pas une lenteur à assumer, c'était un défaut — et le commentaire qui
 * l'assumait ne le rendait pas acceptable.
 *
 * MAINTENANT LA BASE FAIT LE TRAVAIL. Recherche, filtre, tri, comptage et pagination partent en base
 * (`useCompteursListe`), donc ils portent sur TOUS les compteurs et non sur ce qui aurait été
 * téléchargé — et la page ne reçoit que sa tranche de cent lignes.
 *
 * ON PEUT DÉSORMAIS FILTRER SUR LA NATURE, ce qui n'était pas le cas jusqu'au 25/08/2026 : « prouvée »
 * exige de savoir si un contrat est rattaché, donc de lire une autre table, et PostgREST n'en fait pas
 * un filtre. La vue `v_compteurs_liste` (migration 20260825200000) porte maintenant la nature comme
 * une colonne, avec la règle exacte de `echeance.ts` — vérifiée en répétition : 1 036 prouvées,
 * 6 276 estimées, 589 absentes, 144 contradictions, les chiffres de l'application au compteur près.
 *
 * Reste la limite du champ de recherche sur le nom du site, qui appartient à la table jointe — le
 * message de liste vide le dit plutôt que de chercher à moitié en silence.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Flame } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetre, useMonPortefeuille, BasculePerimetre } from '@/lib/perimetre'
import { SortableTh } from '@/components/ui/sortable-th'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { BadgeEcheance } from '@/components/compteur/BadgeEcheance'
import {
  useCompteursListe,
  useComptesEcheances,
  type FiltreEcheance,
  type TriCompteurs,
  type LigneCompteur,
} from '@/lib/data/compteurs'
import { useContrats } from '@/lib/data/contrats'
import { useFrappePosee } from '@/lib/useFrappePosee'
import { natureEcheance, type EcheanceCompteur } from '@/lib/echeance'
import { cn } from '@/lib/utils'
import { Tableau, TableauTete, TableauCorps } from '@/components/ui/tableau'

const TRANCHE_INITIALE = 100
const TRANCHE_SUIVANTE = 200

const FILTRES: { cle: FiltreEcheance; libelle: string; aide: string }[] = [
  { cle: 'tous', libelle: 'Tous', aide: 'Tous les compteurs actifs du patrimoine.' },
  { cle: 'absente', libelle: 'Sans échéance', aide: 'Aucune date : le compteur reste à qualifier (diapositive 7).' },
  { cle: 'depassee', libelle: 'Dépassée', aide: 'L’échéance est passée : la donnée est inexploitable en l’état.' },
  { cle: 'six_mois', libelle: 'Dans 6 mois', aide: 'L’échéance tombe dans les six prochains mois.' },
  // LES TROIS DE LA DIAPOSITIVE 6 : la nature de l'échéance, et la contradiction qui en découle.
  { cle: 'prouvee', libelle: 'Prouvée', aide: 'Un contrat rattaché dans Kimatch porte cette date de fin.' },
  { cle: 'estimee', libelle: 'Estimée', aide: 'Date déclarée par le client, sans contrat pour l’attester.' },
  {
    cle: 'contredit',
    libelle: 'Contredite',
    aide: 'Un contrat en cours contredit la date déclarée de plus d’un mois : les deux sont affichées, on ne tranche pas à la place du client.',
  },
]

export default function Compteurs({ sansEntete }: { sansEntete?: boolean }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filtre, setFiltre] = useState<FiltreEcheance>('tous')
  const [tri, setTri] = useState<TriCompteurs>('date_echeance')
  const [sens, setSens] = useState<'asc' | 'desc'>('asc')
  const [limite, setLimite] = useState(TRANCHE_INITIALE)

  // Chaque lettre relancerait sinon une requête.
  const recherche = useFrappePosee(query)

  // Revenir à la première tranche dès que la liste change de nature : sans cela, une nouvelle
  // recherche redemanderait les 500 lignes chargées pour la précédente.
  useEffect(() => {
    setLimite(TRANCHE_INITIALE)
  }, [recherche, filtre, tri, sens])

  const { perimetre, setPerimetre } = usePerimetre('compteurs')
  const { data: portefeuille } = useMonPortefeuille()
  const liste = useCompteursListe({
    recherche, filtre, tri, sens, limite,
    sites: perimetre === 'moi' ? (portefeuille?.sites ?? []) : null,
  })
  const { data: nombres } = useComptesEcheances()

  // LES CONTRATS SERVENT LA COLONNE « NATURE », PAS LE FILTRE. 1 600 lignes chargées une fois et
  // partagées avec les autres écrans par le cache — sans commune mesure avec les 7 899 compteurs et
  // leurs huit jointures qui avaient gelé l'onglet.
  const { data: contrats } = useContrats()
  const contratsParCompteur = useMemo(() => {
    const m = new Map<string, { date_fin: string | null }[]>()
    for (const ct of contrats ?? []) {
      for (const k of ct.compteurs) m.set(k.id, [...(m.get(k.id) ?? []), { date_fin: ct.date_fin }])
    }
    return m
  }, [contrats])

  const jour = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  function trierPar(cle: string) {
    const k = cle as TriCompteurs
    if (k === tri) setSens((s) => (s === 'asc' ? 'desc' : 'asc'))
    else { setTri(k); setSens('asc') }
  }

  const lignes = liste.data ?? []
  const total = lignes[0]?.total ?? 0

  return (
    <div>
      {!sansEntete && <Topbar title="Compteurs" />}
      <div className={sansEntete ? '' : 'p-4 sm:p-6'}>
        <PageHeader
          title="Compteurs"
          description="Les points de livraison — PDL en électricité, PCE en gaz. C’est le compteur qui porte l’échéance, donc le moment d’agir."
        />

        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          {FILTRES.map((f) => (
            <button
              key={f.cle}
              type="button"
              title={f.aide}
              onClick={() => setFiltre(f.cle)}
              className={cn(
                'rounded-km border px-2.5 py-1.5 text-km-label font-semibold',
                filtre === f.cle
                  ? 'border-ink-800 bg-ink-800 text-white'
                  : 'border-km-line bg-white text-km-muted hover:bg-km-soft',
              )}
            >
              {f.libelle}
              {nombres && (
                <span className={cn('ml-1.5 font-mono', filtre === f.cle ? 'text-white/70' : 'text-km-muted')}>
                  {nombres[f.cle]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-3.5">
          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            placeholder="Rechercher un PDL ou un emplacement…"
            count={total}
          >
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes compteurs"
              libelleTous="Tous les compteurs"
            />
          </ListToolbar>
        </div>

        <Card className="p-2.5">
          <Tableau minWidth={820}>
            <TableauTete>
              <tr>
                <SortableTh label="Point de livraison" sortKey="numero_point" activeKey={tri} dir={sens} onSort={trierPar} />
                <th className="font-medium">Site</th>
                <th className="font-medium">Énergie</th>
                <SortableTh label="Échéance" sortKey="date_echeance" activeKey={tri} dir={sens} onSort={trierPar} />
                <th className="font-medium">Nature</th>
                <SortableTh label="Consommation" sortKey="consommation_annuelle_mwh" activeKey={tri} dir={sens} onSort={trierPar} />
              </tr>
            </TableauTete>
            <TableauCorps>
              {liste.isLoading && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-km-faint">Chargement…</td></tr>
              )}
              {!liste.isLoading && lignes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-km-faint">
                    {recherche.trim()
                      ? 'Aucun compteur ne correspond. Le nom du site n’est pas cherché ici — essayez le numéro de PDL ou l’emplacement.'
                      : 'Aucun compteur dans ce filtre.'}
                  </td>
                </tr>
              )}
              {lignes.map((c) => (
                <LigneTableau
                  key={c.id}
                  compteur={c}
                  echeance={natureEcheance(c.date_echeance, contratsParCompteur.get(c.id) ?? [])}
                  natureConnue={contrats !== undefined}
                  jour={jour}
                  onOuvrir={() => navigate(`/compteurs/${c.id}`)}
                />
              ))}
            </TableauCorps>
          </Tableau>
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

function LigneTableau({
  compteur,
  echeance,
  natureConnue,
  jour,
  onOuvrir,
}: {
  compteur: LigneCompteur
  echeance: EcheanceCompteur
  natureConnue: boolean
  jour: string
  onOuvrir: () => void
}) {
  const gaz = compteur.type_energie === 'gaz'
  const depassee = !!echeance.date && echeance.date < jour
  return (
    <tr onClick={onOuvrir} className="cursor-pointer">
      <td className="font-mono text-xs font-medium text-km-text">
        {compteur.numero_pdl}
        {compteur.localisation_site && (
          <span className="ml-2 font-sans text-km-faint">{compteur.localisation_site}</span>
        )}
      </td>
      <td className="text-km-muted">
        <EntityLink to={`/sites/${compteur.site_id}`}>{compteur.site_nom}</EntityLink>
      </td>
      <td >
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', gaz ? 'text-orange-600' : 'text-amber-600')}>
          {gaz ? <Flame className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
          {gaz ? 'Gaz' : 'Électricité'}
        </span>
      </td>
      <td >
        {echeance.date ? (
          <span className={cn('text-km-text', depassee && 'font-semibold text-km-red')}>
            {new Date(echeance.date + 'T12:00:00').toLocaleDateString('fr-FR')}
            {depassee && <span className="ml-1.5 text-[10px] font-bold uppercase">dépassée</span>}
          </span>
        ) : (
          <span className="text-km-faint">—</span>
        )}
      </td>
      <td >
        {/* Tant que les contrats ne sont pas arrivés, on n'écrit pas « estimée » : ce serait affirmer
            l'absence de preuve avant d'avoir regardé. */}
        {natureConnue ? <BadgeEcheance e={echeance} dense /> : <span className="text-km-faint">…</span>}
      </td>
      <td className="text-km-muted">
        {compteur.consommation_annuelle_mwh != null
          ? `${compteur.consommation_annuelle_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh`
          : <Badge tone="neutral">Non renseignée</Badge>}
      </td>
    </tr>
  )
}
