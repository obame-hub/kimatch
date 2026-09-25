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
// `role` (singulier) est l'ancienne colonne, encore écrite mais plus lue par aucun écran.
// `roles` (tableau) est la nouvelle.
//
// DEPUIS LE 14/09/2026, TROIS RÔLES SUR QUATRE NE SE SAISISSENT PLUS. La base les déduit des faits
// (`fn_roles_contact`) : décisionnaire si un compteur le désigne responsable, signataire si un
// mandat ou un contrat porte son nom, conseil syndical si un compteur le désigne relais. Seul
// ADMINISTRATIF reste un choix, et il ne survit à aucun fait contraire.
//
// La règle du syndic bénévole — « un membre CS y est forcément décisionnaire et signataire » — a
// disparu d'ici pour la même raison : elle est désormais VRAIE PAR CONSTRUCTION. Dans une
// copropriété qui se gère elle-même, le conseil syndical porte les compteurs et signe les contrats,
// donc les faits lui donnent les deux rôles sans qu'on ait à les forcer.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ LE CINQUIÈME RÔLE, ET LE SECOND CHOIX HUMAIN ══
 *
 * William, 15/09/2026 : « tous les contacts que le commercial identifie comme un potentiel
 * décisionnaire mais pour lequel nous ne disposons actuellement d'aucun périmètre ».
 *
 * DÉCISIONNAIRE POTENTIEL EST EXCLUSIF D'ADMINISTRATIF, comme Administratif l'est des faits : la
 * conversion remplace, elle n'ajoute pas. Cumuler les deux ferait réapparaître le contact dans deux
 * bandes de l'onglet Contacts — le défaut même que la règle du 14/09 a supprimé.
 *
 * ET IL NE SURVIT PAS AU FAIT QU'IL ANNONÇAIT : dès qu'un compteur désigne ce contact responsable,
 * la base le passe DECISIONNAIRE et efface le potentiel (`fn_roles_contact`, migration
 * 20260915090000). Un potentiel réalisé n'a plus à être annoncé.
 */
export const ROLES_CONTACT = [
  'DECISIONNAIRE',
  'SIGNATAIRE',
  'ADMINISTRATIF',
  'DECISIONNAIRE_POTENTIEL',
  'CONSEIL_SYNDICAL',
] as const

export type RoleContact = (typeof ROLES_CONTACT)[number]

export const LIBELLE_ROLE: Record<RoleContact, string> = {
  DECISIONNAIRE: 'Décisionnaire',
  SIGNATAIRE: 'Signataire',
  ADMINISTRATIF: 'Administratif',
  DECISIONNAIRE_POTENTIEL: 'Décisionnaire potentiel',
  CONSEIL_SYNDICAL: 'Conseil syndical',
}

export const AIDE_ROLE: Record<RoleContact, string> = {
  DECISIONNAIRE: 'Tranche et engage le compte',
  SIGNATAIRE: 'Signe les mandats et les contrats',
  ADMINISTRATIF: 'Technique, juridique, comptabilité, assistanat',
  DECISIONNAIRE_POTENTIEL: 'Décide probablement, mais aucun périmètre ne le prouve encore',
  CONSEIL_SYNDICAL: 'Représente les copropriétaires — ne contractualise pas',
}

const SEGMENTS_SYNDIC = new Set(['Syndic professionnel', 'Syndic non professionnel'])

/** Le syndic bénévole : la copropriété est son propre syndic, il n'y a pas de cabinet. */
export const SEGMENT_SYNDIC_BENEVOLE = 'Syndic non professionnel'

export function estSyndic(segment: string | null | undefined): boolean {
  return !!segment && SEGMENTS_SYNDIC.has(segment)
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES DEUX FAMILLES QU'UN COMPTEUR DISTINGUE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « un contact "Membre CS" c'est important notamment pour rendre éligible
 * dans l'affiliation CS à un compteur de ne proposer que des Membres CS et non pas des contacts
 * classiques, et inversement pour le responsable. »
 *
 * Un compteur a DEUX fentes, et elles ne veulent pas dire la même chose :
 *
 *   · `responsable_contact_id`        le gestionnaire du cabinet — celui qui décide et qui signe
 *   · `contact_conseil_syndical_id`   le relais côté copropriété — un copropriétaire élu
 *
 * Les mélanger n'est pas une faute de saisie sans conséquence : c'est le relais du conseil syndical
 * qui fait la différence entre un compteur « couvert » et un compteur qu'un concurrent peut
 * emporter avec le cabinet, et c'est sur lui que reposent les relances et l'emailing.
 *
 * LE CHOIX EST EXCLUSIF, et c'est pour cela qu'un seul prédicat suffit : une personne est membre du
 * conseil syndical, ou elle ne l'est pas. La base garantit d'ailleurs qu'elle ne peut pas occuper
 * les deux fentes du même compteur (contrainte du 13/09/2026).
 */

/** Vrai pour un membre du conseil syndical — choisi à la création, ou relais d'un compteur. */
export function estMembreConseilSyndical(contact: { roles?: readonly string[] | null }): boolean {
  return (contact.roles ?? []).includes('CONSEIL_SYNDICAL')
}

/**
 * Les contacts qu'une fente de compteur accepte.
 *
 * `dejaChoisi` EST TOUJOURS GARDÉ, même s'il ne passe pas le filtre. Sans cela, un compteur dont le
 * responsable se trouve aussi être membre du conseil syndical — il y en a, la contrainte ne
 * l'interdit que sur le même compteur — afficherait un champ VIDE, et le premier enregistrement
 * effacerait la valeur sans que personne ne l'ait demandé. C'est le piège déjà rencontré sur la
 * civilité le 14/09/2026, et il se referme exactement de la même façon.
 */
export function contactsPourLaFente<T extends { id: string; roles?: readonly string[] | null }>(
  contacts: T[],
  fente: 'responsable' | 'conseilSyndical',
  dejaChoisi?: string | null,
): T[] {
  return contacts.filter((c) => {
    if (dejaChoisi && c.id === dejaChoisi) return true
    return fente === 'conseilSyndical' ? estMembreConseilSyndical(c) : !estMembreConseilSyndical(c)
  })
}
