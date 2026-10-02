import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { enregistrerPrixCompteur, type PrixParCompteur } from '@/lib/data/recommandations'
import { auCentime, budgetElec, budgetGaz, postesAPricer, postesDuCompteur, type BudgetOffre } from '@/lib/pricing/budget'
import { calculerReglementaire, type Reglementaire } from '@/lib/data/reglementaire'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CHIFFRAGE D'UNE VERSION — ce que lit et écrit « Pricing › Mes offres »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « Dans mes offres, on peut trouver à gauche la liste des offres à traiter
 * […] puis dans le volet de droite le tableau à compléter. » Ce module charge UNE version telle que
 * le tableau la montre — sa commande fournisseur par fournisseur, ses offres et ses compteurs — et
 * écrit ce que le pricing y saisit.
 *
 * ══ CE QUI SE SAISIT, CE QUI SE CALCULE ══
 * Le pricing saisit le prix du FOURNISSEUR (P0, abonnement, CEE, CPB / postes, capacité) et la marge.
 * Les communs (TQD, accise, CTA, TURPE) ne se saisissent plus — William, 01/10/2026 : « supprime
 * complètement le concept du bloc communs » ; un calcul sans saisie viendra. Tout le reste — prix
 * présentés, budgets, total de l'offre — se calcule (`pricing/budget.ts`) et s'écrit avec, dans les
 * colonnes que lisent déjà les autres écrans et la vue des montants.
 */

export type EnergieChiffrage = 'gaz' | 'electricite'

export interface CompteurChiffrage {
  /** Le lien version ↔ compteur : c'est sur lui que se rangent les prix. */
  vcId: string
  compteurId: string
  numero: string
  libelle: string
  energie: EnergieChiffrage
  car: number | null
  profil: string | null
  tarif: string | null
  segment: string | null
  conso: Record<string, number>
  fournisseurActuelId: string | null
  fournisseurActuelNom: string | null
  /** Le nom du site, pour reconnaître le compteur d'un coup d'œil. */
  site: string | null
  /** Tout ce qui est réglementé pour ce compteur et cette version — TURPE et AE en électricité ;
   *  TQD, AG, CTA et CPB au gaz — calculé et noté par la base, le même pour toutes les offres. */
  reglementaire: Reglementaire | null
}


export interface CommandeFournisseur {
  id: string
  fournisseurId: string
  nom: string
  modeReponse: string | null
  durees: number[]
  types: string[]
}

/** Ce que porte une offre sur UN compteur — tel que le tableau l'affiche (abonnement au mois). */
export interface SaisieLigne {
  abonnementMois: number | null
  marge: number | null
  /** La marge fixée par le pricing (`marge_retenue_eur_mwh`). Quand le commercial fait un effort,
   *  seule `marge` bouge : l'écart entre les deux EST l'effort, et il se lit sans journal. */
  margePricing?: number | null
  p0: number | null
  cee: number | null
  cpb: number | null
  p0Postes: Record<string, number | null>
  capacite: number | null
}

export interface OffreChiffrage {
  id: string
  optimisationFournisseurId: string | null
  fournisseurId: string
  fournisseurNom: string
  duree: number | null
  type: string | null
  statut: string
  nature: string
  /** Jusqu'à quand le fournisseur tient ses prix — saisie par le pricing, jamais lue dans l'offre. */
  validite: string | null
  clauses: { tacite: boolean; depot: boolean; engagement: boolean; renegociation: boolean; swap: boolean }
  /** Par lien version ↔ compteur. */
  saisies: Record<string, SaisieLigne>
  totalParCompteur: Record<string, number | null>
  /** Le même budget TTC, tel que la base le calcule (TVA 20 % sur tout). */
  ttcParCompteur: Record<string, number | null>
}

export interface VersionChiffrage {
  id: string
  numero: number | null
  nom: string | null
  reference: string | null
  dateSouhaitee: string | null
  statut: string | null
  publieeLe: string | null
  /** Appel d'offres sans offre de référence — le modèle d'offre à générer s'en déduit (`modele_offre`). */
  sansComparatif: boolean
  recommandationId: string
  recommandationNom: string
  compteNom: string | null
  energie: EnergieChiffrage
}

export interface Chiffrage {
  version: VersionChiffrage
  optimisationId: string | null
  compteurs: CompteurChiffrage[]
  commande: CommandeFournisseur[]
  offres: OffreChiffrage[]
  actuelle: OffreChiffrage | null
}

export const SAISIE_VIDE: SaisieLigne = { abonnementMois: null, marge: null, p0: null, cee: null, cpb: null, p0Postes: {}, capacite: null }

/* eslint-disable @typescript-eslint/no-explicit-any */
const premier = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null)
const num = (x: any): number | null => (x == null || x === '' ? null : Number(x))
const CLASSES = ['base', 'hp', 'hc', 'hpe', 'hce', 'hph', 'hch', 'pointe'] as const

function lireSaisie(detail: any, energie: EnergieChiffrage): SaisieLigne {
  const marge = num(detail?.marge_reelle_eur_mwh)
  const margePricing = num(detail?.marge_retenue_eur_mwh) ?? marge
  if (energie === 'gaz') {
    const g = premier(detail?.offres_compteurs_gaz)
    const abo = num(g?.abonnement_fourniture_annuel_ht)
    return { ...SAISIE_VIDE, marge, margePricing, abonnementMois: abo == null ? null : abo / 12, p0: num(g?.prix_molecule_p0_mwh), cee: num(g?.prix_cee_mwh), cpb: num(g?.prix_cpb_mwh) }
  }
  const e = premier(detail?.offres_compteurs_electricite)
  const abo = num(e?.abonnement_fourniture_annuel_ht)
  const p0Postes: Record<string, number | null> = {}
  let capacite: number | null = null
  for (const c of CLASSES) {
    const v = num(e?.[`prix_${c}_p0_mwh`])
    if (v != null) p0Postes[c.toUpperCase()] = v
    const cap = num(e?.[`prix_${c}_capacite_mwh`])
    if (cap != null && capacite == null) capacite = cap
  }
  return { ...SAISIE_VIDE, marge, margePricing, abonnementMois: abo == null ? null : abo / 12, cee: num(e?.prix_cee_mwh), p0Postes, capacite }
}

async function chargerChiffrage(versionId: string): Promise<Chiffrage> {
  const { data: v, error: eV } = await supabase
    .from('versions_recommandation')
    .select('id, numero_version, nom, reference_appel_offres, date_souhaitee, date_publication_comparatif, modele_offre, statut:statuts_versions_recommandation(code), reco:recommandations(id, nom, compte:comptes!recommandations_compte_id_fkey(nom), type_energie:types_energies(code))')
    .eq('id', versionId)
    .single()
  if (eV) throw new Error(eV.message)
  const reco = premier((v as any).reco)
  const energieVersion: EnergieChiffrage = String(premier(reco?.type_energie)?.code ?? '').toUpperCase() === 'GAZ' ? 'gaz' : 'electricite'

  const [{ data: vcs, error: eVc }, { data: opts }] = await Promise.all([
    supabase
      .from('versions_recommandation_compteurs')
      .select('id, compteur_id, actif, compteur:compteurs(id, numero_point, libelle, libelle_site, fournisseur_actuel_compte_id, fournisseur_actuel:comptes!compteurs_fournisseur_actuel_compte_id_fkey(nom), type_energie:types_energies(code), compteurs_gaz(*), compteurs_electricite(*))')
      .eq('version_recommandation_id', versionId)
      .eq('actif', true),
    supabase.from('optimisations').select('id').eq('version_recommandation_id', versionId).order('ordre').limit(1),
  ])
  if (eVc) throw new Error(eVc.message)
  const compteurs: CompteurChiffrage[] = ((vcs ?? []) as any[]).map((r) => {
    const c = premier(r.compteur)
    const g = premier(c?.compteurs_gaz)
    const e = premier(c?.compteurs_electricite)
    const energie: EnergieChiffrage = String(premier(c?.type_energie)?.code ?? '').toUpperCase() === 'GAZ' ? 'gaz' : 'electricite'
    const conso: Record<string, number> = {}
    for (const k of CLASSES) { const x = num(e?.[`conso_${k}_mwh`]); if (x != null && x > 0) conso[k.toUpperCase()] = x }
    return {
      vcId: r.id, compteurId: r.compteur_id, numero: c?.numero_point ?? '', libelle: c?.libelle ?? '', energie,
      car: num(g?.car_mwh), profil: g?.profil_consommation ?? null, tarif: (g?.tarif_distribution ?? e?.tarif_distribution) ?? null, segment: e?.segment ?? null, conso,
      fournisseurActuelId: c?.fournisseur_actuel_compte_id ?? null, fournisseurActuelNom: premier(c?.fournisseur_actuel)?.nom ?? null,
      site: c?.libelle_site ?? null,
      reglementaire: null,
    }
  })

  /* ══ LE RÉGLEMENTÉ, DEMANDÉ À LA BASE POUR CHAQUE COMPTEUR (02/10/2026) ══
     William : « on doit pouvoir appeler la base à tout moment pour permettre de calculer les
     budgets ». La base prend TURPE, AE, AG, TQD et CTA au jour de l'envoi (publication du
     comparatif, ou aujourd'hui), le CPB sur les années de fourniture ; elle les note sur le compteur
     de la version et les reporte sur les lignes déjà chiffrées. Le Pricer les ajoute à chaque budget
     sans en faire une colonne. */
  await Promise.all(compteurs.map(async (c) => {
    try {
      c.reglementaire = await calculerReglementaire(c.vcId)
    } catch (e) {
      c.reglementaire = { dateEnvoi: null, envoiFige: false, dateReference: null, sourceDate: null, accise: null, tqd: null, cta: null, ctaTaux: null, cpb: {}, turpe: null, derniereValeurConnue: [], manques: [`Calcul impossible : ${(e as Error).message}`] }
    }
  }))

  const optimisationId = ((opts ?? []) as { id: string }[])[0]?.id ?? null
  let commande: CommandeFournisseur[] = []
  let offres: OffreChiffrage[] = []
  let actuelle: OffreChiffrage | null = null
  if (optimisationId) {
    const [{ data: ofs }, { data: lignesOffres, error: eO }] = await Promise.all([
      supabase.from('optimisations_fournisseurs').select('id, fournisseur_compte_id, durees_mois, types_prix, date_creation, fournisseur:comptes(nom)').eq('optimisation_id', optimisationId).order('date_creation'),
      supabase
        .from('offres_fournisseurs')
        .select('id, optimisation_fournisseur_id, compte_fournisseur_id, duree_mois, type_prix, statut, nature_offre, actif, date_validite, fiche:comptes_fournisseurs(compte:comptes(nom)), clause_tacite_reconduction, clause_depot_garantie, clause_engagement_consommation, clause_renegociation_anticipee, clause_swap, details:offres_fournisseurs_compteurs(id, version_recommandation_compteur_id, marge_reelle_eur_mwh, marge_retenue_eur_mwh, cout_total_annuel_estime_ht, cout_total_annuel_estime_ttc, offres_compteurs_gaz(*), offres_compteurs_electricite(*))')
        .eq('optimisation_id', optimisationId)
        .eq('actif', true),
    ])
    if (eO) throw new Error(eO.message)
    const idsFournisseurs = ((ofs ?? []) as any[]).map((f) => f.fournisseur_compte_id)
    const { data: fiches } = idsFournisseurs.length
      ? await supabase.from('comptes_fournisseurs').select('compte_id, mode_reponse').in('compte_id', idsFournisseurs)
      : { data: [] as any[] }
    const modes = new Map(((fiches ?? []) as any[]).map((f) => [f.compte_id, f.mode_reponse ?? null]))
    commande = ((ofs ?? []) as any[]).map((f) => ({
      id: f.id, fournisseurId: f.fournisseur_compte_id, nom: premier(f.fournisseur)?.nom ?? 'Fournisseur', modeReponse: modes.get(f.fournisseur_compte_id) ?? null,
      durees: [...(f.durees_mois ?? [])].sort((a: number, b: number) => a - b), types: f.types_prix ?? [],
    }))
    const lire = (o: any): OffreChiffrage => {
      const saisies: Record<string, SaisieLigne> = {}
      const totalParCompteur: Record<string, number | null> = {}
      const ttcParCompteur: Record<string, number | null> = {}
      for (const d of (o.details ?? []) as any[]) {
        const cpt = compteurs.find((c) => c.vcId === d.version_recommandation_compteur_id)
        saisies[d.version_recommandation_compteur_id] = lireSaisie(d, cpt?.energie ?? energieVersion)
        totalParCompteur[d.version_recommandation_compteur_id] = num(d.cout_total_annuel_estime_ht)
        ttcParCompteur[d.version_recommandation_compteur_id] = num(d.cout_total_annuel_estime_ttc)
      }
      return {
        id: o.id, optimisationFournisseurId: o.optimisation_fournisseur_id, fournisseurId: o.compte_fournisseur_id,
        fournisseurNom: premier(premier(o.fiche)?.compte)?.nom ?? 'Fournisseur', duree: o.duree_mois, type: o.type_prix,
        statut: o.statut, nature: o.nature_offre, validite: o.date_validite ?? null, saisies, totalParCompteur, ttcParCompteur,
        clauses: { tacite: !!o.clause_tacite_reconduction, depot: !!o.clause_depot_garantie, engagement: !!o.clause_engagement_consommation, renegociation: !!o.clause_renegociation_anticipee, swap: !!o.clause_swap },
      }
    }
    const toutes = ((lignesOffres ?? []) as any[]).map(lire)
    const ordreFournisseur = new Map(commande.map((f, i) => [f.id, i]))
    offres = toutes
      .filter((o) => o.nature === 'PROPOSEE')
      .sort((a, b) => (ordreFournisseur.get(a.optimisationFournisseurId ?? '') ?? 99) - (ordreFournisseur.get(b.optimisationFournisseurId ?? '') ?? 99)
        || (a.type ?? '').localeCompare(b.type ?? '') || (a.duree ?? 0) - (b.duree ?? 0))
    actuelle = toutes.find((o) => o.nature === 'EN_COURS') ?? null
  }

  return {
    version: {
      id: (v as any).id, numero: (v as any).numero_version, nom: (v as any).nom, reference: (v as any).reference_appel_offres ?? null,
      dateSouhaitee: (v as any).date_souhaitee, statut: premier((v as any).statut)?.code ?? null, publieeLe: (v as any).date_publication_comparatif ?? null, sansComparatif: (v as any).modele_offre === 'SANS_COMPARATIF',
      recommandationId: reco?.id, recommandationNom: reco?.nom ?? '', compteNom: premier(reco?.compte)?.nom ?? null, energie: energieVersion,
    },
    optimisationId, compteurs, commande, offres, actuelle,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useChiffrage(versionId: string | null) {
  return useQuery({ queryKey: ['chiffrage', versionId], enabled: !!versionId, queryFn: () => chargerChiffrage(versionId as string) })
}

/** Le budget d'une saisie sur un compteur, selon son énergie. */
/**
 * Le budget d'une saisie sur un compteur, selon son énergie, avec ce que la base a retenu de
 * réglementé. Au gaz, le CPB dépend de la DURÉE de l'offre (moyenne des années couvertes) ; une offre
 * sans durée — l'offre actuelle — compte sur un an, comme la base.
 */
export function budgetLigne(compteur: CompteurChiffrage, s: SaisieLigne, dureeMois?: number | null): BudgetOffre | null {
  const r = compteur.reglementaire
  if (compteur.energie === 'gaz') {
    const cpb = r?.cpb[String(dureeMois ?? 12)] ?? null
    return budgetGaz({ car: compteur.car, tqd: r?.tqd ?? null, accise: r?.accise ?? null, cta: r?.cta ?? null, cpb }, { ...s, cpb: null })
  }
  return budgetElec({ conso: compteur.conso, turpe: r?.turpe?.total ?? null, accise: r?.accise ?? null, cta: r?.cta ?? null },
    { abonnementMois: s.abonnementMois, p0: s.p0Postes, marge: s.marge, capacite: s.capacite, cee: s.cee })
}

/** Une saisie est complète quand chaque champ propre à l'offre est rempli. */
export function saisieComplete(compteur: CompteurChiffrage, s: SaisieLigne | undefined): boolean {
  if (!s) return false
  const ok = (x: number | null | undefined) => x != null && Number.isFinite(x)
  if (compteur.energie === 'gaz') return [s.abonnementMois, s.marge, s.p0, s.cee].every(ok)
  return [s.abonnementMois, s.marge, s.capacite, s.cee].every(ok) && postesAPricer(compteur.conso).every((p) => ok(s.p0Postes[p]))
}

/**
 * Ce qu'on écrit pour une ligne offre × compteur : la saisie et ce qui s'en calcule. Les totaux ne
 * s'écrivent qu'une fois la ligne COMPLÈTE : un budget partiel se voit dans le tableau, il ne doit
 * jamais passer pour le prix de l'offre aux yeux des autres écrans.
 */
function versPrix(compteur: CompteurChiffrage, s: SaisieLigne, typePrix: string | null, dureeMois: number | null): PrixParCompteur {
  const calcule = budgetLigne(compteur, s, dureeMois)
  const b = calcule?.complet ? calcule : null
  const r = compteur.reglementaire
  /* L'annuel est au centime : le mois n'en est que l'affichage (4 487,96 / 12 × 12 = 4 487,96). */
  const abonnementAn = s.abonnementMois == null ? null : auCentime(s.abonnementMois * 12)
  /* Le budget complet se range en trois parts, comme la base les reporte : la fourniture (saisie),
     l'acheminement et les taxes (réglementés). */
  const commun = {
    marge_reelle_eur_mwh: s.marge, marge_retenue_eur_mwh: s.margePricing ?? s.marge, type_marge: 'VARIABLE' as const, type_prix: typePrix,
    abonnement_fourniture_annuel_ht: abonnementAn, prix_cee_mwh: s.cee,
    cout_fourniture_annuel_ht: b ? auCentime(b.abonnement + b.energie) : null,
    cout_acheminement_annuel_ht: b ? b.acheminement : null,
    cout_taxes_annuel: b ? b.taxes : null,
    cout_total_annuel_estime_ht: b?.total ?? null,
  }
  if (compteur.energie === 'gaz') {
    return {
      ...commun,
      consommation_annuelle_reference_mwh: compteur.car, car_reference_mwh: compteur.car,
      prix_molecule_p0_mwh: s.p0, prix_energie_mwh: s.p0 != null && s.marge != null ? s.p0 + s.marge : null,
      prix_cpb_mwh: r?.cpb[String(dureeMois ?? 12)] ?? null,
      prix_atrd_mwh: r?.tqd ?? null, prix_agn_mwh: r?.accise ?? null, cta_annuel_ht: r?.cta ?? null,
    }
  }
  const postes = postesDuCompteur(compteur.conso)
  const consoTotale = postes.reduce((t, p) => t + (compteur.conso[p] ?? 0), 0)
  const p0: Record<string, number | null> = {}
  const presentes: Record<string, number | null> = {}
  const capacite: Record<string, number | null> = {}
  for (const p of postes) {
    const x = s.p0Postes[p] ?? null
    p0[p] = x
    presentes[p] = x != null && s.marge != null ? x + s.marge : null
    capacite[p] = s.capacite
  }
  return {
    ...commun,
    consommation_annuelle_reference_mwh: consoTotale || null,
    p0_mwh_par_classe: p0, prix_mwh_par_classe: presentes, capacite_mwh_par_classe: capacite,
    /* LE TURPE ET L'ACCISE DE LA BASE, les mêmes sur toutes les offres du compteur : notés sur
       chaque ligne, comptés dans le total, jamais affichés en colonne. */
    prix_turpe_annuel_ht: r?.turpe?.total ?? null,
    turpe_gestion_annuel_ht: r?.turpe?.detail.cg ?? null,
    turpe_comptage_annuel_ht: r?.turpe?.detail.cc ?? null,
    turpe_soutirage_fixe_annuel_ht: r?.turpe?.detail.csFixe ?? null,
    turpe_soutirage_variable_annuel_ht: r?.turpe?.detail.csVariable ?? null,
    accise_annuel_ht: r?.accise != null ? auCentime(consoTotale * r.accise) : null,
    /* LA CTA ÉLECTRICITÉ : l'assiette × (gestion + comptage + soutirage fixe), calculée en base. */
    cta_annuel_ht: r?.cta ?? null,
  }
}

export function useChiffrageMutations(versionId: string | null) {
  const qc = useQueryClient()
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ['chiffrage', versionId] })
    void qc.invalidateQueries({ queryKey: ['pricing'] })
    void qc.invalidateQueries({ queryKey: ['recommandations'] })
  }

  const enregistrerLigne = useMutation({
    mutationFn: async (x: { offre: OffreChiffrage; compteur: CompteurChiffrage; saisie: SaisieLigne; effortCommercial?: boolean }) => {
      /* LE PRICING FIXE LA MARGE, LE COMMERCIAL L'AJUSTE. Une saisie du pricing pose les deux ;
         l'effort du commercial ne déplace que la marge appliquée, la marge du pricing reste. */
      const saisie = x.effortCommercial ? x.saisie : { ...x.saisie, margePricing: x.saisie.marge }
      await enregistrerPrixCompteur({ offreId: x.offre.id, versionCompteurId: x.compteur.vcId, energie: x.compteur.energie, prix: versPrix(x.compteur, saisie, x.offre.type, x.offre.duree) })
    },
    onSuccess: rafraichir,
  })

  const changerStatut = useMutation({
    mutationFn: async (x: { offreId: string; statut: 'EN_ATTENTE' | 'DISPONIBLE' | 'INDISPONIBLE' }) => {
      const { error } = await supabase.from('offres_fournisseurs').update({ statut: x.statut, date_modification: new Date().toISOString() }).eq('id', x.offreId)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  /** La validité d'une offre — William, 02/10/2026 : « doit être éditée par le pricing ». */
  const majValidite = useMutation({
    mutationFn: async (x: { offreId: string; validite: string | null }) => {
      const { error } = await supabase.from('offres_fournisseurs').update({ date_validite: x.validite, date_modification: new Date().toISOString() }).eq('id', x.offreId)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  /** Les clauses d'une offre, posées par le pricing — lues dans l'onglet Clauses du commercial. */
  const majClauses = useMutation({
    mutationFn: async (x: { offreId: string; clauses: OffreChiffrage['clauses'] }) => {
      const { error } = await supabase.from('offres_fournisseurs').update({
        clause_tacite_reconduction: x.clauses.tacite, clause_depot_garantie: x.clauses.depot,
        clause_engagement_consommation: x.clauses.engagement, clause_renegociation_anticipee: x.clauses.renegociation,
        clause_swap: x.clauses.swap, date_modification: new Date().toISOString(),
      }).eq('id', x.offreId)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  const majCommande = useMutation({
    mutationFn: async (x: { id: string; durees: number[]; types: string[] }) => {
      const { error } = await supabase.from('optimisations_fournisseurs').update({ durees_mois: x.durees, types_prix: x.types }).eq('id', x.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  /** L'offre actuelle : trouvée ou créée en base (`fn_offre_actuelle`), puis chiffrée comme une autre. */
  const enregistrerActuelle = useMutation({
    mutationFn: async (x: { fournisseurId: string; duree: number | null; compteur: CompteurChiffrage; saisie: SaisieLigne }) => {
      const { data, error } = await supabase.rpc('fn_offre_actuelle', { p_version: versionId, p_fournisseur: x.fournisseurId, p_duree: x.duree })
      if (error) throw new Error(error.message)
      await enregistrerPrixCompteur({ offreId: data as string, versionCompteurId: x.compteur.vcId, energie: x.compteur.energie, prix: versPrix(x.compteur, x.saisie, 'Fixe', x.duree) })
    },
    onSuccess: rafraichir,
  })

  /** Avec ou sans offre de référence : la retirer la désactive, la rétablir la réactive (`fn_definir_modele_offre`). */
  const definirComparatif = useMutation({
    mutationFn: async (sansComparatif: boolean) => {
      const { error } = await supabase.rpc('fn_definir_modele_offre', { p_version: versionId, p_sans_comparatif: sansComparatif })
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  const publier = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('fn_publier_comparatif', { p_version: versionId })
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  return { enregistrerLigne, changerStatut, majClauses, majValidite, majCommande, enregistrerActuelle, definirComparatif, publier }
}
