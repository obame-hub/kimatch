import { useEffect } from 'react'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'IL RESTE DE LA BARRE DU HAUT : LE NOM DE L'ONGLET
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « tu dois supprimer la zone du haut […] tout l'intérêt était de supprimer
 * cette zone en haut qui n'avait aucune valeur ajoutée et qui prenait de la place verticalement ».
 *
 * La barre coûtait 52 px de hauteur sur chacun des 42 écrans qui la montaient. Ce qu'elle portait a
 * trouvé une meilleure place : la recherche et la création sont dans le rail et dans les bandeaux de
 * fiche, la déconnexion sous le profil, et le fil d'Ariane était en DOUBLE sur toutes les fiches —
 * la barre annonçait « Pistes / SYNDIC RESIDENCE SERVICES » vingt pixels au-dessus d'un bandeau qui
 * disait déjà le même nom.
 *
 * ══ UNE SEULE CHOSE N'AVAIT PAS DE REMPLAÇANT ══
 *
 * Le titre de l'onglet du navigateur. Les trente-huit écrans annonçaient tous « Kimatch », le seul
 * `<title>` de `index.html` : cinq onglets ouverts côte à côte donnaient cinq étiquettes identiques,
 * impossible de retrouver la fiche qu'on venait de laisser autrement qu'en cliquant dessus une par
 * une. L'historique et les favoris souffraient du même mal.
 *
 * C'est la barre qui le calculait. Ce composant ne fait plus que ça, et ne dessine RIEN — il garde
 * la même signature qu'elle pour que le remplacement soit un renommage, page par page, sans
 * déplacer d'appel ni risquer un ordre de hooks.
 *
 * LE FIL D'ARIANE NE S'AJOUTE QUE S'IL APPORTE QUELQUE CHOSE : « ACME SAS · Comptes · Kimatch », et
 * non « Comptes · Comptes · Kimatch ».
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function TitreOnglet({ title, crumb }: { title: string; crumb?: string }) {
  useEffect(() => {
    const morceaux = [title, crumb === title ? null : crumb, 'Kimatch'].filter(Boolean)
    document.title = morceaux.join(' · ')
  }, [title, crumb])

  return null
}
