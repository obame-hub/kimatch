/**
 * ══ LA FICHE SUIVANTE D'UN SPRINT ══
 *
 * Isolée du composant pour être testée seule : c'est elle qui décidait mal. Thomas, 28/09/2026 :
 * « dans certains cas la prochaine fiche qui s'affiche est skip dès qu'il clique sur Appeler ».
 *
 * La séance désigne ses fiches par IDENTIFIANT, dans un ordre fixé à l'ouverture. La suivante est
 * la première fiche encore À CONTACTER après la courante, en revenant au début — une fiche passée
 * reste à appeler, et le tour suivant la repropose. Une fiche appelée, close ou sortie du plan n'est
 * plus à contacter : elle est sautée, c'est voulu.
 *
 * @param ordre  les identifiants de la séance, dans l'ordre
 * @param etatDe l'état ACTUEL d'une fiche dans le plan, `undefined` si elle en est sortie ou close
 * @param depuis la fiche courante, `null` au départ
 */
export function prochaineFiche(
  ordre: readonly string[],
  etatDe: (id: string) => 'A_CONTACTER' | 'CONTACTE' | undefined,
  depuis: string | null,
): string | null {
  const i = depuis ? ordre.indexOf(depuis) : -1
  const candidates = [...ordre.slice(i + 1), ...ordre.slice(0, Math.max(i, 0))]
  return candidates.find((id) => id !== depuis && etatDe(id) === 'A_CONTACTER') ?? null
}
