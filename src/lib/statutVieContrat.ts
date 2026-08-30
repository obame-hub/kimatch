/**
 * OÙ EN EST UN CONTRAT DANS SA VIE : à venir, en cours, ou expiré.
 *
 * C'est une DÉDUCTION, pas une saisie. La règle a été vérifiée le 30/08/2026 contre la colonne
 * `contrats.statut_vie_id` telle qu'elle était remplie : **1 565 contrats sur 1 565, sans un seul
 * contre-exemple**. Personne ne choisit ce statut, il découle des deux dates.
 *
 * POURQUOI ON NE LIT PAS SIMPLEMENT LA COLONNE. Une valeur stockée vieillit en silence : un contrat
 * dont la date de fin est passée hier continue d'annoncer « En cours » jusqu'à ce que quelqu'un
 * réécrive la ligne — et rien ne la réécrit. Aucun déclencheur, aucune tâche planifiée. Déduite à
 * la lecture, la valeur ne peut pas dériver.
 *
 * LA MÊME RÈGLE EXISTE EN SQL, dans la vue `v_contrats_liste` (migration 20260831100000), pour que
 * la base puisse filtrer et compter dessus sans remonter les lignes. Deux écritures d'une seule
 * règle, c'est une dérive qui attend son heure : les tests de ce fichier épinglent les trois cas
 * et le cas limite du jour même, et la vue reprend le texte à l'identique.
 */

export type StatutVie = 'A_VENIR' | 'EN_COURS' | 'EXPIRE'

export const LIBELLE_STATUT_VIE: Record<StatutVie, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EXPIRE: 'Expiré',
}

/**
 * @param aujourdhui Le jour de référence, au format `AAAA-MM-JJ`. Injecté plutôt que lu dans
 *                   l'horloge : c'est ce qui rend la fonction testable, et ce qui évite qu'un
 *                   fuseau horaire décale la frontière d'un jour.
 */
export function statutVieContrat(
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined,
  aujourdhui: string = new Date().toISOString().slice(0, 10),
): StatutVie | null {
  // Sans date de début, le contrat n'a pas commencé à vivre : c'est le cas des 35 contrats encore
  // en phase de signature. Rendre « à venir » leur inventerait un avenir qu'aucune date ne porte.
  if (!dateDebut) return null

  // Comparaison de chaînes et non de dates : au format AAAA-MM-JJ, l'ordre alphabétique EST l'ordre
  // chronologique. Passer par `new Date()` réintroduirait les fuseaux — un contrat démarrant le 1er
  // du mois basculerait un jour trop tôt ou trop tard selon le navigateur.
  if (dateDebut.slice(0, 10) > aujourdhui) return 'A_VENIR'
  if (dateFin && dateFin.slice(0, 10) < aujourdhui) return 'EXPIRE'
  return 'EN_COURS'
}
