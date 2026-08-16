import { useEffect } from 'react'

/**
 * Raccourcis clavier 1…9 pour changer d'onglet sur une fiche.
 *
 * Présent à l'identique sur chaque écran des maquettes de William, qui l'annonce dans la barre
 * d'onglets (« 1–5 pour naviguer »). C'est un geste de personne qui passe sa journée dans
 * l'outil : on ne vise pas un onglet à la souris quarante fois par jour.
 *
 * La garde sur INPUT / TEXTAREA / contenteditable est reprise telle quelle du design, et elle
 * n'est pas cosmétique : sans elle, taper « 2 » dans une puissance ou dans une note ferait
 * sauter d'onglet et perdrait la saisie en cours. L'édition en place ayant été généralisée le
 * 16/08/2026, il y a désormais des champs de saisie sur presque toute la surface des fiches.
 *
 * Les combinaisons avec Ctrl / Alt / Meta sont laissées au navigateur : Ctrl+1 change d'onglet
 * navigateur, on ne le détourne pas.
 */
export function useRaccourcisOnglets<T extends string>(cles: readonly T[], choisir: (cle: T) => void) {
  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const cible = e.target as HTMLElement | null
      if (cible) {
        const balise = cible.tagName
        if (balise === 'INPUT' || balise === 'TEXTAREA' || balise === 'SELECT' || cible.isContentEditable) return
      }
      const rang = Number(e.key)
      if (!Number.isInteger(rang) || rang < 1 || rang > cles.length) return
      choisir(cles[rang - 1])
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
    // `cles` est recréé à chaque rendu par les pages : on dépend de son contenu, pas de son
    // identité, sinon l'écouteur se réabonne à chaque frappe.
  }, [cles.join('|'), choisir]) // eslint-disable-line react-hooks/exhaustive-deps
}
