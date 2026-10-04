/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA MARGE OPTIMISÉE — mettre un fournisseur en tête sans que ça se voie
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « tu choisis un fournisseur que tu veux qu'il soit premier et Kimatch vient
 * automatiquement ajuster les autres offres pour qu'elles soient légèrement plus chères, en ajoutant
 * de la marge. Cet ajout doit être malin et discret (ex : éviter d'ajouter 2 € partout, c'est grillé). »
 *
 * LA RÈGLE
 *   · L'offre choisie garde sa marge ; celles qui sont déjà plus chères ne bougent pas.
 *   · Chaque offre moins chère (ou à égalité) remonte JUSTE au-dessus, et pas plus : la première de
 *     0,4 à 0,9 % au-dessus de l'offre choisie, les suivantes espacées de 0,3 à 0,9 % chacune.
 *   · L'ordre entre les offres remontées est conservé : celle qui était la moins chère des deux le reste.
 *   · Les écarts varient d'une offre à l'autre, tirés de l'identifiant de l'offre : le résultat est le
 *     même à chaque clic (rien ne « saute »), mais aucun motif régulier ne se lit dans le comparatif.
 *   · La marge s'arrondit au centime d'euro par MWh, vers le haut : l'offre reste au-dessus.
 *
 * Le budget est une fonction affine de la marge (énergie = volume × (prix + marge)) : la pente se mesure
 * sur le calcul du Pricer lui-même, sans supposer le volume.
 */

export interface OffreAOptimiser {
  id: string
  marge: number
}

/** Un nombre entre 0 et 1, stable pour un identifiant donné. */
function alea(id: string, sel: number): number {
  let h = 2166136261 ^ sel
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

export function margesOptimisees(
  offres: OffreAOptimiser[],
  enTeteId: string,
  /** Le budget annuel de l'offre pour une marge donnée — celui du Pricer. */
  budget: (id: string, marge: number) => number,
): Record<string, number> {
  const resultat: Record<string, number> = Object.fromEntries(offres.map((o) => [o.id, o.marge]))
  const tete = offres.find((o) => o.id === enTeteId)
  if (!tete) return resultat
  const reference = budget(tete.id, tete.marge)
  const aRemonter = offres
    .filter((o) => o.id !== tete.id)
    .map((o) => ({ o, b: budget(o.id, o.marge) }))
    .filter((x) => x.b <= reference)
    .sort((a, b) => a.b - b.b)

  let palier = reference
  aRemonter.forEach(({ o, b }, rang) => {
    const ecart = rang === 0 ? 0.004 + alea(o.id, 1) * 0.005 : 0.003 + alea(o.id, 2) * 0.006
    palier = palier * (1 + ecart)
    const pente = budget(o.id, o.marge + 1) - b
    if (!(pente > 0)) return
    const marge = Math.ceil((o.marge + (palier - b) / pente) * 100 - 1e-9) / 100
    resultat[o.id] = Math.max(o.marge, marge)
    palier = Math.max(palier, budget(o.id, resultat[o.id]))
  })
  return resultat
}
