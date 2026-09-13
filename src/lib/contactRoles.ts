// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES RÔLES D'UN CONTACT — QUATRE VALEURS, CUMULABLES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// William, 13/09/2026 : « Voici les rôles : Décisionnaire, Signataire, Administratif, Conseil
// Syndical. Ce sont des rôles, pas des fonctions donc c'est un champ différent. Un choix multiple
// est possible par exemple : Décisionnaire et signataire. »
//
// UN RÔLE N'EST PAS UNE FONCTION. `contacts.fonction` est l'intitulé de poste, saisi librement —
// 733 valeurs distinctes en base, dont 125 ne sont que des variantes de casse. Le rôle dit ce que
// la personne PEUT FAIRE dans notre processus, et il se compte : 526 contacts sont à la fois
// décisionnaires et signataires, ce qui interdisait la colonne unique qui existait jusqu'ici.
//
// `role` (singulier) est l'ancienne colonne, encore lue par les écrans qui n'ont pas basculé.
// `roles` (tableau) est la nouvelle. Les deux cohabitent le temps de la bascule.
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const ROLES_CONTACT = ['DECISIONNAIRE', 'SIGNATAIRE', 'ADMINISTRATIF', 'CONSEIL_SYNDICAL'] as const

export type RoleContact = (typeof ROLES_CONTACT)[number]

export const LIBELLE_ROLE: Record<RoleContact, string> = {
  DECISIONNAIRE: 'Décisionnaire',
  SIGNATAIRE: 'Signataire',
  ADMINISTRATIF: 'Administratif',
  CONSEIL_SYNDICAL: 'Conseil syndical',
}

export const AIDE_ROLE: Record<RoleContact, string> = {
  DECISIONNAIRE: 'Tranche et engage le compte',
  SIGNATAIRE: 'Signe les mandats et les contrats',
  ADMINISTRATIF: 'Technique, juridique, comptabilité, assistanat',
  CONSEIL_SYNDICAL: 'Représente les copropriétaires — ne contractualise pas',
}

const SEGMENTS_SYNDIC = new Set(['Syndic professionnel', 'Syndic non professionnel'])

/** Le syndic bénévole : la copropriété est son propre syndic, il n'y a pas de cabinet. */
export const SEGMENT_SYNDIC_BENEVOLE = 'Syndic non professionnel'

export function estSyndic(segment: string | null | undefined): boolean {
  return !!segment && SEGMENTS_SYNDIC.has(segment)
}

/**
 * Les rôles proposés pour un compte. « Conseil syndical » n'a de sens que chez un syndic : sur une
 * entreprise, le proposer inviterait à créer la donnée absurde qu'on vient de nettoyer — 388 des
 * 389 recopies de conseil syndical trouvées le 13/09/2026 étaient posées sur des entreprises.
 */
export function rolesDisponibles(segment: string | null | undefined): readonly RoleContact[] {
  return estSyndic(segment)
    ? ROLES_CONTACT
    : (['DECISIONNAIRE', 'SIGNATAIRE', 'ADMINISTRATIF'] as const)
}

/**
 * En syndic bénévole, cocher « Conseil syndical » entraîne les deux autres.
 *
 * William, 13/09/2026 : « un membre CS est forcément décisionnaire et signataire puisque par
 * définition il n'y a pas de cabinet de syndic, donc pas de gestionnaire. » Ce n'est pas une
 * exception à la règle « un membre CS ne contractualise jamais » — c'est l'absence d'intermédiaire :
 * sans cabinet entre la copropriété et Kiwee, le conseil syndical EST la partie contractante.
 *
 * La règle est appliquée ICI, à la saisie, et non par un déclencheur en base : un trigger
 * modifierait en silence ce que la personne vient de cocher. Le formulaire, lui, coche, verrouille
 * et explique.
 */
export function rolesEntraines(roles: readonly string[], segment: string | null | undefined): RoleContact[] {
  if (segment !== SEGMENT_SYNDIC_BENEVOLE || !roles.includes('CONSEIL_SYNDICAL')) {
    return roles.filter((r): r is RoleContact => (ROLES_CONTACT as readonly string[]).includes(r))
  }
  const complet = new Set<RoleContact>(
    roles.filter((r): r is RoleContact => (ROLES_CONTACT as readonly string[]).includes(r)),
  )
  complet.add('DECISIONNAIRE')
  complet.add('SIGNATAIRE')
  return ROLES_CONTACT.filter((r) => complet.has(r))
}

/** Les rôles qu'on ne peut pas décocher, parce qu'un autre choix les impose. */
export function rolesVerrouilles(roles: readonly string[], segment: string | null | undefined): RoleContact[] {
  return segment === SEGMENT_SYNDIC_BENEVOLE && roles.includes('CONSEIL_SYNDICAL')
    ? ['DECISIONNAIRE', 'SIGNATAIRE']
    : []
}

/**
 * Le cas qui mérite un avertissement sans être interdit : un membre de conseil syndical qui signe
 * chez un syndic PROFESSIONNEL. Six contacts étaient dans ce cas le 13/09/2026 ; trois relevaient du
 * syndic bénévole (légitimes), trois étaient de vraies anomalies de reprise. D'où l'alerte à
 * l'écran plutôt que la contrainte en base, qui aurait effacé les trois premiers.
 */
export function conseilSyndicalQuiSigne(roles: readonly string[], segment: string | null | undefined): boolean {
  return (
    segment !== SEGMENT_SYNDIC_BENEVOLE &&
    roles.includes('CONSEIL_SYNDICAL') &&
    roles.includes('SIGNATAIRE')
  )
}

// ══ ANCIENNE COLONNE `role`, encore lue par les écrans non bascules ══

export const CONTACT_ROLES_SYNDIC = ['Décisionnaire', 'Administratif', 'Conseil syndical'] as const
export const CONTACT_ROLES_DEFAUT = ['Décisionnaire', 'Administratif'] as const

export function contactRoleOptions(segment: string | null | undefined): readonly string[] {
  return estSyndic(segment) ? CONTACT_ROLES_SYNDIC : CONTACT_ROLES_DEFAUT
}

/**
 * La traduction de l'ancienne colonne vers la nouvelle, pour les écrans qui écrivent encore `role`.
 *
 * « Décisionnaire » y voulait dire « signe et valide les contrats » — c'est écrit dans le
 * formulaire de création depuis son origine. Il donne donc les DEUX rôles : séparer les deux sens
 * d'un mot qui les portait tous les deux, c'est justement ce que William a demandé le 13/09/2026.
 */
export function rolesDepuisAncienRole(ancien: string | null | undefined): RoleContact[] {
  if (ancien === 'Décisionnaire') return ['DECISIONNAIRE', 'SIGNATAIRE']
  if (ancien === 'Administratif') return ['ADMINISTRATIF']
  if (ancien === 'Conseil syndical') return ['CONSEIL_SYNDICAL']
  return []
}

/**
 * La traduction de la nouvelle colonne vers l'ancienne, pour les écrans qui lisent encore `role`.
 *
 * L'ORDRE COMPTE : la conversion de piste, la conversion de signal et la liste des contacts
 * classent sur cette valeur unique. Un contact à la fois décisionnaire et administratif doit y
 * apparaître comme décisionnaire — c'est le rôle le plus haut qui décide du rang, pas l'ordre de
 * saisie. Disparaît avec la colonne, le jour où ces trois écrans liront `roles`.
 */
export function ancienRoleDepuisRoles(roles: readonly string[]): string | null {
  if (roles.includes('DECISIONNAIRE') || roles.includes('SIGNATAIRE')) return 'Décisionnaire'
  if (roles.includes('ADMINISTRATIF')) return 'Administratif'
  if (roles.includes('CONSEIL_SYNDICAL')) return 'Conseil syndical'
  return null
}
