/**
 * UN VOLUME D'ÉNERGIE, ÉCRIT COMME ON LE DIT.
 *
 * La base stocke des mégawattheures ; Michel parle en gigawattheures dès qu'il s'agit d'un portefeuille
 * (« 102,4 GWh » sur sa page 5), et en mégawattheures pour un point de livraison. Les deux sont la
 * même donnée : seule l'échelle de lecture change, et écrire « 102 400 MWh » sur un bandeau
 * obligerait à compter les zéros.
 *
 * LE SEUIL EST À 1 000 MWh, soit 1 GWh — le point où la lecture bascule naturellement. En dessous, on
 * reste en MWh sans décimale : une consommation de site ne se discute pas au centième.
 */
export function volumeLisible(mwh: number | null | undefined): string | null {
  if (mwh == null) return null
  if (mwh >= 1000) return (mwh / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' GWh'
  return mwh.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' MWh'
}
