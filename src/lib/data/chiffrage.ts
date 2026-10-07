import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
 * Depuis le 06/10/2026, les cases P0 se saisissent MARGE INCLUSE ; ce qui s'écrit reste le P0 hors
 * marge, la marge à côté (`pricing/brouillon.ts`).
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
  /** Le code postal du compteur (à défaut celui du site) — GRDF le demande pour synchroniser. */
  codePostal: string | null
  /** Le compteur n'a pas de poste Pointe (`compteurs_electricite.sans_pointe`, 06/10/2026). */
  sansPointe: boolean
  /** Tout ce qui est réglementé pour ce compteur et cette version — TURPE et AE en électricité ;
   *  TQD, AG, CTA et CPB au gaz — calculé et noté par la base, le même pour toutes les offres. */
  reglementaire: Reglementaire | null
}


export interface CommandeFournisseur {
  id: string
  fournisseurId: string
  nom: string
  modeReponse: string | null
  /** Au mode TRADEO : vrai si les prix reviennent par l'API (`tradeo_prix_automatiques`), faux par document. */
  prixAutomatiques?: boolean
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
  /** Ce que le P0 saisi comprend déjà (`p0_inclut`) : CEE, TQD, CPB, ACCISE ; CAPACITE en électricité. */
  inclus: string[]
}

export interface OffreChiffrage {
  id: string
  optimisationFournisseurId: string | null
  fournisseurId: string
  fournisseurNom: string
  /** Le logo déposé sur la fiche du fournisseur, quand il y en a un (05/10/2026). */
  fournisseurLogo?: string | null
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
  /** « Syndic professionnel », « Entreprise »… — décide de HTVA ou TTC par défaut (05/10/2026). */
  compteSegment?: string | null
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

export const SAISIE_VIDE: SaisieLigne = { abonnementMois: null, marge: null, p0: null, cee: null, cpb: null, p0Postes: {}, capacite: null, inclus: [] }

/* eslint-disable @typescript-eslint/no-explicit-any */
const premier = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null)
const num = (x: any): number | null => (x == null || x === '' ? null : Number(x))
const CLASSES = ['base', 'hp', 'hc', 'hpe', 'hce', 'hph', 'hch', 'pointe'] as const

function lireSaisie(detail: any, energie: EnergieChiffrage): SaisieLigne {
  const marge = num(detail?.marge_reelle_eur_mwh)
  const margePricing = num(detail?.marge_retenue_eur_mwh) ?? marge
  const inclus: string[] = Array.isArray(detail?.p0_inclut) ? detail.p0_inclut : []
  if (energie === 'gaz') {
    const g = premier(detail?.offres_compteurs_gaz)
    const abo = num(g?.abonnement_fourniture_annuel_ht)
    return { ...SAISIE_VIDE, marge, margePricing, inclus, abonnementMois: abo == null ? null : abo / 12, p0: num(g?.prix_molecule_p0_mwh), cee: num(g?.prix_cee_mwh), cpb: num(g?.prix_cpb_mwh) }
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
  return { ...SAISIE_VIDE, marge, margePricing, inclus, abonnementMois: abo == null ? null : abo / 12, cee: num(e?.prix_cee_mwh), p0Postes, capacite }
}

/**
 * ══ LE RÉGLEMENTÉ, GARDÉ EN MÉMOIRE — 07/10/2026 ══
 * « Fluidité et réactivité maximales. » Le tableau se relit après chaque case enregistrée ; il
 * relançait à chaque fois le calcul du réglementé de chaque compteur (un appel en base, ~50 ms côté
 * serveur, plus l'aller-retour) alors que TURPE, accise, TQD, CTA et CPB ne bougent pas d'une case à
 * l'autre. Le résultat se garde 10 minutes par compteur de version ; la publication l'oublie (elle
 * fige la date d'envoi).
 */
const DUREE_REGLEMENTAIRE_MS = 10 * 60 * 1000
const reglementaireEnMemoire = new Map<string, { quand: number; valeur: Reglementaire }>()
export function oublierReglementaire(vcIds?: string[]) {
  if (!vcIds) reglementaireEnMemoire.clear()
  else for (const id of vcIds) reglementaireEnMemoire.delete(id)
}

async function chargerChiffrage(versionId: string): Promise<Chiffrage> {
  /* PREMIÈRE VAGUE, EN PARALLÈLE : la version, ses compteurs, son optimisation. */
  const [{ data: v, error: eV }, { data: vcs, error: eVc }, { data: opts }] = await Promise.all([
    supabase
    .from('versions_recommandation')
    .select('id, numero_version, nom, reference_appel_offres, date_souhaitee, date_publication_comparatif, modele_offre, statut:statuts_versions_recommandation(code), reco:recommandations(id, nom, compte:comptes!recommandations_compte_id_fkey(nom, segment), type_energie:types_energies(code))')
    .eq('id', versionId)
    .single(),
    supabase
      .from('versions_recommandation_compteurs')
      .select('id, compteur_id, actif, compteur:compteurs(id, numero_point, libelle, libelle_site, code_postal, site:sites!compteurs_site_id_fkey(code_postal), fournisseur_actuel_compte_id, fournisseur_actuel:comptes!compteurs_fournisseur_actuel_compte_id_fkey(nom), type_energie:types_energies(code), compteurs_gaz(*), compteurs_electricite(*))')
      .eq('version_recommandation_id', versionId)
      .eq('actif', true),
    supabase.from('optimisations').select('id').eq('version_recommandation_id', versionId).order('ordre').limit(1),
  ])
  if (eV) throw new Error(eV.message)
  if (eVc) throw new Error(eVc.message)
  const reco = premier((v as any).reco)
  const energieVersion: EnergieChiffrage = String(premier(reco?.type_energie)?.code ?? '').toUpperCase() === 'GAZ' ? 'gaz' : 'electricite'
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
      codePostal: c?.code_postal ?? premier(c?.site)?.code_postal ?? null,
      sansPointe: !!e?.sans_pointe,
      reglementaire: null,
    }
  })

  /* ══ LE RÉGLEMENTÉ, DEMANDÉ À LA BASE POUR CHAQUE COMPTEUR (02/10/2026) ══
     William : « on doit pouvoir appeler la base à tout moment pour permettre de calculer les
     budgets ». La base prend TURPE, AE, AG, TQD et CTA au jour de l'envoi (publication du
     comparatif, ou aujourd'hui), le CPB sur les années de fourniture ; elle les note sur le compteur
     de la version et les reporte sur les lignes déjà chiffrées. Le Pricer les ajoute à chaque budget
     sans en faire une colonne. Gardé en mémoire (voir `reglementaireEnMemoire`). */
  const maintenant = Date.now()
  const aCalculer = compteurs.filter((c) => !(reglementaireEnMemoire.get(c.vcId) && maintenant - reglementaireEnMemoire.get(c.vcId)!.quand < DUREE_REGLEMENTAIRE_MS))
  const reglementer = () => Promise.all(compteurs.map(async (c) => {
    const garde = reglementaireEnMemoire.get(c.vcId)
    if (garde && maintenant - garde.quand < DUREE_REGLEMENTAIRE_MS) { c.reglementaire = garde.valeur; return }
    try {
      c.reglementaire = await calculerReglementaire(c.vcId)
      reglementaireEnMemoire.set(c.vcId, { quand: Date.now(), valeur: c.reglementaire })
    } catch (e) {
      c.reglementaire = { dateEnvoi: null, envoiFige: false, dateReference: null, echeance: null, sourceDate: null, accise: null, tqd: null, cta: null, ctaTaux: null, cpb: {}, turpe: null, derniereValeurConnue: [], manques: [`Calcul impossible : ${(e as Error).message}`] }
    }
  }))

  const optimisationId = ((opts ?? []) as { id: string }[])[0]?.id ?? null
  let commande: CommandeFournisseur[] = []
  let offres: OffreChiffrage[] = []
  let actuelle: OffreChiffrage | null = null
  /* LA COMMANDE ET LES OFFRES, en une vague (la fiche fournisseur vient avec la commande). Quand le
     réglementé doit être recalculé, il passe d'abord : la base reporte ses montants sur les lignes
     chiffrées, qu'on lit juste après. Sinon tout part en même temps. */
  const lireOffres = () => optimisationId ? Promise.all([
    supabase.from('optimisations_fournisseurs').select('id, fournisseur_compte_id, durees_mois, types_prix, date_creation, fournisseur:comptes(nom, comptes_fournisseurs(mode_reponse, tradeo_prix_automatiques))').eq('optimisation_id', optimisationId).order('date_creation'),
    supabase
      .from('offres_fournisseurs')
      .select('id, optimisation_fournisseur_id, compte_fournisseur_id, duree_mois, type_prix, statut, nature_offre, actif, date_validite, fiche:comptes_fournisseurs(logo_url, compte:comptes(nom)), clause_tacite_reconduction, clause_depot_garantie, clause_engagement_consommation, clause_renegociation_anticipee, clause_swap, details:offres_fournisseurs_compteurs(id, version_recommandation_compteur_id, p0_inclut, marge_reelle_eur_mwh, marge_retenue_eur_mwh, cout_total_annuel_estime_ht, cout_total_annuel_estime_ttc, offres_compteurs_gaz(*), offres_compteurs_electricite(*))')
      .eq('optimisation_id', optimisationId)
      .eq('actif', true),
  ]) : Promise.resolve(null)
  let lues: Awaited<ReturnType<typeof lireOffres>>
  if (aCalculer.length > 0) { await reglementer(); lues = await lireOffres() }
  else { [, lues] = await Promise.all([reglementer(), lireOffres()]) }

  if (optimisationId && lues) {
    const [{ data: ofs }, { data: lignesOffres, error: eO }] = lues
    if (eO) throw new Error(eO.message)
    commande = ((ofs ?? []) as any[]).map((f) => {
      const fiche = premier(premier(f.fournisseur)?.comptes_fournisseurs)
      return {
        id: f.id, fournisseurId: f.fournisseur_compte_id, nom: premier(f.fournisseur)?.nom ?? 'Fournisseur', modeReponse: fiche?.mode_reponse ?? null, prixAutomatiques: fiche?.tradeo_prix_automatiques !== false,
        durees: [...(f.durees_mois ?? [])].sort((a: number, b: number) => a - b), types: f.types_prix ?? [],
      }
    })
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
        fournisseurNom: premier(premier(o.fiche)?.compte)?.nom ?? 'Fournisseur', fournisseurLogo: premier(o.fiche)?.logo_url ?? null, duree: o.duree_mois, type: o.type_prix,
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
      recommandationId: reco?.id, recommandationNom: reco?.nom ?? '', compteNom: premier(reco?.compte)?.nom ?? null, compteSegment: premier(reco?.compte)?.segment ?? null, energie: energieVersion,
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
    return budgetGaz({ car: compteur.car, tqd: r?.tqd ?? null, accise: r?.accise ?? null, cta: r?.cta ?? null, cpb }, { ...s, cpb: null, inclus: s.inclus })
  }
  return budgetElec({ conso: compteur.conso, turpe: r?.turpe?.total ?? null, accise: r?.accise ?? null, cta: r?.cta ?? null },
    { abonnementMois: s.abonnementMois, p0: s.p0Postes, marge: s.marge, capacite: s.capacite, cee: s.cee, inclus: s.inclus })
}

/**
 * ══ LES POSTES QUE LE PRICER MONTRE — William, 06/10/2026 ══
 * « La colonne Pointe n'est pas obligatoire, certains compteurs n'en ont pas. Dans ce cas, ajouter
 * la possibilité de supprimer la colonne. » Un compteur marqué sans pointe perd la colonne — sauf
 * s'il consomme en pointe : là, elle compte dans le budget et revient d'elle-même.
 */
export const pointeRetirable = (compteur: CompteurChiffrage) => compteur.energie !== 'gaz' && !((compteur.conso.POINTE ?? 0) > 0)
export function postesAffiches(compteur: CompteurChiffrage): string[] {
  const postes = postesDuCompteur(compteur.conso)
  return compteur.sansPointe && pointeRetirable(compteur) ? postes.filter((p) => p !== 'POINTE') : postes
}

/** Une saisie est complète quand chaque champ propre à l'offre est rempli. */
export function saisieComplete(compteur: CompteurChiffrage, s: SaisieLigne | undefined): boolean {
  if (!s) return false
  const ok = (x: number | null | undefined) => x != null && Number.isFinite(x)
  /* Une case incluse dans le P0 n'est plus due. */
  const due = (k: string, x: number | null | undefined) => (s.inclus ?? []).includes(k) || ok(x)
  if (compteur.energie === 'gaz') return [s.abonnementMois, s.marge, s.p0].every(ok) && due('CEE', s.cee)
  return [s.abonnementMois, s.marge].every(ok) && due('CAPACITE', s.capacite) && due('CEE', s.cee) && postesAPricer(compteur.conso).filter((p) => postesAffiches(compteur).includes(p)).every((p) => ok(s.p0Postes[p]))
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
    abonnement_fourniture_annuel_ht: abonnementAn, prix_cee_mwh: s.cee, p0_inclut: s.inclus ?? [],
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

/** Les prix d'une offre au moment où on l'a barrée, pour les lui rendre si on la rouvre. */
const prixBarres = new Map<string, Record<string, SaisieLigne>>()

/** Vrai tant que la bascule « non proposée » de cette offre part en base. */
export function useBasculeEnCours(offreId: string): boolean {
  return useIsMutating({ mutationKey: ['non-proposee'], predicate: (mu) => (mu.state.variables as { offre?: { id: string } } | undefined)?.offre?.id === offreId }) > 0
}

export function useChiffrageMutations(versionId: string | null) {
  const qc = useQueryClient()
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ['chiffrage', versionId] })
    void qc.invalidateQueries({ queryKey: ['pricing'] })
    void qc.invalidateQueries({ queryKey: ['recommandations'] })
  }
  /* UNE CASE, UNE CLAUSE : seul le tableau se relit (07/10/2026) — la liste des dossiers et les
     recommandations ne changent pas pour un prix saisi ; leur état suit les changements de statut. */
  const relireTableau = () => { void qc.invalidateQueries({ queryKey: ['chiffrage', versionId] }) }

  const enregistrerLigne = useMutation({
    mutationFn: async (x: { offre: OffreChiffrage; compteur: CompteurChiffrage; saisie: SaisieLigne; effortCommercial?: boolean }): Promise<{ statutChange: boolean }> => {
      /* LE PRICING FIXE LA MARGE, LE COMMERCIAL L'AJUSTE. Une saisie du pricing pose les deux ;
         l'effort du commercial ne déplace que la marge appliquée, la marge du pricing reste. */
      const saisie = x.effortCommercial ? x.saisie : { ...x.saisie, margePricing: x.saisie.marge }
      /* ══ LA LIGNE SE VALIDE AVEC SON PRIX, DANS LE MÊME ENREGISTREMENT — William, 07/10/2026 ══
         « Parfois on renseigne tous les prix mais ça reste à 0/1 et 0/2. » Le passage en « chiffrée »
         attendait que le tableau se relise, puis qu'un effet de la ligne le demande à part : le
         journal montre deux offres complètes à 16 h 06 et 16 h 07, passées disponibles à 16 h 12
         seulement, au rechargement. Le statut se décide maintenant ici, sur la même règle
         (`saisieComplete` sur tous les compteurs de la version), et s'écrit juste après le prix ; le
         tableau le montre aussitôt. L'effet de la ligne reste en filet. Une offre que le fournisseur
         ne propose pas n'est jamais touchée, ni l'effort du commercial (sa marge seule bouge). */
      /* Une relecture partie avant cette case rapporterait l'état d'avant : elle s'arrête. */
      await qc.cancelQueries({ queryKey: ['chiffrage', versionId] })
      const ch = qc.getQueryData<Chiffrage>(['chiffrage', versionId])
      const enCache = ch?.offres.find((o) => o.id === x.offre.id) ?? x.offre
      const saisies = { ...enCache.saisies, [x.compteur.vcId]: saisie }
      const complete = (ch?.compteurs ?? [x.compteur]).every((c) => saisieComplete(c, saisies[c.vcId]))
      const cible = complete ? 'DISPONIBLE' : 'EN_ATTENTE'
      const changer = !x.effortCommercial && enCache.statut !== 'INDISPONIBLE' && enCache.statut !== cible
      qc.setQueryData<Chiffrage>(['chiffrage', versionId], (c) => c && ({
        ...c,
        offres: c.offres.map((o) => (o.id === x.offre.id ? { ...o, saisies: { ...o.saisies, [x.compteur.vcId]: saisie }, statut: changer ? cible : o.statut } : o)),
      }))
      await enregistrerPrixCompteur({ offreId: x.offre.id, versionCompteurId: x.compteur.vcId, energie: x.compteur.energie, prix: versPrix(x.compteur, saisie, x.offre.type, x.offre.duree) })
      if (changer) {
        const { error } = await supabase.from('offres_fournisseurs')
          .update({ statut: cible, date_modification: new Date().toISOString() })
          .eq('id', x.offre.id)
          .neq('statut', 'INDISPONIBLE')
        if (error) throw new Error(error.message)
      }
      return { statutChange: changer }
    },
    /* L'effort commercial (« Générer l'offre ») et un changement de statut changent ce que la
       recommandation et les listes affichent : tout se relit. Sinon, le tableau seul. */
    onSuccess: (r, x) => (x.effortCommercial || r.statutChange ? rafraichir() : relireTableau()),
    /* Refusé, le tableau revient à ce que dit la base. */
    onError: () => relireTableau(),
  })

  const changerStatut = useMutation({
    mutationFn: async (x: { offreId: string; statut: 'EN_ATTENTE' | 'DISPONIBLE' | 'INDISPONIBLE' }) => {
      const { error } = await supabase.from('offres_fournisseurs').update({ statut: x.statut, date_modification: new Date().toISOString() }).eq('id', x.offreId)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  /**
   * ══ « LE FOURNISSEUR NE LA PROPOSE PAS », SANS ATTENDRE — William, 06/10/2026 ══
   * « Le fait de barrer et supprimer les prix doit être immédiat. Et si j'ai fait une erreur et que je
   * veux rouvrir en pricing, ça doit être immédiat également. » Le tableau change avant la réponse de
   * la base (rétabli si elle refuse) ; la base retire les prix (`fn_offre_non_proposee`). Rouverte,
   * l'offre retrouve les prix qu'elle avait au moment d'être barrée, tant que la page est ouverte.
   */
  const nonProposeeEnBase = useMutation({
    mutationKey: ['non-proposee'],
    /* Deux clics rapprochés partent en base l'un après l'autre, dans l'ordre. */
    scope: { id: `non-proposee-${versionId}` },
    mutationFn: async (x: { offre: OffreChiffrage; nonProposee: boolean; compteurs: CompteurChiffrage[]; prix?: Record<string, SaisieLigne> }) => {
      const { error } = await supabase.rpc('fn_offre_non_proposee', { p_offre: x.offre.id, p_non_proposee: x.nonProposee })
      if (error) throw new Error(error.message)
      if (x.nonProposee || !x.prix) return
      for (const c of x.compteurs) {
        const s = x.prix[c.vcId]
        if (s) await enregistrerPrixCompteur({ offreId: x.offre.id, versionCompteurId: c.vcId, energie: c.energie, prix: versPrix(c, s, x.offre.type, x.offre.duree) })
      }
    },
    /* Refusée, la base dit ce qui est vrai : le tableau se relit. */
    onSettled: rafraichir,
  })
  const nonProposee = {
    isPending: nonProposeeEnBase.isPending,
    basculer: (offre: OffreChiffrage, non: boolean, compteurs: CompteurChiffrage[], onErreur: (e: Error) => void) => {
      void qc.cancelQueries({ queryKey: ['chiffrage', versionId] })
      const prix = non ? undefined : prixBarres.get(offre.id)
      if (non) prixBarres.set(offre.id, offre.saisies)
      else prixBarres.delete(offre.id)
      qc.setQueryData<Chiffrage>(['chiffrage', versionId], (ch) => ch && {
        ...ch,
        offres: ch.offres.map((o) => (o.id !== offre.id ? o : non
          ? { ...o, statut: 'INDISPONIBLE', saisies: {}, totalParCompteur: {}, ttcParCompteur: {} }
          : { ...o, statut: 'EN_ATTENTE', saisies: prix ?? {} })),
      })
      nonProposeeEnBase.mutate({ offre, nonProposee: non, compteurs, prix }, { onError: onErreur })
    },
  }

  /** Retirer ou rendre la colonne Pointe d'un compteur — immédiat à l'écran, noté sur le compteur. */
  const majSansPointe = useMutation({
    mutationFn: async (x: { compteurId: string; sansPointe: boolean }) => {
      const { error } = await supabase.from('compteurs_electricite').upsert({ compteur_id: x.compteurId, sans_pointe: x.sansPointe }, { onConflict: 'compteur_id' })
      if (error) throw new Error(error.message)
    },
    onMutate: async (x) => {
      await qc.cancelQueries({ queryKey: ['chiffrage', versionId] })
      const precedent = qc.getQueryData<Chiffrage>(['chiffrage', versionId])
      qc.setQueryData<Chiffrage>(['chiffrage', versionId], (ch) => ch && {
        ...ch, compteurs: ch.compteurs.map((c) => (c.compteurId === x.compteurId ? { ...c, sansPointe: x.sansPointe } : c)),
      })
      return { precedent }
    },
    onError: (_e, _x, ctx) => { if (ctx?.precedent) qc.setQueryData(['chiffrage', versionId], ctx.precedent) },
    onSettled: () => { rafraichir(); void qc.invalidateQueries({ queryKey: ['compteurs'] }) },
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
    onSuccess: relireTableau,
  })

  const majCommande = useMutation({
    mutationFn: async (x: { id: string; durees: number[]; types: string[] }) => {
      const { error } = await supabase.from('optimisations_fournisseurs').update({ durees_mois: x.durees, types_prix: x.types }).eq('id', x.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: rafraichir,
  })

  /**
   * ══ AJOUTER UNE OFFRE — William, 05/10/2026 ══
   * « Propose un bouton "Ajouter une offre" en dessous de la dernière offre affichée. Au clic, demande
   * Fournisseur + Durée puis crée la ligne dans le tableau. »
   *
   * LES OFFRES SUIVENT LA COMMANDE (`fn_offres_suivent_la_commande`) : chaque fournisseur consulté
   * porte ses durées et ses types de prix, et la base en tient les offres — une offre posée à côté
   * serait retirée à la prochaine retouche de la commande. On ajoute donc la DURÉE à la commande du
   * fournisseur (ou on la crée, avec les types de prix de la version) ; la base crée la ligne.
   */
  const ajouterOffre = useMutation({
    mutationFn: async (x: { optimisationId: string; fournisseurId: string; duree: number }) => {
      const { data: lignes, error } = await supabase
        .from('optimisations_fournisseurs')
        .select('id, fournisseur_compte_id, durees_mois, types_prix')
        .eq('optimisation_id', x.optimisationId)
      if (error) throw new Error(error.message)
      const toutes = (lignes ?? []) as { id: string; fournisseur_compte_id: string; durees_mois: number[] | null; types_prix: string[] | null }[]
      const typesVersion = [...new Set(toutes.flatMap((l) => l.types_prix ?? []))]
      const types = (lignes: string[] | null | undefined) => (lignes?.length ? lignes : typesVersion.length ? typesVersion : ['Fixe'])
      const existante = toutes.find((l) => l.fournisseur_compte_id === x.fournisseurId)
      if (existante) {
        if ((existante.durees_mois ?? []).includes(x.duree)) throw new Error(`Cette durée est déjà commandée à ce fournisseur.`)
        const durees = [...new Set([...(existante.durees_mois ?? []), x.duree])].sort((a, b) => a - b)
        const { error: e } = await supabase.from('optimisations_fournisseurs').update({ durees_mois: durees, types_prix: types(existante.types_prix) }).eq('id', existante.id)
        if (e) throw new Error(e.message)
      } else {
        const { error: e } = await supabase.from('optimisations_fournisseurs').insert({
          optimisation_id: x.optimisationId, fournisseur_compte_id: x.fournisseurId, durees_mois: [x.duree], types_prix: types(null),
        })
        if (e) throw new Error(e.message)
      }
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
    onSuccess: relireTableau,
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
    onSuccess: () => { oublierReglementaire(); rafraichir() },
  })

  return { ajouterOffre, enregistrerLigne, changerStatut, nonProposee, majSansPointe, majClauses, majValidite, majCommande, enregistrerActuelle, definirComparatif, publier }
}
