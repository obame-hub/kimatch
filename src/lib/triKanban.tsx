import { useCallback, useEffect, useState } from 'react'
import { MenuChoix } from '@/components/ui/menu-choix'

/**
 * LE TRI D'UNE VUE KANBAN.
 *
 * LA DEMANDE (Naoëlle, 28/08/2026) : « un système de tri et de filtre sur toutes les vues kanban ».
 * Elle avait demandé trois jours plus tôt d'ENLEVER le tri de ces mêmes écrans — « le filtre par
 * étape et le tri appartenaient à la liste ». La seconde consigne remplace la première : ce qui
 * gênait, c'était de trier des COLONNES, pas de trier les cartes à l'intérieur d'une colonne.
 *
 * POURQUOI CE N'EST PAS UN `sort()` SUR LES CARTES DÉJÀ AFFICHÉES. Deux de ces quatre tableaux
 * (Recommandations, Pricing) ne chargent que DIX cartes par colonne, choisies par la base. Trier à
 * l'arrivée réordonnerait un échantillon : la carte la plus en retard resterait invisible parce
 * qu'onzième, et le tri donnerait l'illusion d'avoir regardé toute la colonne. Le tri part donc en
 * base pour ces deux-là, et reste local pour les deux autres, qui chargent tout.
 *
 * Comme la bascule de périmètre, le choix survit au rechargement et il est propre à chaque écran.
 */

export interface OptionTri {
  /** Ce que l'écran en fait : un nom de colonne en base, ou une clé de comparateur local. */
  cle: string
  libelle: string
  /** Croissant par défaut. Un montant se lit du plus gros au plus petit, une échéance l'inverse. */
  ascendant?: boolean
}

const PREFIXE = 'kimatch-tri-'

export function useTriKanban(cle: string, options: OptionTri[]) {
  const cleStockage = PREFIXE + cle
  const defaut = options[0]

  const [choix, setChoixEtat] = useState<string>(() => {
    try {
      const garde = localStorage.getItem(cleStockage)
      // Un tri mémorisé qui n'existe plus — colonne renommée, option retirée — retombe sur le
      // défaut plutôt que de laisser l'écran demander à la base une colonne inconnue.
      return garde && options.some((o) => o.cle === garde) ? garde : defaut.cle
    } catch {
      return defaut.cle
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(cleStockage, choix)
    } catch {
      /* tant pis : le choix vaudra pour la session */
    }
  }, [cleStockage, choix])

  const setChoix = useCallback((v: string) => setChoixEtat(v), [])
  const option = options.find((o) => o.cle === choix) ?? defaut

  return {
    tri: option.cle,
    ascendant: option.ascendant ?? true,
    setTri: setChoix,
    options,
  }
}

/**
 * Le sélecteur. Volontairement un `<select>` natif et non un menu dessiné : il se manipule au
 * clavier sans qu'on ait rien à écrire, il s'ouvre correctement sur téléphone, et il n'a jamais
 * besoin d'être refermé à la main.
 */
export function SelecteurTri({
  valeur,
  onChange,
  options,
}: {
  valeur: string
  onChange: (v: string) => void
  options: OptionTri[]
}) {
  return (
    /* Le `<select>` natif est parti : ouvert, il affichait la liste blanche à coins droits et la
       ligne bleue du système, que le navigateur dessine hors de la page et qu'aucune règle CSS
       n'atteint. Voir `MenuChoix`. */
    <MenuChoix
      valeur={valeur}
      onChange={onChange}
      ariaLabel="Trier les cartes"
      choix={options.map((o) => ({ valeur: o.cle, libelle: 'Trier par ' + o.libelle }))}
    />
  )
}
