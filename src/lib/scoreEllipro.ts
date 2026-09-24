/**
 * ══ LA COULEUR D'UN SCORE ELLIPRO ══
 *
 * William, 24/09/2026 : « l'affichage du score Ellipro doit avoir une couleur conditionnée —
 * 0, 1 ou 2 rouge ; 3 à 6 jaune ; 7 à 10 vert ».
 *
 * ══ TROIS BANDES ET NON QUATRE, ET C'EST UN CHANGEMENT ══
 *
 * La carte de la fiche compte en portait quatre, reprises de Tools : Excellent ≥ 8, Bon ≥ 6,
 * Moyen ≥ 4, Fragile en dessous. Les seuils de William ne s'y superposent pas — un 6 y était
 * « Bon », donc verdâtre, il devient jaune ; un 7 y était « Bon » aussi, il devient franchement
 * vert. Ce n'est pas un détail d'affichage : c'est l'endroit où l'on coupe entre « on y va » et
 * « on regarde à deux fois ».
 *
 * ══ UNE SEULE DÉFINITION POUR TOUT KIMATCH ══
 *
 * Le score se montre à deux endroits — la carte de la fiche compte et l'étape 3 du parcours de
 * création. Deux barèmes auraient fait qu'un même 6 soit vert ici et jaune là, sur le même
 * dossier, le même jour. C'est le genre d'écart qui fait douter du chiffre lui-même.
 *
 * LES CLASSES DE DÉGRADÉ RESTENT POUR LA CARTE, qui les employait déjà ; les jetons `km-*` servent
 * au parcours, dont le vocabulaire est plat. Même bande, deux habillages — et un seul endroit où
 * l'on change d'avis.
 */

export type BandeScore = 'rouge' | 'jaune' | 'vert'

export interface PalierScore {
  bande: BandeScore
  libelle: string
  /** Pour la carte de la fiche compte : ses dégradés d'origine. */
  from: string
  to: string
  bg: string
  ring: string
  text: string
  /** Pour le parcours : la teinte pleine, en jetons Kimatch. */
  texteToken: string
  bordureToken: string
  fondToken: string
}

const PALIERS: Record<BandeScore, PalierScore> = {
  vert: {
    bande: 'vert', libelle: 'Bon',
    from: 'from-emerald-500', to: 'to-teal-600', bg: 'from-emerald-500/10',
    ring: 'ring-emerald-500/30', text: 'text-emerald-700',
    texteToken: 'text-km-green', bordureToken: 'border-km-green-line', fondToken: 'bg-km-green-tint',
  },
  jaune: {
    bande: 'jaune', libelle: 'Moyen',
    from: 'from-amber-400', to: 'to-amber-600', bg: 'from-amber-500/10',
    ring: 'ring-amber-500/30', text: 'text-amber-700',
    texteToken: 'text-km-amber', bordureToken: 'border-km-amber-line', fondToken: 'bg-km-amber-soft',
  },
  rouge: {
    bande: 'rouge', libelle: 'Risqué',
    from: 'from-red-500', to: 'to-rose-600', bg: 'from-red-500/10',
    ring: 'ring-red-500/30', text: 'text-red-700',
    texteToken: 'text-km-red', bordureToken: 'border-km-red-line', fondToken: 'bg-km-red-soft',
  },
}

/**
 * Le palier d'un score.
 *
 * ON ARRONDIT AVANT DE COMPARER : Ellisphere rend parfois une décimale, et un 6,5 doit tomber d'un
 * côté ou de l'autre de façon prévisible — 7 ici, donc vert. Sans arrondi, `>= 7` le laisserait en
 * jaune alors que l'écran affiche « 7 » juste à côté.
 */
export function palierScoreEllipro(score: number): PalierScore {
  const n = Math.round(score)
  if (n >= 7) return PALIERS.vert
  if (n >= 3) return PALIERS.jaune
  return PALIERS.rouge
}

/** Le score tel qu'Ellisphere le rend — une chaîne — ramené à un nombre, ou `null`. */
export function scoreEnNombre(score: string | number | null | undefined): number | null {
  if (score === null || score === undefined || score === '') return null
  const n = typeof score === 'number' ? score : Number(String(score).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
