/**
 * Résolution tolérante d'un code de référentiel.
 *
 * La refonte des cycles de vie du 12/08/2026 renomme des codes (`A_PREPARER` → `DIAGNOSTIC`,
 * `BROUILLON` → `EN_CONSTRUCTION`, …) et désactive les anciens. Or trois colonnes qui reçoivent
 * ces identifiants sont NOT NULL : `recommandations.etape_id`, `versions_recommandation.
 * statut_version_id` et `contrats.statut_id`. Un code introuvable ne dégrade donc pas
 * l'affichage — il fait échouer l'écriture, silencieusement, du côté de l'utilisateur.
 *
 * Le code applicatif et la migration SQL ne sont pas déployés au même instant : la migration est
 * appliquée à la main sur la base. Cette fonction couvre l'intervalle en cherchant les codes dans
 * l'ordre donné — le code cible d'abord, l'ancien ensuite — et rend le premier qui existe.
 *
 * Les codes de repli pourront être retirés quand la migration sera passée en production.
 */
export function trouverParCode<T extends { code: string }>(
  referentiel: readonly T[] | null | undefined,
  ...codes: string[]
): T | undefined {
  if (!referentiel) return undefined
  for (const code of codes) {
    const trouve = referentiel.find((entree) => entree.code === code)
    if (trouve) return trouve
  }
  return undefined
}
