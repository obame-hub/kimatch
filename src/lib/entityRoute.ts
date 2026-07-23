// Route de la fiche correspondant à une entité polymorphe (documents.entite_type, etc.).
// Retourne null si le type ne correspond à aucun écran existant.
export function entityRoute(entiteType: string, entiteId: string): string | null {
  switch (entiteType) {
    case 'site':
      return `/sites/${entiteId}`
    case 'compte':
      return `/comptes/${entiteId}`
    case 'mandat':
      return `/mandats/${entiteId}`
    case 'recommandation':
      return `/recommandations/${entiteId}`
    case 'contrat':
      return `/contrats/${entiteId}`
    case 'compteur':
      return `/compteurs/${entiteId}`
    default:
      return null
  }
}
