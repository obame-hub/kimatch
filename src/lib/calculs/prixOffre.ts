/**
 * Les formules de prix et de budget d'une offre, sur UN point de livraison.
 *
 * ISOLÉES ICI LE 19/08/2026 parce que trois écrans en ont besoin — la saisie inline, la modale de
 * saisie et le document comparatif — et que la journée a déjà montré deux fois le prix d'une formule
 * recopiée : la marge comptée deux fois dans le budget énergie, puis l'abonnement électrique. Une
 * seule définition, un seul endroit à corriger.
 *
 * LES RÈGLES, telles que Michel les a arrêtées le 19/08/2026 :
 *
 *   GAZ           molécule       = molécule P0 + marge de référence
 *                 budget énergie = conso × (molécule + CEE + CPB)
 *                 budget abonnement = l'abonnement, à part
 *                 budget contribution = conso × (ATRD + AGN) + CTA
 *
 *   ÉLECTRICITÉ   prix classe    = P0 de la classe + marge de référence
 *                 budget énergie = Σ (prix classe × volume de la classe) + abonnement
 *                                  — l'abonnement est DEDANS, contrairement au gaz
 *                 budget TURPE   = le TURPE saisi, en €/an
 *
 *   TOUJOURS      budget total   = énergie + abonnement (gaz) + contribution
 *
 * `null` PARTOUT OÙ LA DONNÉE MANQUE, jamais zéro : une offre non chiffrable ne doit pas passer pour
 * gratuite. C'est le rôle de `somme` ci-dessous.
 */
import type {
  Compteur,
  OffreFournisseurCompteur,
  PrixOffreElectricite,
  PrixOffreGaz,
} from '@/types/domain'

/** Somme qui reste `null` si aucun terme n'est connu — zéro et inconnu ne se disent pas pareil. */
export function somme(...v: (number | null | undefined)[]): number | null {
  return v.reduce<number | null>((t, x) => (x == null ? t : (t ?? 0) + x), null)
}

/** Les classes temporelles dans l'ordre où un tarif les présente. */
export const ORDRE_CLASSES = ['BASE', 'HP', 'HC', 'HPH', 'HCH', 'HPE', 'HCE', 'POINTE'] as const

export const LIBELLE_CLASSE: Record<string, string> = {
  BASE: 'Base',
  HP: 'Heures pleines',
  HC: 'Heures creuses',
  HPH: 'Pleines hiver',
  HCH: 'Creuses hiver',
  HPE: 'Pleines été',
  HCE: 'Creuses été',
  POINTE: 'Pointe',
}

/** Les classes à proposer pour un compteur : celles qu'il consomme, Base à défaut. */
export function classesDuCompteur(compteur: Compteur | undefined): string[] {
  const conso = compteur?.consoParClasseMwh ?? {}
  const presentes = ORDRE_CLASSES.filter((c) => (conso[c] ?? 0) > 0)
  return presentes.length > 0 ? [...presentes] : ['BASE']
}

/**
 * La molécule telle qu'elle est présentée au client : le prix net du fournisseur, plus la marge.
 *
 * RÈGLE DE MICHEL, appel du 19/08/2026 : « Le champ actuel qui s'appelle molécule sera égal à
 * molécule P0 plus marge. » Sa raison : « le prix de la molécule, ce n'est pas juste saisi, c'est
 * quelque chose qui est présenté » — le prix nu du fournisseur, lui, c'est le P0, « on l'appelait même
 * pas molécule, on l'appelait P0 ».
 *
 *   molécule = molécule P0 + marge de référence
 *
 * LA MARGE N'EST DONC PLUS UN TERME À PART DANS LE BUDGET. Elle y entre par la molécule, une seule
 * fois. L'ajouter aussi au budget énergie la compterait deux fois — c'est ce que faisait le calcul de
 * ce matin, avant que Michel ne referme la question.
 *
 * ET IL N'Y A PLUS QU'UNE MARGE : « on n'a plus besoin des trois autres types de marge, on a besoin
 * d'une seule marge […] dès que je change la marge, ce sera forcément la marge réelle que j'ajoute. »
 * La marge ajustable et la marge retenue quittent l'écran.
 */
export function moleculePresentee(
  p0: number | null | undefined,
  marge: number | null | undefined,
  typeMarge: TypeMarge = 'VARIABLE',
) {
  // SANS PRIX FOURNISSEUR, PAS DE PRIX CLIENT. Constaté en testant l'écran le 20/08/2026 : sur un
  // compteur à cinq classes horosaisonnières dont une seule était cotée, la marge seule faisait un
  // prix pour les quatre autres — et donc un budget pour des classes que le fournisseur n'a jamais
  // chiffrées. L'aperçu annonçait 21 279,55 € là où l'enregistrement écrivait 18 757,28 €, parce que
  // l'écriture, elle, écarte déjà les classes sans P0. Un aperçu qui ne dit pas ce qui sera écrit est
  // pire qu'un aperçu absent.
  if (p0 == null) return null
  // MARGE FIXE : le fournisseur a déjà pris sa marge dans son P0. L'ajouter la compterait deux fois
  // et gonflerait le prix annoncé au client (Michel, 20/08/2026 : « quand c'est une marge fixe, ça
  // n'a pas d'impact sur le prix »).
  if (typeMarge === 'FIXE') return p0
  return somme(p0, marge)
}

/** Le type de marge d'une ligne offre × PDL. Voir la migration 20260820100000. */
export type TypeMarge = 'VARIABLE' | 'FIXE'

export const PRIX_GAZ_VIDE: PrixOffreGaz = {
  type_prix: null, prix_molecule_p0_mwh: null, prix_energie_mwh: null,
  prix_cee_mwh: null, prix_cpb_mwh: null,
  prix_atrt_mwh: null, prix_atrd_mwh: null, prix_agn_mwh: null, car_reference_mwh: null,
  abonnement_fourniture_annuel_ht: null, cta_annuel_ht: null,
}

/** Les champs dont la saisie doit déclencher un recalcul des budgets. */
export const CHAMPS_DE_PRIX = [
  'prix_energie_mwh', 'prix_cee_mwh', 'prix_cpb_mwh', 'prix_atrd_mwh', 'prix_agn_mwh',
  'cta_annuel_ht', 'abonnement_fourniture_annuel_ht', 'p0_mwh_par_classe',
  'consommation_annuelle_reference_mwh',
  // Le P0 et la marge composent la molécule, qui commande le budget énergie : les omettre ici
  // laisserait un budget périmé après un ajustement de marge.
  'prix_molecule_p0_mwh', 'marge_reelle_eur_mwh', 'prix_turpe_annuel_ht',
] as const

/**
 * Les budgets annuels qu'impliquent les prix unitaires, pour UN point de livraison.
 *
 * `null` si la consommation est inconnue : sans volume, un prix au MWh ne donne aucun budget, et
 * écrire 0 € ferait passer une offre non chiffrable pour gratuite.
 *
 * CE QUI N'EST PAS CALCULÉ, et pourquoi : l'acheminement électrique (TURPE) dépend d'un barème
 * réglementaire annuel que l'application ne connaît pas. On ne l'invente pas — il reste saisi, et le
 * total en tient compte quand il l'est. Côté gaz, l'ATRD et l'AGN sont des prix au MWh donnés par le
 * fournisseur : eux, on sait les multiplier.
 */
export function budgetsDepuisPrix(opts: {
  gaz: boolean
  compteur: Compteur | undefined
  detail: OffreFournisseurCompteur | undefined
  /** Les prix APRÈS application de la saisie en cours, pas ceux encore en base. */
  prixGaz?: PrixOffreGaz | null
  prixElec?: PrixOffreElectricite | null
  /** La consommation à retenir, si la saisie en cours la change. */
  consoForcee?: number | null
  /** Le budget des contributions, saisi en €/an. Électricité seulement pour l'instant : ses
   *  composantes ne sont pas cadrées, Michel doit les envoyer (réunion du 20/08/2026). */
  contributionSaisie?: number | null
}): { energie: number | null; contribution: number | null; total: number | null } {
  const { gaz, compteur, detail } = opts

  if (gaz) {
    const p = opts.prixGaz
    const conso = opts.consoForcee
      ?? detail?.consommation_annuelle_reference_mwh
      ?? p?.car_reference_mwh
      ?? compteur?.car_mwh
      ?? null
    if (conso == null) return { energie: null, contribution: null, total: null }
    // Budget Énergie = conso × (molécule + CEE + CPB) — formule de Michel du 19/08/2026.
    // La marge est DANS `prix_energie_mwh`, que l'appelant a déjà calculé comme P0 + marge. La
    // rajouter ici la compterait deux fois.
    const partEnergie = somme(p?.prix_energie_mwh, p?.prix_cee_mwh, p?.prix_cpb_mwh)
    const partAcheminement = somme(p?.prix_atrd_mwh, p?.prix_agn_mwh)
    const energie = partEnergie == null ? null : partEnergie * conso
    const contribution = partAcheminement == null && p?.cta_annuel_ht == null
      ? null
      : (partAcheminement ?? 0) * conso + (p?.cta_annuel_ht ?? 0)
    return {
      energie,
      contribution,
      total: somme(energie, p?.abonnement_fourniture_annuel_ht, contribution),
    }
  }

  // Électricité : chaque classe se valorise sur SA consommation, pas sur le total du PDL.
  const p = opts.prixElec
  const conso = opts.consoForcee
    ?? detail?.consommation_annuelle_reference_mwh
    ?? compteur?.consommation_annuelle_mwh
    ?? null
  const consoParClasse = compteur?.consoParClasseMwh ?? {}
  const classesSaisies = Object.entries(p?.prix_mwh_par_classe ?? {})
    .filter(([, v]) => v != null) as [string, number][]
  let energie: number | null = null
  for (const [classe, prix] of classesSaisies) {
    // À défaut de ventilation par classe, un tarif à une seule classe porte sur le volume total.
    const volume = consoParClasse[classe] ?? (classesSaisies.length === 1 ? conso : null)
    if (volume == null) continue
    energie = (energie ?? 0) + prix * volume
  }
  // L'ABONNEMENT EST DANS L'ÉNERGIE en électricité, et c'est la différence avec le gaz. Michel,
  // 19/08/2026 : « consommation heures pleines hiver fois le prix, ainsi de suite, PLUS l'abonnement
  // annuel, et la somme me donne le budget énergie ». Sa raison : au gaz l'abonnement relève de
  // l'acheminement, alors qu'en électricité c'est un supplément que le fournisseur ajoute librement —
  // l'acheminement, lui, c'est le TURPE.
  const energieAvecAbonnement = somme(energie, p?.abonnement_fourniture_annuel_ht)
  // L'acheminement électrique EST le TURPE, saisi à la main faute de barème dans l'application. On
  // retombe sur le budget déjà en base tant qu'aucun TURPE n'est saisi, pour ne pas effacer une
  // valeur que quelqu'un aurait posée avant que ce champ existe.
  const turpe = p?.prix_turpe_annuel_ht ?? detail?.cout_acheminement_annuel_ht ?? null
  // LES CONTRIBUTIONS S'AJOUTENT AU TURPE, elles ne le remplacent pas. Michel, 20/08/2026 : « tu as
  // un budget énergie de 1500, tu as un budget TURPE de 500, et tu vas avoir un budget contribution
  // […] et tu auras le budget total. » Quatre budgets, pas trois.
  //
  // ET CES CONTRIBUTIONS SONT L'ACCISE ET LA CTA. Elles étaient saisies dans le formulaire, écrites
  // en base, affichées sur la carte de l'offre — et absentes de ce total. Sur le seul point de
  // livraison électrique chiffré, cela faisait 546 € par an de moins que la ligne juste au-dessus
  // (accise 450 + CTA 96), constaté le 21/08/2026. Un total qui ne vaut pas la somme de ce qu'on
  // montre ne se fait pas pardonner : c'est exactement l'erreur corrigée la veille au gaz.
  //
  // `cout_taxes_annuel` reste le repli : c'est le montant global que portaient les offres reprises
  // avant que l'accise et la CTA aient leurs propres champs.
  const taxesDetaillees = somme(p?.accise_annuel_ht, p?.cta_annuel_ht)
  const contributions = taxesDetaillees
    ?? (opts.contributionSaisie !== undefined ? opts.contributionSaisie : detail?.cout_taxes_annuel ?? null)
  return {
    energie: energieAvecAbonnement,
    contribution: turpe,
    total: somme(energieAvecAbonnement, turpe, contributions),
  }
}
