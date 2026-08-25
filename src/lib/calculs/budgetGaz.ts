import type { PrixOffreGaz } from '@/types/domain'

/**
 * LE BUDGET GAZ DÉCOMPOSÉ COMME LE FAIT GAZ EUROPÉEN.
 *
 * Michel, appel du 25/08/2026 : « on prend le document que je t'avais envoyé, de Gaz Européen, qu'on
 * analyse pour qu'on se retrouve à peu près sur le même type d'information », et « je veux le même
 * affichage sur condition essentielle, qui reprend exactement le détail que le fournisseur a envoyé,
 * mais uniquement pour le fournisseur retenu ».
 *
 * LEUR DOCUMENT A ÉTÉ RECONSTITUÉ À L'EURO, sur l'offre 500074350 du 25/08/2026 (CABINET MOLINIER,
 * SDC 10PERI, 227 MWh, prix fixe 36 mois) :
 *
 *   dépenses énergétiques = CAR × (P0 + TQd + CEEc + CEEp + CPB) = 227 × 74,846 = 16 990,04
 *   abonnement                                                                  =  2 502,95
 *   CTA                                                                         =     48,62
 *   TICGN                             = CAR × 16,66                             =  3 781,82
 *   TVA sur abonnement    = (abonnement + CTA) × 20 %                           =    510,31
 *   TVA hors abonnement   = (dépenses énergétiques + TICGN) × 20 %              =  4 154,37
 *   TOTAL DÉPENSES                                                              = 27 988,11 TTC
 *   prix moyen du MWh     = total ÷ CAR                                         =    123,30 TTC
 *
 * LES DEUX ASSIETTES DE TVA SONT LE PIÈGE, et c'est là qu'un calcul se trompe sans qu'on le voie :
 * la CTA est taxée AVEC L'ABONNEMENT, l'accise AVEC LA CONSOMMATION. Leur note de bas de page le dit
 * — « TVA appliquée : Abonnement, CTA : 20 % — Consommation, TICGN : 20,0 % ». Regrouper « le fixe
 * d'un côté, le variable de l'autre » donne un total faux, et c'est le regroupement qui vient
 * naturellement à l'esprit.
 *
 * NOTRE CALCUL HORS TAXES ÉTAIT DÉJÀ JUSTE. Vérifié le 25/08/2026 en passant leurs propres chiffres
 * dans `budgetsDepuisPrix` : 23 324,34 € HT contre 23 323,43 € annoncés — 91 centimes d'écart, qui
 * viennent de l'arrondi de LEURS prix unitaires (leur somme réelle vaut 74,846 et non 74,85). Nos
 * termes sont les leurs sous d'autres noms : leur TQd est notre ATRD, leur TICGN est notre AGN —
 * l'accise sur les gaz naturels, nouveau nom de la TICGN. Ce qui manquait n'était donc pas le calcul
 * mais LA TVA : aucune colonne contenant « tva » ou « ttc » n'existe dans toute la base.
 *
 * LE TAUX VAUT POUR TOUS LES FOURNISSEURS, tranché par Naoëlle le 25/08/2026 : « oui, la TVA 20 %
 * c'est pour tous les fournisseurs ». Il n'est donc plus une hypothèse tirée du seul document de Gaz
 * Européen. Le libellé le porte quand même à l'écran — un total TTC ne doit pas pouvoir être lu sans
 * savoir sur quoi il repose, et le jour où un régime change, c'est cette ligne qui le dira.
 */

/** Le taux des deux assiettes. Vaut pour tous les fournisseurs (Naoëlle, 25/08/2026). */
export const TAUX_TVA_GAZ = 0.2

export interface BudgetGazDecompose {
  /** La consommation retenue, en MWh — le diviseur de tout le reste. */
  conso: number
  /** CAR × (molécule + acheminement variable + CEE + CPB). */
  depensesEnergetiques: number
  abonnement: number
  cta: number
  /** L'accise sur les gaz naturels, ex-TICGN : CAR × prix au MWh. */
  accise: number
  /** (abonnement + CTA) × taux. */
  tvaAbonnement: number
  /** (dépenses énergétiques + accise) × taux. */
  tvaConsommation: number
  totalHt: number
  totalTtc: number
  /** Total HT ÷ consommation. Le pendant du prix moyen TTC, pour la lecture hors taxes. */
  prixMoyenHtMwh: number
  /** Total TTC ÷ consommation — « y compris abonnement et taxes », comme ils l'écrivent. */
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
  const acheminementVariable = (prix.prix_atrd_mwh ?? 0) + (prix.prix_atrt_mwh ?? 0)
  const cee = prix.prix_cee_mwh
  const cpb = prix.prix_cpb_mwh

  // Une composante absente n'est pas zéro : on le retient pour le dire, mais on ne bloque pas le
  // calcul — un budget partiel annoncé comme tel vaut mieux que rien du tout.
  const incomplet =
    molecule == null || cee == null || cpb == null ||
    prix.prix_atrd_mwh == null || prix.prix_agn_mwh == null ||
    prix.abonnement_fourniture_annuel_ht == null || prix.cta_annuel_ht == null

  const depensesEnergetiques = ((molecule ?? 0) + acheminementVariable + (cee ?? 0) + (cpb ?? 0)) * conso
  const abonnement = prix.abonnement_fourniture_annuel_ht ?? 0
  const cta = prix.cta_annuel_ht ?? 0
  const accise = (prix.prix_agn_mwh ?? 0) * conso

  const tvaAbonnement = (abonnement + cta) * TAUX_TVA_GAZ
  const tvaConsommation = (depensesEnergetiques + accise) * TAUX_TVA_GAZ

  const totalHt = depensesEnergetiques + abonnement + cta + accise
  const totalTtc = totalHt + tvaAbonnement + tvaConsommation

  return {
    conso,
    depensesEnergetiques,
    abonnement,
    cta,
    accise,
    tvaAbonnement,
    tvaConsommation,
    totalHt,
    totalTtc,
    prixMoyenHtMwh: totalHt / conso,
    prixMoyenTtcMwh: totalTtc / conso,
    incomplet,
  }
}
