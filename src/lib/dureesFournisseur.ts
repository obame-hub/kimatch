/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES DURÉES QU'UN FOURNISSEUR PEUT PROPOSER — William, 06/10/2026
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * « Pour chaque fournisseur, plusieurs durées types (12, 24, 36, 48, 60 mois). Le fournisseur
 * interroge le critère "Fin de fourniture au plus tard". Exemple : pour un début de fourniture au
 * 01/03/2028, GAZ EUROPÉEN (fin au plus tard le 01/01/2032) : 12, 24 et 36 mois ; 48 mois
 * impossible (01/03/2032 > 01/01/2032), donc la durée max, 46 mois (01/01/2032). »
 *
 * Une durée tient quand le début de fourniture + la durée tombe au plus tard le jour limite. En
 * multisite, c'est le compteur le plus contraint qui décide : la même durée est demandée pour tous.
 */

export const DUREES_TYPES = [12, 24, 36, 48, 60] as const
/** Au-delà, on ne propose rien de plus long, même sans limite chez le fournisseur. */
export const DUREE_PLAFOND = 60

function jour(d: string | Date): Date {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  const [a, m, j] = d.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, j, 12)
}

/** Le jour qui suit `debut` de `mois` mois. Un 31 sans équivalent recule au dernier jour du mois. */
export function plusMois(debut: Date, mois: number): Date {
  const d = jour(debut)
  const cible = new Date(d.getFullYear(), d.getMonth() + mois, 1, 12)
  const dernier = new Date(cible.getFullYear(), cible.getMonth() + 1, 0, 12).getDate()
  cible.setDate(Math.min(d.getDate(), dernier))
  return cible
}

/** La durée la plus longue (en mois entiers) qui finit au plus tard le `finAuPlusTard`. 0 : aucune. */
export function dureeMax(debut: Date, finAuPlusTard: string | null | undefined): number {
  if (!finAuPlusTard) return DUREE_PLAFOND
  const fin = jour(finAuPlusTard)
  let m = 0
  while (m < DUREE_PLAFOND && plusMois(debut, m + 1) <= fin) m++
  return m
}

/** Pour plusieurs débuts de fourniture (multisite) : la durée max du plus contraint. */
export function dureeMaxPerimetre(debuts: Date[], finAuPlusTard: string | null | undefined): number {
  if (debuts.length === 0) return DUREE_PLAFOND
  return Math.min(...debuts.map((d) => dureeMax(d, finAuPlusTard)))
}
