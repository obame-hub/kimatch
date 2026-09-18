/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA TOUCHE DE COMMANDE, SELON LA MACHINE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « le raccourci ⌘K c'est sur mac, et sur windows ? »
 *
 * ══ IL MARCHAIT DÉJÀ, C'EST L'ÉTIQUETTE QUI MENTAIT ══
 *
 * `Topbar` écoute `e.metaKey || e.ctrlKey` : Ctrl + K ouvre donc la recherche sous Windows depuis
 * toujours. Mais la pastille affichait « ⌘K » en dur, c'est-à-dire un raccourci que la moitié de
 * l'équipe ne peut pas taper — Naoëlle travaille sous Windows, et rien à l'écran ne lui disait que
 * le geste existait pour elle.
 *
 * Une aide au raccourci qui affiche la mauvaise touche est pire que pas d'aide du tout : elle ne
 * révèle pas la fonction, et elle apprend un geste faux.
 *
 * ══ POURQUOI `userAgentData` D'ABORD ══
 *
 * `navigator.platform` est déprécié et figé par plusieurs navigateurs. `userAgentData.platform` est
 * ce que Chrome — le navigateur de l'équipe — rend de juste. On garde les deux autres en repli,
 * parce qu'une détection ratée ne doit pas laisser l'étiquette vide.
 *
 * EN CAS DE DOUTE, ON AFFICHE « Ctrl ». Windows est la plateforme majoritaire de l'équipe : se
 * tromper dans ce sens touche moins de monde, et un Mac reconnaît « Ctrl » comme une convention
 * d'ailleurs, là où un PC ne sait pas quoi faire d'un ⌘.
 */

function surMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const donnees = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const plateforme = donnees?.platform ?? navigator.platform ?? navigator.userAgent ?? ''
  return /mac|iphone|ipad|ipod/i.test(plateforme)
}

/** « ⌘ » sur un Mac, « Ctrl » partout ailleurs. */
export const TOUCHE_COMMANDE = surMac() ? '⌘' : 'Ctrl'

/** L'étiquette complète d'un raccourci — `raccourci('K')` rend « ⌘K » ou « Ctrl K ». */
export function raccourci(touche: string): string {
  return TOUCHE_COMMANDE === '⌘' ? `⌘${touche}` : `Ctrl ${touche}`
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * FAUT-IL OUVRIR LA PALETTE ?
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Sortie de `Topbar` pour être testable. C'est la décision la plus facile à casser sans s'en
 * apercevoir : une régression n'y produit pas d'erreur, elle ouvre un panneau au milieu d'une
 * saisie — ou n'ouvre plus rien, et personne ne sait dire depuis quand.
 *
 * ══ LES QUATRE REFUS, DANS L'ORDRE ══
 *
 * 1. UN MODIFICATEUR autre que celui de la commande : Ctrl + S enregistre, Alt + ← recule. Ces
 *    combinaisons appartiennent au navigateur et au système, on ne les détourne pas.
 * 2. UNE SAISIE EN COURS. La garde est celle que Kimatch écrivait déjà pour ses anciens raccourcis
 *    à une touche : sans elle, écrire « Cabinet » dans un formulaire ouvrirait la palette.
 * 3. UN PANNEAU DÉJÀ OUVERT. Un dialogue ou le sprint du Cockpit ont leur propre conduite ; une
 *    palette qui s'ouvrirait par-dessus volerait la frappe à celui qui l'attendait.
 * 4. UNE TOUCHE QUI N'ÉCRIT PAS. `key` vaut « a », « 7 » ou « é » quand on écrit, et « Tab »,
 *    « ArrowLeft », « F5 » sinon : la longueur 1 les sépare sans tenir une liste d'exclusions, qui
 *    serait fausse dès le premier clavier étranger.
 *
 * ⌘K / Ctrl K PASSE AVANT TOUT, sauf un panneau ouvert : c'est la seule porte qui fonctionne
 * pendant qu'on écrit dans un champ, puisqu'un modificateur ne tape aucun caractère.
 */
export interface FrappeObservee {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  /** Vrai quand la frappe part d'un champ, d'une zone de texte ou d'un contenu éditable. */
  dansUneSaisie?: boolean
  /** Vrai quand un dialogue ou un panneau modal est déjà à l'écran. */
  panneauOuvert?: boolean
}

export type OuverturePalette = 'commande' | 'frappe' | null

export function ouvertureDemandee(f: FrappeObservee): OuverturePalette {
  if (f.panneauOuvert) return null
  if ((f.metaKey || f.ctrlKey) && f.key.toLowerCase() === 'k') return 'commande'
  if (f.metaKey || f.ctrlKey || f.altKey) return null
  if (f.dansUneSaisie) return null
  if (f.key.length !== 1) return null
  return 'frappe'
}

/** Vrai quand l'élément visé écrit du texte — la garde reprise des anciens raccourcis. */
export function estUneSaisie(cible: EventTarget | null): boolean {
  const e = cible as HTMLElement | null
  return Boolean(e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)))
}
