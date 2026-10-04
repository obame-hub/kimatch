/**
 * LES TABLEAUX DE LA PROPOSITION, AFFICHÉS DANS LA FICHE — William, 04/10/2026 : dans la version
 * publiée, les onglets Comparatif, Détail et Clauses montrent les tableaux « tel qu'ils s'affichent »
 * dans le PDF, « exactement pareil ».
 *
 * Ils ne sont donc pas redessinés : on rend le document même du PDF (`htmlOffre`) et l'on en extrait
 * le tableau voulu, repéré par `data-bloc` dans les gabarits. Une retouche du modèle se voit aux deux
 * endroits à la fois, et aucun écart ne peut naître entre ce que voit le commercial et ce que reçoit
 * le client.
 */
export type BlocOffre = 'comparatif' | 'prix' | 'clauses'

/** La largeur d'un tableau dans la page A4 : 210 mm moins les marges de la page (2 × 32 px). */
export const LARGEUR_BLOC = 730

export function htmlBloc(complet: string, bloc: BlocOffre): string | null {
  const doc = new DOMParser().parseFromString(complet, 'text/html')
  const el = doc.querySelector(`[data-bloc="${bloc}"]`)
  if (!el) return null
  const style = doc.querySelector('style')?.textContent ?? ''
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${style}
html,body{background:transparent!important;overflow:hidden}body{padding:1px}</style></head>`
    + `<body><div style="width:${LARGEUR_BLOC}px;font-variant-numeric:tabular-nums">${el.outerHTML}</div></body></html>`
}
