import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * OUVRIR LE FORMULAIRE DE CRÉATION D'UN ÉCRAN DEPUIS N'IMPORTE OÙ.
 *
 * Naoëlle, 31/08/2026 : « je veux que dans toutes les vues tu remettes le bouton créer qui
 * permettait de créer tous les objets depuis n'importe quelle vue, c'est la seule demande qui
 * diffère des maquettes ».
 *
 * ── POURQUOI UN SEUL MÉCANISME ──────────────────────────────────────────────────────────────
 *
 * Il en existait TROIS, sur quatre écrans seulement :
 *
 *   /comptes?nouveau=1                                    un paramètre d'adresse
 *   /sites   avec state { openCreateForCompteId: '…' }    un état de navigation
 *   /contacts avec state { openCreate: true }             un autre état de navigation
 *
 * Les dix autres écrans n'avaient rien. Un menu global ne peut pas s'appuyer sur trois
 * conventions dont deux invisibles dans l'adresse — et un état de navigation ne survit ni au
 * rechargement, ni à un lien collé dans une conversation.
 *
 * D'où `?creer=1`, écrit dans l'adresse : il est partageable, il survit à un F5, et il se voit.
 *
 * LE PARAMÈTRE S'EFFACE DÈS QU'IL A SERVI. Sans cela, fermer le formulaire puis revenir en
 * arrière le réouvrirait — et l'adresse resterait indéfiniment celle d'une création en cours.
 */
export function useOuvrirCreation(ouvrir: () => void) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('creer') !== '1') return
    ouvrir()
    params.delete('creer')
    const reste = params.toString()
    navigate(location.pathname + (reste ? '?' + reste : ''), { replace: true })
    // `ouvrir` est recréé à chaque rendu par la plupart des appelants (c'est une fonction fléchée
    // écrite sur place). L'inclure ici relancerait l'effet en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.pathname])
}

/**
 * LES OBJETS QU'ON PEUT CRÉER, ET L'ÉCRAN QUI PORTE LEUR FORMULAIRE.
 *
 * L'ordre est celui du cycle métier, pas l'alphabet : on part du patrimoine — le client, ses
 * lieux, ses points de livraison — puis on remonte la chaîne commerciale. C'est l'ordre dans
 * lequel quelqu'un qui découvre l'application comprend ce qui dépend de quoi.
 *
 * `contrat` n'y est pas : il se crée depuis la recommandation qui l'a produit, ou depuis la fiche
 * du compte, et il exige de choisir ses compteurs — un formulaire ouvert d'ici demanderait aussitôt
 * « sur quel dossier ? ».
 *
 * `compteur`, LUI, Y EST REVENU LE 10/09/2026. Voir le commentaire de son entrée ci-dessous : le
 * retrait de l'objet site en a fait le geste qui pose l'adresse.
 */
export const OBJETS_CREABLES = [
  /* La création d'un compte est un ÉCRAN à part entière — un parcours en plusieurs étapes — et non
     un formulaire dans un dialogue. `direct: true` dit au menu d'y aller sans ajouter `?creer=1` :
     le paramètre ne servirait à rien, l'écran EST le formulaire. */
  { cle: 'compte', libelle: 'Compte', chemin: '/comptes/nouveau', touche: 'C', direct: true },
  /* PLUS DE « CRÉER UN SITE ». Retiré le 09/09/2026 avec l'objet lui-même : un site n'est plus
     quelque chose qu'on crée, c'est le regroupement d'adresse que la création d'un compteur
     produit toute seule. Proposer « Site » ici invitait à créer un dossier vide avant d'avoir le
     moindre point de livraison à y mettre — l'erreur exacte que la réunion voulait supprimer.

     MAIS « COMPTEUR » REVIENT, ET C'EST LA CONSÉQUENCE DIRECTE. Naoëlle, 10/09/2026 : « est-ce que
     tu peux remettre le bouton de création de compteurs, car maintenant que site n'existe plus il
     faut quand même créer le compteur avec son libellé de site. »

     Elle a raison, et l'ancien commentaire de ce fichier disait le contraire : « un compteur se
     crée depuis la fiche de son site ». Cette phrase est morte avec l'écran qu'elle désignait. La
     création n'existait plus que sur la fiche d'un compte — il fallait donc déjà savoir chez quel
     client poser le PDL, et y aller, avant de pouvoir le créer.

     C'est précisément le geste que le retrait du site rend central : c'est LA création d'un
     compteur qui pose désormais le libellé de site, l'adresse et le groupe d'adresse (déclencheur
     `trg_compteur_herite_de_son_site`, migration 20260910140000). */
  { cle: 'compteur', libelle: 'Compteur', chemin: '/compteurs', touche: 'L' },
  { cle: 'contact', libelle: 'Contact', chemin: '/contacts', touche: 'T' },
  { cle: 'piste', libelle: 'Piste', chemin: '/prospection', touche: 'P' },
  { cle: 'opportunite', libelle: 'Opportunité', chemin: '/opportunites', touche: 'O' },
  { cle: 'recommandation', libelle: 'Recommandation', chemin: '/recommandations', touche: 'R' },
  { cle: 'mandat', libelle: 'Mandat', chemin: '/mandats', touche: 'M' },
  { cle: 'requete', libelle: 'Requête', chemin: '/requetes', touche: 'Q' },
  { cle: 'tache', libelle: 'Tâche', chemin: '/taches', touche: 'A' },
  { cle: 'echange', libelle: 'Échange', chemin: '/interactions', touche: 'E' },
  { cle: 'document', libelle: 'Document', chemin: '/documents', touche: 'D' },
] as const

export type ObjetCreable = (typeof OBJETS_CREABLES)[number]['cle']
