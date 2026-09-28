/**
 * ══ LA RECHERCHE DES LISTES DU COCKPIT ══
 *
 * CHAQUE MOT DOIT SE TROUVER QUELQUE PART, sans ordre ni accent : « victor rue » trouve « 12 rue
 * Victor Hugo », « gerance » trouve « Gérance ».
 *
 * UN NUMÉRO SE CHERCHE COMME ON LE TAPE : « 0612 » trouve « 06 12 34 56 78 ». Les chiffres des
 * champs sont donc aussi comparés une fois débarrassés de leurs espaces et de leurs points.
 */
export function normaliser(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function correspond(champs: (string | null | undefined)[], requete: string): boolean {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return true
  const texte = champs.filter(Boolean).join(' ')
  const cible = `${normaliser(texte)} ${texte.replace(/\D/g, '')}`
  return mots.every((m) => cible.includes(m))
}
