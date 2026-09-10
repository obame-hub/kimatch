/**
 * ══ UN MONTANT EN EUROS S'ÉCRIT AU CENTIME, PARTOUT ══
 *
 * William, 10/09/2026 : « tu ne dois jamais arrondir les prix, ils doivent être rendus au centime
 * près, peu importe le champ ».
 *
 * ── POURQUOI CE FICHIER EXISTE ──
 *
 * La règle était déjà juste par endroits, et fausse ailleurs, parce qu'elle était RÉÉCRITE DOUZE
 * FOIS : douze fonctions `euros` locales, six comportements différents — `Math.round`,
 * `maximumFractionDigits: 0`, `: 2`, le style `currency`, et trois textes de remplacement distincts
 * pour une valeur absente. Une règle écrite douze fois n'est pas une règle, c'est une moyenne.
 *
 * Le vrai correctif n'était donc pas de corriger trente arrondis, mais de faire en sorte qu'il n'y
 * ait plus qu'un seul endroit où l'on puisse se tromper. Le prochain écran qui affiche un prix
 * importe d'ici, et hérite de la règle sans avoir à la connaître.
 *
 * ── CE QUI EST EN JEU, CONCRÈTEMENT ──
 *
 * Un montant est une commission ou une facture : il doit pouvoir se rapprocher d'un relevé. Deux
 * écritures du même montant sur un même écran — « 30 087,71 € » sous « 30 088 € » — font chercher
 * une différence qui n'existe pas. Et sur le rapprochement Salesforce, ce sont précisément les
 * écarts d'un centime que l'on traque : les arrondir revient à les effacer.
 *
 * ── CE QUI N'EST PAS UN PRIX N'EST PAS CONCERNÉ ──
 *
 * Les volumes en MWh et les pourcentages continuent de s'arrondir : « 227 MWh » se lit, « 227,00 MWh »
 * fait du bruit. La règle porte sur l'argent.
 */

/**
 * L'espace fine insécable (U+202F) des nombres français, pour que le « € » ne parte jamais seul
 * à la ligne. ÉCRITE EN ÉCHAPPEMENT ET NON EN DUR : le caractère est invisible dans un éditeur, et
 * un copier-coller malheureux le remplacerait par une espace ordinaire sans que personne ne le voie.
 */
const ESPACE = '\u202f'

/** Un montant en euros, toujours au centime : `1 234,56 €`. */
export function euros(v: number): string {
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ESPACE}€`
}

/**
 * Le même, quand la valeur peut manquer.
 *
 * LE TEXTE DE REMPLACEMENT EST UN CHOIX D'ÉCRAN, PAS UNE VALEUR PAR DÉFAUT : un tiret dit « rien à
 * afficher », « à vérifier » dit « quelqu'un doit aller voir ». Les deux existaient déjà dans le
 * code, ils restent à la main de l'appelant.
 */
export function eurosOu(v: number | null | undefined, remplacement = '—'): string {
  return v == null ? remplacement : euros(v)
}

/**
 * Un montant suivi d'une unité autre que l'euro seul — `12,34 €/MWh`, `4,50 c€/kWh`.
 *
 * Deux décimales aussi : sur un prix unitaire, le centime pèse d'autant plus qu'il se multiplie
 * ensuite par un volume annuel.
 */
export function montantAvecUnite(v: number, unite: string): string {
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${ESPACE}${unite}`
}
