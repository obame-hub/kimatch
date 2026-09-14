/**
 * ══ QUI A LE DROIT DE DIRE « OUVERT » ══
 *
 * William, 14/09/2026 : « tracker quand ils lisent l'email ». Le pixel de suivi compte les
 * ouvertures (migration 20260914210000) ; ce fichier décide de ce qu'on en montre.
 *
 * ══ LA RÈGLE S'EST TROMPÉE UNE FOIS, ET VOICI POURQUOI ══
 *
 * Premier jet, dans le composant : `sens === 'SORTANT'` puis `nb_ouvertures !== null`, avec en
 * commentaire « `null` sur tout ce qui n'est pas suivi ». C'était faux de ma propre main — la
 * migration déclare `nb_ouvertures integer NOT NULL DEFAULT 0`. Les 20 731 appels valaient donc 0
 * comme un mail jamais ouvert, et un appel sortant EST de sens SORTANT.
 *
 * Naoëlle l'a vu tout de suite sur sa fiche contact : « pas encore ouvert » sous ses appels
 * téléphoniques. Mesuré après coup : 1 interaction sur 29 951 sortantes porte réellement un pixel.
 *
 * LA SEULE CONDITION EST `ouverture_suivie`, colonne calculée en base depuis la présence du jeton.
 * Elle ne dit que oui ou non ; le jeton, lui, ne sort jamais de la base — c'est le secret qui
 * permet de compter une ouverture, il n'a rien à faire dans un navigateur.
 *
 * ══ ON ÉCRIT « OUVERT », JAMAIS « LU » ══
 *
 * Gmail recopie les images sur ses serveurs et les précharge parfois avant que la personne ouvre le
 * message ; un client qui bloque les images ne comptera jamais, même après lecture ; et l'expéditeur
 * qui relit son propre envoi compte aussi. Dire « lu » ferait prendre un indice pour une preuve, et
 * c'est sur ce genre de certitude qu'on relance un client qui n'a rien vu.
 *
 * ET « PAS ENCORE OUVERT » N'EST PAS « IGNORÉ » : l'absence ne prouve rien. On l'affiche quand même,
 * parce qu'un envoi sans nouvelle depuis huit jours est une information — mais sans alarme.
 */
import type { Interaction } from '@/types/domain'

export function mentionOuverture(i: Interaction | undefined): string | null {
  if (!i?.ouverture_suivie) return null

  // La colonne est NOT NULL en base ; le `?? 0` ne sert qu'au typage de la réponse réseau.
  const combien = i.nb_ouvertures ?? 0
  if (combien === 0) return 'pas encore ouvert'

  const quand = i.derniere_ouverture_le
    ? new Date(i.derniere_ouverture_le).toLocaleDateString('fr-FR')
    : null
  const fois = combien > 1 ? `ouvert ${combien} fois` : 'ouvert'
  return quand ? `${fois}, le ${quand}` : fois
}
