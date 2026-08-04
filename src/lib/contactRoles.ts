// Règles de rôle contact, exactement comme dans Tools (ContactCreationForm) : "Conseil syndical"
// n'est proposé que pour les syndics (pro ou non pro) -- tous les autres types de compte n'ont que
// Décisionnaire/Administratif.

export const CONTACT_ROLES_SYNDIC = ['Décisionnaire', 'Administratif', 'Conseil syndical'] as const
export const CONTACT_ROLES_DEFAUT = ['Décisionnaire', 'Administratif'] as const

const SEGMENTS_SYNDIC = new Set(['Syndic professionnel', 'Syndic non professionnel'])

export function contactRoleOptions(segment: string | null | undefined): readonly string[] {
  return segment && SEGMENTS_SYNDIC.has(segment) ? CONTACT_ROLES_SYNDIC : CONTACT_ROLES_DEFAUT
}
