import { useEffect, useState } from 'react'

/**
 * Attend que la frappe se pose avant de laisser partir une requete.
 *
 * Ecrit d'abord pour la recherche globale : sans cela, « duran » lancait sept requetes par lettre,
 * vingt-huit en vol qui se mettaient en file et rendaient chacune lente -- environ 850 ms mesurees,
 * identiques sur les sept tables, ce qui trahissait l'attente et non le cout de la recherche.
 *
 * Sorti dans son propre fichier le 15/08/2026 : les listes servies par la base en ont le meme
 * besoin, chaque lettre y declenchant sinon une requete complete.
 */
export function useFrappePosee(valeur: string, delai = 250): string {
  const [posee, setPosee] = useState(valeur)
  useEffect(() => {
    const t = setTimeout(() => setPosee(valeur), delai)
    return () => clearTimeout(t)
  }, [valeur, delai])
  return posee
}
