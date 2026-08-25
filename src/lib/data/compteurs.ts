import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Compteur } from '@/types/domain'
import { fetchComptesVisibles, fetchSitesVisiblesIds, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { nettoyerSaisie } from '@/lib/utils'

interface RawCompteurElec {
  segment: string | null
  tension: string | null
  tarif_distribution: string | null
  conso_base_mwh: number | null
  conso_hp_mwh: number | null
  conso_hc_mwh: number | null
  conso_hpe_mwh: number | null
  conso_hce_mwh: number | null
  conso_hph_mwh: number | null
  conso_hch_mwh: number | null
  conso_pointe_mwh: number | null
  puissance_base_kva: number | null
  puissance_hp_kva: number | null
  puissance_hc_kva: number | null
  puissance_hpe_kva: number | null
  puissance_hce_kva: number | null
  puissance_hph_kva: number | null
  puissance_hch_kva: number | null
  puissance_pointe_kva: number | null
}

interface RawCompteurGaz {
  car_mwh: number | null
  profil_consommation: string | null
  tarif_distribution: string | null
  zone_tarifaire: string | null
}

interface RawCompteur {
  id: string
  site_id: string
  numero_point: string
  libelle: string | null
  actif: boolean
  consommation_annuelle_mwh: number | null
  synchro_eneo: boolean
  date_derniere_synchro_eneo: string | null
  proprietaire_id: string | null
  type_utilisation_compteur_id: string | null
  responsable_contact_id: string | null
  contact_conseil_syndical_id: string | null
  type_energie: { code: string } | null
  type_utilisation: { libelle: string } | null
  site: { nom: string } | null
  responsable_contact: { prenom: string; nom: string } | null
  contact_conseil_syndical: { prenom: string; nom: string } | null
  compteurs_electricite: RawCompteurElec | RawCompteurElec[] | null
  compteurs_gaz: RawCompteurGaz | RawCompteurGaz[] | null
  proprietaire: { prenom: string; nom: string } | null
  date_creation: string
  date_modification: string
  fournisseur_actuel_compte_id: string | null
  fournisseur_actuel: { nom: string } | null
  date_echeance?: string | null
  // Colonnes du 16/08/2026 : optionnelles, comme le reste — le select est en `*`, elles sont
  // simplement absentes tant que la migration n'est pas appliquee.
  adresse?: string | null
  code_postal?: string | null
  ville?: string | null
  localisation_site?: string | null
}

const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

const CONSO_KEYS = ['base', 'hp', 'hc', 'hpe', 'hce', 'hph', 'hch', 'pointe'] as const

function classeMap(elec: RawCompteurElec, prefix: 'conso' | 'puissance', suffix: 'mwh' | 'kva'): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of CONSO_KEYS) {
    const key = `${prefix}_${k}_${suffix}` as keyof RawCompteurElec
    const v = elec[key] as number | null
    if (v != null) out[k.toUpperCase()] = v
  }
  return out
}

/**
 * @param siteIds Ne charger que les compteurs de ces sites. Les compteurs n'ont pas de `compte_id`
 *   direct — on passe par les sites du compte. Évite de tirer les 7884 compteurs pour en afficher
 *   quelques-uns sur une fiche.
 */
async function fetchCompteurs(siteIds?: string[], compteurId?: string): Promise<Compteur[]> {
  try {
    if (siteIds && siteIds.length === 0) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restreindre = (q: any) => (compteurId ? q.eq('id', compteurId) : siteIds ? q.in('site_id', siteIds) : q)
    const data = await fetchAllRows<RawCompteur>(
      'compteurs',
      // `*` plutôt qu'une liste de colonnes fixe : `date_echeance` vient d'être ajoutée par
      // migration et peut ne pas encore exister en prod au moment du déploiement -- un select
      // nommé sur une colonne absente ferait échouer la requête (400) pour TOUS les compteurs.
      '*, type_energie:types_energies(code), type_utilisation:types_utilisations_compteur(libelle), site:sites(nom), compteurs_electricite(*), compteurs_gaz(*), proprietaire:profils!compteurs_proprietaire_id_fkey(prenom, nom), fournisseur_actuel:comptes!compteurs_fournisseur_actuel_compte_id_fkey(nom), responsable_contact:contacts!compteurs_responsable_contact_id_fkey(prenom, nom), contact_conseil_syndical:contacts!compteurs_contact_conseil_syndical_id_fkey(prenom, nom)',
      restreindre,
    )

    const comptesVisibles = await fetchComptesVisibles()
    const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)

    return filterVisibles(data, sitesVisibles, (c) => c.site_id).map((c) => {
      const elec = first(c.compteurs_electricite)
      const gaz = first(c.compteurs_gaz)
      return {
        id: c.id,
        site_id: c.site_id,
        site_nom: c.site?.nom ?? '',
        type_energie: (c.type_energie?.code?.toLowerCase() ?? 'electricite') as 'electricite' | 'gaz',
        numero_pdl: c.numero_point,
        utilisation: c.libelle ?? '',
        type_utilisation_compteur_id: c.type_utilisation_compteur_id,
        type_utilisation_compteur: c.type_utilisation?.libelle ?? null,
        statut: c.actif ? 'actif' : 'inactif',
        consommation_annuelle_mwh: c.consommation_annuelle_mwh,
        adresse: c.adresse ?? null,
        code_postal: c.code_postal ?? null,
        ville: c.ville ?? null,
        localisation_site: c.localisation_site ?? null,
        synchro_eneo: c.synchro_eneo,
        date_derniere_synchro_eneo: c.date_derniere_synchro_eneo,
        proprietaire_id: c.proprietaire_id ?? null,
        proprietaire_nom: c.proprietaire ? `${c.proprietaire.prenom} ${c.proprietaire.nom}` : null,
        date_creation: c.date_creation,
        date_modification: c.date_modification,
        fournisseur_actuel_compte_id: c.fournisseur_actuel_compte_id,
        fournisseur_actuel_nom: c.fournisseur_actuel?.nom ?? null,
        responsable_contact_id: c.responsable_contact_id,
        responsable_contact_nom: c.responsable_contact ? `${c.responsable_contact.prenom} ${c.responsable_contact.nom}` : null,
        contact_conseil_syndical_id: c.contact_conseil_syndical_id,
        contact_conseil_syndical_nom: c.contact_conseil_syndical ? `${c.contact_conseil_syndical.prenom} ${c.contact_conseil_syndical.nom}` : null,
        date_echeance: c.date_echeance ?? null,
        ...(elec
          ? {
              segment: elec.segment,
              tension: elec.tension,
              tarif_distribution: elec.tarif_distribution,
              consoParClasseMwh: classeMap(elec, 'conso', 'mwh'),
              puissanceParClasseKva: classeMap(elec, 'puissance', 'kva'),
            }
          : {}),
        ...(gaz
          ? {
              car_mwh: gaz.car_mwh,
              profil_consommation: gaz.profil_consommation,
              tarif_distribution: gaz.tarif_distribution,
              zone_tarifaire: gaz.zone_tarifaire,
            }
          : {}),
      }
    })
  } catch (error) {
    console.error('fetchCompteurs', error)
    return []
  }
}


/**
 * Un compteur lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useCompteur(compteurId: string | undefined) {
  return useQuery({
    queryKey: ['compteurs', 'un', compteurId],
    queryFn: async () => (await fetchCompteurs(undefined, compteurId as string))[0] ?? null,
    enabled: !!compteurId,
  })
}
export function useCompteurs() {
  return useQuery({ queryKey: ['compteurs'], queryFn: () => fetchCompteurs() })
}

// ══ LA LISTE DES COMPTEURS ══════════════════════════════════════════════════════════════════════
//
// `useCompteurs()` NE CONVIENT PAS À UNE LISTE. Il lit les 7 899 compteurs avec huit relations
// jointes chacun — électricité, gaz, propriétaire, fournisseur, deux contacts, site, type. J'ai
// construit la page /compteurs dessus le 24/08/2026 en écrivant « volumétrie assumée » : à
// l'ouverture, l'ONGLET DU NAVIGATEUR A GELÉ, capture d'écran impossible, moteur de rendu bloqué.
// Ce n'était donc pas de la lenteur à assumer, c'était un défaut.
//
// LA BASE FAIT LE TRAVAIL, SANS MIGRATION. PostgREST sait filtrer, trier, compter et paginer : la
// page ne reçoit que sa tranche, avec six colonnes et une seule jointure. Un `count: exact` rend le
// total sans rapporter de lignes. C'est le même chemin que la liste des sites a pris le 15/08, à
// ceci près qu'elle a eu droit à une fonction SQL — ici tout tient dans la requête, donc rien à
// faire appliquer.

/**
 * LES FILTRES DE LA LISTE DES COMPTEURS.
 *
 * Les trois derniers viennent de la diapositive 6 de Michel — échéance PROUVÉE (« contrat rattaché
 * dans Kiwee »), ESTIMÉE (« date déclarée par le client, sans preuve ») — et de sa conséquence : une
 * date déclarée que le contrat contredit. Ils sont calculés par la vue `v_compteurs_liste`
 * (migration 20260825200000), avec la règle exacte de `echeance.ts`.
 *
 * ET LES TROIS PREMIERS CHANGENT D'ASSIETTE, c'est une correction : ils portaient sur la date
 * DÉCLARÉE, ils portent désormais sur la date RETENUE — celle du contrat quand il y en a un. Un
 * compteur sans date déclarée mais couvert par un contrat en cours n'est pas « sans échéance » : on
 * connaît la sienne, elle vient du contrat. Le décompte passe donc de 591 à 589.
 */
export type FiltreEcheance = 'tous' | 'absente' | 'depassee' | 'six_mois' | 'prouvee' | 'estimee' | 'contredit'
export type TriCompteurs = 'numero_point' | 'date_echeance' | 'consommation_annuelle_mwh'

export interface LigneCompteur {
  id: string
  numero_pdl: string
  site_id: string
  site_nom: string
  type_energie: 'electricite' | 'gaz'
  localisation_site: string | null
  /** La date RETENUE : celle du contrat quand il y en a un, la déclarée sinon. */
  date_echeance: string | null
  /** `compteurs.date_echeance` — ce que le client a déclaré. */
  dateDeclaree: string | null
  /** La fin du contrat en cours, quand il en existe un. */
  datePreuve: string | null
  nature: 'PROUVEE' | 'ESTIMEE' | 'ABSENTE'
  /** Un contrat en cours contredit la date déclarée de plus d'un mois. */
  contredit: boolean
  consommation_annuelle_mwh: number | null
  /** Total de la sélection, rendu par la base — identique sur chaque ligne. */
  total: number
}

/**
 * VRAI QUAND LA VUE N'EXISTE PAS ENCORE EN BASE.
 *
 * Le SQL et l'écran arrivent dans le même dépôt, mais pas au même moment : je rédige la migration,
 * Naoëlle l'applique (ou Michel). Entre les deux, la liste des compteurs interrogerait une vue
 * absente et la page tomberait — une régression en production pour un écran qui marchait.
 *
 * Alors la liste retombe sur la table, sans la nature. Les trois filtres de la diapositive 6 ne
 * rendent alors rien, et l'écran le dit ; tout le reste fonctionne comme avant. Ce repli est du code
 * mort dès la migration appliquée, et c'est très bien : une page blanche coûte plus cher.
 */
function vueAbsente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // 42P01 = undefined_table côté Postgres ; PostgREST rend PGRST205 quand le schéma ne l'expose pas.
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message ?? '').includes('v_compteurs_liste')
  )
}

function jourIso(decalageMois = 0): string {
  const d = new Date()
  if (decalageMois) d.setMonth(d.getMonth() + decalageMois)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useCompteursListe(options: {
  recherche: string
  filtre: FiltreEcheance
  tri: TriCompteurs
  sens: 'asc' | 'desc'
  limite: number
}) {
  const { recherche, filtre, tri, sens, limite } = options
  return useQuery({
    queryKey: ['compteurs', 'liste', recherche, filtre, tri, sens, limite],
    queryFn: async (): Promise<LigneCompteur[]> => {
      const comptesVisibles = await fetchComptesVisibles()
      const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)
      // Périmètre vide : la personne ne voit aucun site, donc aucun compteur. Sans ce court-circuit,
      // un `.in()` sur une liste vide rendrait TOUT.
      if (sitesVisibles !== null && sitesVisibles.length === 0) return []

      // La recherche porte sur le PDL et sur l'emplacement. Le nom du site appartient à une table
      // jointe : PostgREST ne sait pas le chercher dans un `or`, et la liste des sites a eu besoin
      // d'une fonction SQL pour ça. Le champ le dit, plutôt que de chercher à moitié en silence.
      const mots = recherche.trim()

      // LA VUE PORTE LA NATURE, LA TABLE NE LA PORTE PAS. Filtrer « prouvée » côté navigateur
      // demanderait les 7 899 compteurs ET leurs contrats — c'est ce qui a gelé l'onglet le 24/08.
      // Les colonnes sont plates : pas de jointure imbriquée à démêler au retour.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from('v_compteurs_liste')
        .select(
          'id, numero_point, site_id, date_echeance, date_declaree, date_preuve, nature_echeance, contredit, consommation_annuelle_mwh, localisation_site, type_energie_code, site_nom',
          { count: 'exact' },
        )
        .eq('actif', true)

      if (sitesVisibles !== null) q = q.in('site_id', sitesVisibles)

      // Les deux cas de la diapositive 7 — « absentes ou dépassées » — plus ce qui arrive.
      if (filtre === 'absente') q = q.eq('nature_echeance', 'ABSENTE')
      if (filtre === 'depassee') q = q.lt('date_echeance', jourIso())
      if (filtre === 'six_mois') q = q.gte('date_echeance', jourIso()).lte('date_echeance', jourIso(6))
      if (filtre === 'prouvee') q = q.eq('nature_echeance', 'PROUVEE')
      if (filtre === 'estimee') q = q.eq('nature_echeance', 'ESTIMEE')
      if (filtre === 'contredit') q = q.eq('contredit', true)

      if (mots) q = q.or(`numero_point.ilike.%${mots}%,localisation_site.ilike.%${mots}%`)

      // `nullsFirst: false` : un compteur sans échéance n'est pas « le plus urgent », c'est un
      // compteur dont on ne sait rien. Il va en fin de liste, pas en tête.
      q = q.order(tri, { ascending: sens === 'asc', nullsFirst: false }).range(0, Math.max(0, limite - 1))

      let { data, error, count } = await q

      // LE REPLI : la vue n'est pas encore appliquée, on relit la table. Les trois filtres de nature
      // ne rendent rien dans ce cas — c'est le prix d'un écran qui reste debout.
      if (vueAbsente(error)) {
        if (filtre === 'prouvee' || filtre === 'estimee' || filtre === 'contredit') return []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let t: any = supabase
          .from('compteurs')
          .select('id, numero_point, site_id, date_echeance, consommation_annuelle_mwh, localisation_site, types_energies(code), sites(nom)', { count: 'exact' })
          .eq('actif', true)
        if (sitesVisibles !== null) t = t.in('site_id', sitesVisibles)
        if (filtre === 'absente') t = t.is('date_echeance', null)
        if (filtre === 'depassee') t = t.lt('date_echeance', jourIso())
        if (filtre === 'six_mois') t = t.gte('date_echeance', jourIso()).lte('date_echeance', jourIso(6))
        if (mots) t = t.or(`numero_point.ilike.%${mots}%,localisation_site.ilike.%${mots}%`)
        t = t.order(tri, { ascending: sens === 'asc', nullsFirst: false }).range(0, Math.max(0, limite - 1))
        const repli = await t
        if (repli.error) throw new Error(repli.error.message)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data = (repli.data ?? []).map((c: any) => ({
          ...c,
          date_declaree: c.date_echeance,
          date_preuve: null,
          nature_echeance: c.date_echeance ? 'ESTIMEE' : 'ABSENTE',
          contredit: false,
          type_energie_code: Array.isArray(c.types_energies) ? c.types_energies[0]?.code : c.types_energies?.code,
          site_nom: Array.isArray(c.sites) ? c.sites[0]?.nom : c.sites?.nom,
        }))
        count = repli.count
        error = null
      }

      if (error) throw new Error(error.message)

      type Brut = {
        id: string
        numero_point: string
        site_id: string
        date_echeance: string | null
        date_declaree: string | null
        date_preuve: string | null
        nature_echeance: 'PROUVEE' | 'ESTIMEE' | 'ABSENTE'
        contredit: boolean | null
        consommation_annuelle_mwh: number | null
        localisation_site: string | null
        type_energie_code: string | null
        site_nom: string | null
      }

      return ((data ?? []) as Brut[]).map((c) => ({
        id: c.id,
        numero_pdl: c.numero_point,
        site_id: c.site_id,
        site_nom: c.site_nom ?? '',
        type_energie: ((c.type_energie_code ?? 'electricite').toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz',
        localisation_site: c.localisation_site ?? null,
        date_echeance: c.date_echeance ?? null,
        dateDeclaree: c.date_declaree ?? null,
        datePreuve: c.date_preuve ?? null,
        nature: c.nature_echeance,
        contredit: !!c.contredit,
        consommation_annuelle_mwh: c.consommation_annuelle_mwh,
        total: count ?? 0,
      }))
    },
  })
}

/**
 * Les quatre nombres des onglets de filtre, comptés en base et sans rapporter une seule ligne.
 * Mesuré en production le 24/08/2026 : 7 899 compteurs, 588 sans échéance, 3 861 dépassées.
 */
export function useComptesEcheances() {
  return useQuery({
    queryKey: ['compteurs', 'comptes-echeances'],
    queryFn: async () => {
      const tete = () => supabase.from('v_compteurs_liste').select('id', { count: 'exact', head: true }).eq('actif', true)
      const [tous, absente, depassee, sixMois, prouvee, estimee, contredit] = await Promise.all([
        tete(),
        tete().eq('nature_echeance', 'ABSENTE'),
        tete().lt('date_echeance', jourIso()),
        tete().gte('date_echeance', jourIso()).lte('date_echeance', jourIso(6)),
        tete().eq('nature_echeance', 'PROUVEE'),
        tete().eq('nature_echeance', 'ESTIMEE'),
        tete().eq('contredit', true),
      ])

      // MÊME REPLI QUE LA LISTE : sans la vue, on compte sur la table et les trois nouveaux onglets
      // n'affichent pas de nombre plutôt que d'afficher zéro — zéro serait un mensonge.
      if (vueAbsente(tous.error)) {
        const t = () => supabase.from('compteurs').select('id', { count: 'exact', head: true }).eq('actif', true)
        const [a, b, c, d] = await Promise.all([
          t(),
          t().is('date_echeance', null),
          t().lt('date_echeance', jourIso()),
          t().gte('date_echeance', jourIso()).lte('date_echeance', jourIso(6)),
        ])
        return {
          tous: a.count ?? 0,
          absente: b.count ?? 0,
          depassee: c.count ?? 0,
          six_mois: d.count ?? 0,
          prouvee: null,
          estimee: null,
          contredit: null,
        }
      }

      return {
        tous: tous.count ?? 0,
        absente: absente.count ?? 0,
        depassee: depassee.count ?? 0,
        six_mois: sixMois.count ?? 0,
        prouvee: (prouvee.count ?? 0) as number | null,
        estimee: (estimee.count ?? 0) as number | null,
        contredit: (contredit.count ?? 0) as number | null,
      }
    },
  })
}

/** Compteurs des sites donnés -- pour les fiches de détail. */
export function useCompteursParSites(siteIds: string[] | undefined) {
  const cle = [...(siteIds ?? [])].sort()
  return useQuery({
    queryKey: ['compteurs', 'sites', cle],
    queryFn: () => fetchCompteurs(cle),
    enabled: !!siteIds,
  })
}

interface GrdElecData {
  segment?: string | null
  tension?: string | null
  tarif_distribution?: string | null
  consoParClasseMwh?: Record<string, number>
  puissanceParClasseKva?: Record<string, number>
}

interface GrdGazData {
  car_mwh?: number | null
  profil_consommation?: string | null
  tarif_distribution?: string | null
  zone_tarifaire?: string | null
}

interface CreateCompteurInput {
  site_id: string
  site_nom: string
  type_energie_id: string | null
  type_energie: 'electricite' | 'gaz'
  numero_pdl: string
  utilisation: string
  type_utilisation_compteur_id?: string | null
  consommation_annuelle_mwh?: number | null
  date_echeance?: string | null
  fournisseur_actuel_compte_id?: string | null
  fournisseur_actuel_nom?: string | null
  responsable_contact_id?: string | null
  responsable_contact_nom?: string | null
  grdElec?: GrdElecData
  grdGaz?: GrdGazData
  /** true uniquement pour une vraie synchro Enedis/GRDF automatisée -- toujours absent/false pour
   * des caractéristiques techniques saisies à la main (via PdlDraftRows), qui empruntent le même
   * conduit grdElec/grdGaz sans pour autant constituer une synchro réelle. */
  synchroReelle?: boolean
}

/** Dédoublonnage par égalité EXACTE du numéro de PDL (pas de normalisation) -- même règle que
 * Tools. Simple alerte non bloquante, jamais un blocage dur. */
export function findCompteurByNumero(compteurs: Compteur[], numeroPdl: string): Compteur | null {
  const n = numeroPdl.trim()
  if (!n) return null
  return compteurs.find((c) => c.numero_pdl === n) ?? null
}

/** Format PDL (14 chiffres, PRM électricité) ou PCE gaz -- même regex que Tools, mais toujours en
 * alerte visible, jamais en blocage (contrairement au chemin extraction IA de Tools qui bloque dur
 * sur ce même motif).
 * ⚠️ Un PCE gaz fait le plus souvent 14 chiffres lui aussi (vu en réel : PCE 19145151868513), et
 * non « GI + 6 chiffres » comme le laissait entendre l'ancien commentaire — les deux formes sont
 * couvertes par la regex, mais ne pas se fier au préfixe GI pour distinguer gaz et électricité. */
export const PDL_FORMAT_RE = /^(\d{14}|GI\d{6})$/

interface CreateCompteurResult {
  compteur: Compteur
  persisted: boolean
}

export function classeInsertRow(prefix: 'conso' | 'puissance', suffix: 'mwh' | 'kva', values?: Record<string, number>) {
  const row: Record<string, number> = {}
  if (!values) return row
  for (const [code, v] of Object.entries(values)) {
    row[`${prefix}_${code.toLowerCase()}_${suffix}`] = v
  }
  return row
}

export function useCreateCompteur() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCompteurInput): Promise<CreateCompteurResult> => {
      const synchro = input.synchroReelle === true
      const now = synchro ? new Date().toISOString() : null
      let persisted = false
      let compteur: Compteur = {
        id: `local-${Date.now()}`,
        site_id: input.site_id,
        site_nom: input.site_nom,
        type_energie: input.type_energie,
        numero_pdl: input.numero_pdl,
        utilisation: input.utilisation,
        type_utilisation_compteur_id: input.type_utilisation_compteur_id ?? null,
        type_utilisation_compteur: null,
        statut: 'actif',
        consommation_annuelle_mwh: input.consommation_annuelle_mwh ?? null,
        synchro_eneo: synchro,
        date_derniere_synchro_eneo: now,
        proprietaire_id: null,
        date_echeance: input.date_echeance ?? null,
        fournisseur_actuel_compte_id: input.fournisseur_actuel_compte_id ?? null,
        fournisseur_actuel_nom: input.fournisseur_actuel_nom ?? null,
        responsable_contact_id: input.responsable_contact_id ?? null,
        responsable_contact_nom: input.responsable_contact_nom ?? null,
        ...(input.grdElec ? { segment: input.grdElec.segment, tension: input.grdElec.tension, tarif_distribution: input.grdElec.tarif_distribution, consoParClasseMwh: input.grdElec.consoParClasseMwh, puissanceParClasseKva: input.grdElec.puissanceParClasseKva } : {}),
        ...(input.grdGaz ? { car_mwh: input.grdGaz.car_mwh, profil_consommation: input.grdGaz.profil_consommation, tarif_distribution: input.grdGaz.tarif_distribution, zone_tarifaire: input.grdGaz.zone_tarifaire } : {}),
      }

      const { data, error } = await supabase
        .from('compteurs')
        .insert({
          site_id: input.site_id,
          // Nettoye a l'ecriture : un PDL colle depuis Excel embarque des caracteres invisibles
          // qui ressortent en tiret et virgule sur le PDF du mandat (voir nettoyerSaisie).
          numero_point: nettoyerSaisie(input.numero_pdl),
          libelle: input.utilisation,
          actif: true,
          consommation_annuelle_mwh: input.consommation_annuelle_mwh ?? null,
          synchro_eneo: synchro,
          date_derniere_synchro_eneo: now,
          type_utilisation_compteur_id: input.type_utilisation_compteur_id ?? null,
          date_echeance: input.date_echeance ?? null,
          fournisseur_actuel_compte_id: input.fournisseur_actuel_compte_id ?? null,
          responsable_contact_id: input.responsable_contact_id ?? null,
          ...(input.type_energie_id ? { type_energie_id: input.type_energie_id } : {}),
        })
        .select('id')
        .single()

      if (!error && data) {
        const compteurId = (data as { id: string }).id
        compteur = { ...compteur, id: compteurId }
        persisted = true

        if (input.grdElec) {
          await supabase.from('compteurs_electricite').insert({
            compteur_id: compteurId,
            segment: input.grdElec.segment ?? null,
            tension: input.grdElec.tension ?? null,
            tarif_distribution: input.grdElec.tarif_distribution ?? null,
            ...classeInsertRow('conso', 'mwh', input.grdElec.consoParClasseMwh),
            ...classeInsertRow('puissance', 'kva', input.grdElec.puissanceParClasseKva),
          })
        }
        if (input.grdGaz) {
          await supabase.from('compteurs_gaz').insert({
            compteur_id: compteurId,
            car_mwh: input.grdGaz.car_mwh ?? null,
            profil_consommation: input.grdGaz.profil_consommation ?? null,
            tarif_distribution: input.grdGaz.tarif_distribution ?? null,
            zone_tarifaire: input.grdGaz.zone_tarifaire ?? null,
          })
        }
      }

      queryClient.setQueryData<Compteur[]>(['compteurs'], (old) => (old ? [...old, compteur] : [compteur]))
      return { compteur, persisted }
    },
  })
}

export interface UpdateCompteurInput {
  id: string
  utilisation: string
  consommation_annuelle_mwh: number | null
  proprietaire_id: string | null
  type_utilisation_compteur_id?: string | null
}

/** Rattachement PDL depuis la création d'un contact (si rôle Décisionnaire/Conseil syndical) --
 * écrit sur `compteurs.responsable_contact_id` ou `contact_conseil_syndical_id` selon le rôle,
 * les deux colonnes existant déjà et gardées distinctes (voir PDL.Responsable__c /
 * Contact_conseil_syndical__c côté Tools). */
export function useAssignCompteurContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteurIds, contactId, field }: { compteurIds: string[]; contactId: string; field: 'responsable_contact_id' | 'contact_conseil_syndical_id' }) => {
      if (compteurIds.length === 0) return
      const { error } = await supabase.from('compteurs').update({ [field]: contactId }).in('id', compteurIds)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['compteurs'] }) },
  })
}

export function useUpdateCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCompteurInput) => {
      const { error } = await supabase
        .from('compteurs')
        .update({
          libelle: input.utilisation,
          consommation_annuelle_mwh: input.consommation_annuelle_mwh,
          proprietaire_id: input.proprietaire_id,
          ...(input.type_utilisation_compteur_id !== undefined ? { type_utilisation_compteur_id: input.type_utilisation_compteur_id } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['compteurs'] }) },
  })
}

export interface SyncCompteurElecResult {
  segment?: string | null
  tensionLivraison?: string | null
  fta?: string | null
  consoParClasseMwh?: Record<string, number> | null
  puissancesParClasse?: Record<string, number> | null
  consoTotaleMwh?: number | null
  periodeDebut?: string | null
  periodeFin?: string | null
}

export function useSyncCompteurElec() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteurId, result }: { compteurId: string; result: SyncCompteurElecResult }) => {
      const now = new Date().toISOString()

      const { error: eCompteur } = await supabase
        .from('compteurs')
        .update({
          synchro_eneo: true,
          date_derniere_synchro_eneo: now,
          ...(result.consoTotaleMwh != null ? { consommation_annuelle_mwh: result.consoTotaleMwh } : {}),
        })
        .eq('id', compteurId)
      if (eCompteur) throw new Error(eCompteur.message)

      const { error: eElec } = await supabase.from('compteurs_electricite').upsert(
        {
          compteur_id: compteurId,
          segment: result.segment ?? null,
          tension: result.tensionLivraison ?? null,
          tarif_distribution: result.fta ?? null,
          ...classeInsertRow('conso', 'mwh', result.consoParClasseMwh ?? undefined),
          ...classeInsertRow('puissance', 'kva', result.puissancesParClasse ?? undefined),
        },
        { onConflict: 'compteur_id' },
      )
      if (eElec) throw new Error(eElec.message)

      if (result.consoParClasseMwh && result.periodeDebut && result.periodeFin) {
        await supabase.from('consommations').delete().eq('compteur_id', compteurId).eq('source', 'Enedis')
        const rows = Object.entries(result.consoParClasseMwh)
          .filter(([, v]) => v > 0)
          .map(([classe, v]) => ({
            compteur_id: compteurId,
            date_debut_periode: result.periodeDebut as string,
            date_fin_periode: result.periodeFin as string,
            quantite: v,
            unite: 'MWh',
            poste_tarifaire: classe,
            type_valeur: 'MESUREE',
            source: 'Enedis',
            commentaire: null,
          }))
        if (rows.length) {
          const { error: eConso } = await supabase.from('consommations').insert(rows)
          if (eConso) throw new Error(eConso.message)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compteurs'] })
      queryClient.invalidateQueries({ queryKey: ['consommations'] })
    },
  })
}

export interface SyncCompteurGazResult {
  carMwh?: number | null
  profil?: string | null
  tarif?: string | null
}

export function useSyncCompteurGaz() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteurId, result }: { compteurId: string; result: SyncCompteurGazResult }) => {
      const now = new Date().toISOString()

      const { error: eCompteur } = await supabase
        .from('compteurs')
        .update({
          synchro_eneo: true,
          date_derniere_synchro_eneo: now,
          ...(result.carMwh != null ? { consommation_annuelle_mwh: result.carMwh } : {}),
        })
        .eq('id', compteurId)
      if (eCompteur) throw new Error(eCompteur.message)

      const { error: eGaz } = await supabase.from('compteurs_gaz').upsert(
        {
          compteur_id: compteurId,
          car_mwh: result.carMwh ?? null,
          profil_consommation: result.profil ?? null,
          tarif_distribution: result.tarif ?? null,
        },
        { onConflict: 'compteur_id' },
      )
      if (eGaz) throw new Error(eGaz.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compteurs'] })
    },
  })
}

export function useDeleteCompteur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compteurs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['compteurs'] }) },
  })
}

/**
 * Mise à jour d'un champ isolé du compteur, pour l'édition au clic.
 *
 * Sert notamment au contact responsable et au contact du conseil syndical : ils étaient repris de
 * Salesforce (6710 et 435 compteurs) et affichés, mais rien ne permettait de les changer. Un
 * responsable qui quitte son poste restait donc inscrit indéfiniment.
 */
export function useUpdateCompteurField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('compteurs').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['compteurs'] }) },
  })
}
