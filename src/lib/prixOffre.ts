/**
 * LE PRIX AU MWH D'UNE OFFRE.
 *
 * Sorti de ComparatifVersions le 30/08/2026 pour pouvoir être testé : c'est le calcul sur lequel
 * repose la comparaison présentée au client, et il vivait sans filet à l'intérieur d'un composant
 * d'affichage.
 *
 * Le prix ANNONCÉ par le fournisseur d'abord (`prix_moyen_mwh`, saisi sous le fournisseur consulté) :
 * c'est la donnée primaire, celle qu'il écrit dans son mail et sur laquelle on compare.
 *
 * À défaut, la moyenne PONDÉRÉE PAR LES VOLUMES du détail par PDL. Une moyenne simple donnerait
 * autant de poids à un PDL de 6 MWh qu'à un de 800 : sur un portefeuille où un site pèse cent fois
 * un autre, elle peut désigner comme « moins chère » une offre qui coûte plus cher.
 */

/** Ce que le calcul lit d'un détail par compteur — rien de plus. */
export interface DetailChiffre {
  consommation_annuelle_reference_mwh?: number | null
  cout_fourniture_annuel_ht?: number | null
}

/** Ce que le calcul lit d'une offre — rien de plus. */
export interface OffreChiffree {
  prix_moyen_mwh?: number | null
  details_par_compteur: DetailChiffre[]
}

export function prixMoyenMWh(offre: OffreChiffree | null | undefined): number | null {
  if (!offre) return null
  if (offre.prix_moyen_mwh != null) return offre.prix_moyen_mwh

  let cout = 0
  let volume = 0
  for (const d of offre.details_par_compteur) {
    const mwh = d.consommation_annuelle_reference_mwh
    const fourniture = d.cout_fourniture_annuel_ht
    // Un volume nul ou négatif n'est pas une consommation : l'inclure diviserait par zéro ou
    // retrancherait du volume à la moyenne. Un coût absent ne vaut pas zéro euro — on ne sait pas.
    if (mwh == null || mwh <= 0 || fourniture == null) continue
    cout += fourniture
    volume += mwh
  }
  if (volume <= 0) return null
  return cout / volume
}
