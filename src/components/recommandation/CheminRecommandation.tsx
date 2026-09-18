import { FriseJalons, contexteDe, type Jalon } from '@/components/parcours/FriseJalons'
import { FINALITES_RECOMMANDATION, type CleFinalite } from '@/lib/finalitesRecommandation'
import {
  PictoBrouillon,
  PictoEnveloppe,
  PictoExpire,
  PictoLoupe,
  PictoRefuse,
  PictoValide,
} from '@/components/mandat/pictos'
import type { Recommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CHEMIN D'UNE RECOMMANDATION — LA FRISE DU MANDAT, COMME PARTOUT AILLEURS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « je ne vois plus le chemin de la recommandation !! Il faut absolument le
 * rajouter au-dessus des hero montant etc. »
 *
 * ══ CE N'EST PAS LE RAIL QUI EST REVENU ══
 *
 * Le même jour, plus tôt : « le cycle de recommandation est calculé automatiquement il doit donc
 * être masqué. La clôture doit se faire via un bouton prévu à cet effet. » Les deux demandes ne se
 * contredisent pas, elles séparent deux choses que l'ancien rail confondait :
 *
 *  · AGIR sur le dossier — avancer un statut, le clôturer. C'est ce qui est parti, et à juste
 *    titre : le statut du dossier est recalculé en base dès qu'une version change, personne ne le
 *    pose. La clôture, elle, a son bouton dans le bandeau.
 *  · VOIR où il en est et depuis quand. C'est ce qui manquait, et c'est ce fichier.
 *
 * D'où une frise en LECTURE SEULE : aucun nœud ne se clique. Un nœud cliquable promettrait de poser
 * un statut que la base calcule — exactement le désordre que Michel a demandé de supprimer le
 * 25/08/2026.
 *
 * ══ LA FRISE DU MANDAT, PAS UNE QUATRIÈME ══
 *
 * William, 16/09/2026, sur la piste : « tu dois reprendre le format de chemin présent sur le mandat
 * par exemple… là c'est une toute nouvelle frise et c'est pas ce que je veux ». La règle vaut ici :
 * ce fichier ne dessine rien, il dit seulement QUELS jalons une recommandation a.
 *
 * ══ QUATRE JALONS, ET DES DATES QU'ON N'INVENTE PAS ══
 *
 * `recommandations` ne date pas ses changements d'étape — `date_ouverture` et `date_creation` sont
 * la même chose, et il n'existe aucune date de passage en « Active ». Plutôt qu'un horodatage
 * inventé, chaque jalon est daté par LE FAIT qui le franchit, et ce fait existe vraiment en base :
 *
 *  1. Créée — le jour où le dossier est né.
 *  2. En consultation — le jour où sa PREMIÈRE VERSION a été créée. C'est le moment où le dossier
 *     devient du travail : avant, c'est une intention.
 *  3. Proposée — `date_presentation_client`, écrit par « Envoyer au client » depuis le hero. C'est
 *     le même fait qui déclenche la suggestion de relance : une seule vérité, deux lectures.
 *  4. L'issue — Acceptée, Refusée ou Expirée, avec sa couleur. Sans finalité, « Clôturée » tout
 *     court : 84 dossiers « À réactiver » ont une date de clôture et aucune finalité, et leur
 *     écrire « Acceptée » serait un mensonge.
 *
 * Un jalon franchi sans date s'affiche en gras, sans ligne de date — la frise sait déjà le faire.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function CheminRecommandation({ reco }: { reco: Recommandation }) {
  const finalite = (reco.finalite_cloture ?? null) as CleFinalite | null
  const estClose = reco.etape === 'CLOTUREE'

  /* La première version créée : c'est elle qui ouvre la consultation. On trie sur la date plutôt
     que sur le numéro — une version peut être supprimée, et V2 devient alors la plus ancienne. */
  const premiereVersion = [...reco.versions]
    .sort((a, b) => (a.date_creation ?? '').localeCompare(b.date_creation ?? ''))[0] ?? null

  /* La présentation au client, prise sur la version actuelle puis, à défaut, sur n'importe laquelle :
     un dossier dont la version présentée a été remplacée est TOUT DE MÊME passé par là. */
  /**
   * ══ QUELLE VERSION EST PARTIE CHEZ LE CLIENT ══
   *
   * William, 18/09/2026 : « à côté du statut proposé, indique la version qui a été proposée (donc la
   * dernière version envoyée) ».
   *
   * C'EST LA QUESTION QUE LE JALON LAISSAIT OUVERTE. « Proposée le 16/09 » sur un dossier à trois
   * versions ne dit pas laquelle : celle qu'on a sous les yeux, ou une précédente remplacée depuis ?
   * L'écart change tout — si la version affichée n'est pas celle qui est partie, le client répondra
   * sur autre chose que ce qu'on regarde.
   *
   * ON PREND LA DERNIÈRE ENVOYÉE, pas la version actuelle : une version présentée puis remplacée
   * reste ce que le client a reçu. Le tri se fait sur la date de présentation — c'est l'ordre des
   * envois, et il ne suit pas toujours le numéro de version.
   */
  const derniereProposee = reco.versions
    .filter((v) => v.date_presentation_client)
    .sort((a, b) => String(b.date_presentation_client).localeCompare(String(a.date_presentation_client)))[0] ?? null
  const datePresentation = derniereProposee?.date_presentation_client ?? null

  const issue = finalite ? FINALITES_RECOMMANDATION[finalite] : null

  const jalons: Jalon[] = [
    {
      cle: 'creee',
      libelle: 'Créée',
      picto: PictoBrouillon,
      franchi: true,
      date: reco.date_creation,
      /* L'AUTEUR N'EST PLUS ÉCRIT ICI. William, 18/09/2026 : « inutile de noter qui a créé, ça prend
         de la place verticalement pour rien ». Il a raison sur les deux termes : le nom pousse la
         ligne de contexte sur deux hauteurs quand il est long, et il ne décide de rien — le
         propriétaire du dossier se lit dans le bandeau, et l'historique dit qui a fait quoi. */
      contexte: contexteDe(reco.date_creation),
    },
    {
      cle: 'consultation',
      libelle: 'En consultation',
      picto: PictoLoupe,
      franchi: reco.versions.length > 0,
      date: premiereVersion?.date_creation ?? null,
      /* LE NOMBRE DE VERSIONS N'EST PLUS ÉCRIT (William, 18/09/2026). Il allongeait la ligne de date
         jusqu'au repli — donc une troisième ligne — pour un chiffre qui ne dit rien du chemin : on
         ne travaille jamais sur « trois versions », on travaille sur la dernière. */
      contexte: contexteDe(premiereVersion?.date_creation),
    },
    {
      cle: 'proposee',
      libelle: 'Proposée',
      picto: PictoEnveloppe,
      franchi: datePresentation != null,
      /* « À CÔTÉ de Proposée et non pas en dessous » (William, 18/09/2026) : la version part sur la
         ligne du libellé, où elle ne coûte pas de hauteur. Voir `marqueur` dans `FriseJalons`. */
      marqueur: derniereProposee
        ? (derniereProposee.numero_version != null ? `V${derniereProposee.numero_version}` : derniereProposee.nom)
        : null,
      date: datePresentation,
      contexte: contexteDe(datePresentation),
    },
    {
      cle: 'issue',
      libelle: issue?.libelle ?? 'Clôturée',
      picto: finalite === 'ACCEPTEE' ? PictoValide : finalite === 'REFUSEE' ? PictoRefuse : PictoExpire,
      franchi: estClose,
      couleur: issue?.couleur,
      date: estClose ? (reco.date_cloture ?? null) : null,
      /* LE MOTIF NE S'ÉCRIT PLUS ICI. Obligatoire à la saisie depuis le 16/08/2026, il fait souvent
         une phrase entière — collé à la ligne de date, il la faisait déborder sur une troisième
         ligne, celle que William ne veut pas. Il reste entier dans la carte de clôture, plus bas
         sur la fiche, où il a la largeur pour se lire. */
      contexte: estClose ? contexteDe(reco.date_cloture) : null,
    },
  ]

  return (
    <div className="rounded-km-lg border border-km-line bg-white px-4 py-3">
      <FriseJalons jalons={jalons} compact />
    </div>
  )
}
