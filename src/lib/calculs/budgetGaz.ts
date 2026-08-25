import type { PrixOffreGaz } from '@/types/domain'

/**
 * LE BUDGET GAZ, DÉCOMPOSÉ COMME MICHEL LE DEMANDE.
 *
 * Appel du 25/08/2026 à 14 h 52, où il détaille la structure ligne par ligne. Trois familles, et
 * trois seulement :
 *
 *   PRIX FOURNISSEUR              molécule · certificats d'économie d'énergie · biogaz
 *   ACHEMINEMENT, DISTRIBUTION    total abonnement (€/an) · terme quantité distribution (€/MWh)
 *   ET TRANSPORT
 *   TAXE                          CTA (€/an) · accise sur le gaz naturel (€/MWh)
 *
 * « Sur le budget annuel, du coup, j'aurais que trois grandes lignes » — une par famille, contre les
 * six postes que j'avais reproduits du document de Gaz Européen. Sa raison : « la ligne du budget
 * c'est le montant total, et les lignes du prix détaillé le montant de chaque composante ».
 *
 * LA TVA EST GROUPÉE, et il explique pourquoi : « t'as pas besoin de mettre une TVA sur abonnement ou
 * hors abonnement, parce que c'est 20 % maintenant. Avant il y avait une TVA de 5 % pour l'abonnement
 * et les autres à 20 %, maintenant tout est passé à 20 %. » Le groupement est donc EXACT et non
 * approché : deux assiettes au même taux se somment. Vérifié sur leur document — 23 323,43 × 1,20 =
 * 27 988,12 contre 27 988,11 annoncés, un centime d'arrondi.
 *
 * NOTRE CALCUL HORS TAXES ÉTAIT DÉJÀ JUSTE, vérifié le 25/08/2026 en passant les chiffres de Gaz
 * Européen dans `budgetsDepuisPrix` : 23 324,34 € HT contre 23 323,43 annoncés — 91 centimes venant
 * de l'arrondi de LEURS prix unitaires. Nos termes sont les leurs sous d'autres noms : leur TQd est
 * notre ATRD, leur TICGN est notre AGN, l'accise sur les gaz naturels. Ce qui manquait n'était pas le
 * calcul mais la TVA : aucune colonne « tva » ou « ttc » n'existe dans la base.
 */

/** Le taux unique. Vaut pour tous les fournisseurs et pour les deux assiettes (Michel, 25/08/2026). */
export const TAUX_TVA_GAZ = 0.2

export interface BudgetGazDecompose {
  /** La consommation retenue, en MWh — le diviseur de tout le reste. */
  conso: number

  // ── Les trois grandes lignes du budget annuel ──
  /** Molécule + CEE + CPB, au prorata de la consommation. */
  budgetFournisseur: number
  /** Abonnement annuel + terme quantité de distribution et de transport. */
  budgetAcheminement: number
  /** CTA annuelle + accise sur les gaz naturels. */
  budgetTaxes: number

  totalHt: number
  /** La TVA groupée : les deux assiettes étant au même taux, elles se somment sans perte. */
  tva: number
  totalTtc: number
  prixMoyenHtMwh: number
  prixMoyenTtcMwh: number

  /** Vrai quand une composante manque : le total est alors partiel et doit se dire tel quel. */
  incomplet: boolean
}

/**
 * @param prix les prix unitaires de l'offre sur ce point de livraison
 * @param consoForcee la consommation à retenir, si elle ne vient pas des prix
 *
 * Rend `null` sans consommation : sans volume, un prix au MWh ne produit aucun budget, et écrire 0 €
 * ferait passer une offre non chiffrable pour gratuite.
 */
export function budgetGazDecompose(
  prix: PrixOffreGaz | null | undefined,
  consoForcee?: number | null,
): BudgetGazDecompose | null {
  if (!prix) return null
  const conso = consoForcee ?? prix.car_reference_mwh ?? null
  if (conso == null || conso <= 0) return null

  // `prix_energie_mwh` est la molécule PRÉSENTÉE — P0 + marge de référence — déjà calculée en amont.
  // Reprendre le P0 nu ici ferait un budget hors marge, donc un budget qui n'est pas celui du client.
  const molecule = prix.prix_energie_mwh
  const cee = prix.prix_cee_mwh
  const cpb = prix.prix_cpb_mwh
  const acheminementMwh = (prix.prix_atrd_mwh ?? 0) + (prix.prix_atrt_mwh ?? 0)

  // Une composante absente n'est pas zéro : on le retient pour le dire, sans bloquer le calcul —
  // un budget partiel annoncé comme tel vaut mieux que rien du tout.
  const incomplet =
    molecule == null || cee == null || cpb == null ||
    prix.prix_atrd_mwh == null || prix.prix_agn_mwh == null ||
    prix.abonnement_fourniture_annuel_ht == null || prix.cta_annuel_ht == null

  const budgetFournisseur = ((molecule ?? 0) + (cee ?? 0) + (cpb ?? 0)) * conso
  const budgetAcheminement = (prix.abonnement_fourniture_annuel_ht ?? 0) + acheminementMwh * conso
  const budgetTaxes = (prix.cta_annuel_ht ?? 0) + (prix.prix_agn_mwh ?? 0) * conso

  const totalHt = budgetFournisseur + budgetAcheminement + budgetTaxes
  const tva = totalHt * TAUX_TVA_GAZ
  const totalTtc = totalHt + tva

  return {
    conso,
    budgetFournisseur,
    budgetAcheminement,
    budgetTaxes,
    totalHt,
    tva,
    totalTtc,
    prixMoyenHtMwh: totalHt / conso,
    prixMoyenTtcMwh: totalTtc / conso,
    incomplet,
  }
}
