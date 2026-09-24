/**
 * ══ DIRE DE QUELLE COLONNE VIENT CHAQUE CHIFFRE ══
 *
 * William, 24/09/2026 : « au survol de chaque champ, j'aimerais que tu m'indiques les noms API du
 * style `marge_nette_coeff`. Car ce nom est différent du libellé visible sur l'écran et j'ai
 * l'impression qu'on ne parle pas toujours de la même chose. »
 *
 * ══ IL A RAISON, ET LE CAS D'ÉCOLE EST SUR LA FICHE RECOMMANDATION ══
 *
 * Elle affiche DEUX choses vertes appelées « Montant » :
 *   · l'encadré du héros, « Montant de l'affaire » ...... `recommandations.montant`
 *   · la capsule au bas de la calculatrice, « Montant » .. `recommandations.marge_nette_coeff`
 *
 * Deux colonnes, deux sens, deux verts, un seul mot. Aucun écran ne le disait.
 *
 * ══ POURQUOI UN `title` ET NON UNE PASTILLE ══
 *
 * Ce nom n'intéresse que celui qui doute. Affiché en permanence, il doublerait le nombre de mots à
 * l'écran pour une information dont on n'a besoin qu'une fois par trimestre. Au survol, il ne coûte
 * rien à personne et se trouve quand on le cherche.
 *
 * `data-champ` L'ACCOMPAGNE, et ce n'est pas décoratif : il rend l'annotation VÉRIFIABLE. Un
 * `document.querySelectorAll('[data-champ]')` dans la console dit ce qui est couvert et ce qui ne
 * l'est pas — sans lui, il faudrait survoler l'écran au hasard pour trouver les oublis.
 */
export function champBase(nom: string) {
  return { title: `${nom} — nom de la colonne en base`, 'data-champ': nom }
}
