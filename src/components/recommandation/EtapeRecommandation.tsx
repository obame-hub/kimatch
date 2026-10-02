import { useState } from 'react'
import { contexteDe, type Jalon } from '@/components/parcours/FriseJalons'
import { FINALITES_RECOMMANDATION, type CleFinalite } from '@/lib/finalitesRecommandation'
import { ChevronDown, Lock, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
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
 * L'ÉTAPE D'UNE RECOMMANDATION — UNE PASTILLE DANS L'EN-TÊTE, PLUS UNE FRISE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 02/10/2026 : « supprime le chemin. Ajoute simplement l'étape de ce chemin dans le
 * header. Cela te permet de remonter tous les autres blocs. »
 *
 * LA FRISE EST PARTIE, SES QUATRE JALONS RESTENT : ils disent toujours quelle étape afficher — la
 * dernière franchie — et ce qu'on peut y faire. LES GESTES NE SONT PAS PERDUS : la pastille ouvre un
 * petit menu qui propose exactement les clics que la frise offrait (remettre au brouillon, rouvrir,
 * marquer proposée, revenir en consultation, clôturer, rendre au calcul). Les retirer aurait rendu
 * impossible ce que William avait demandé le 21/09 — poser une étape à la main.
 *
 * L'histoire de la frise, telle qu'elle a été construite, suit.
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
 * ══════════ LE CHEMIN SE CLIQUE — ET SEULEMENT LÀ OÙ IL Y A QUELQUE CHOSE À POSER ══════════
 *
 * William, 21/09/2026 : « laisse la possibilité à un commercial, dans le chemin du haut de la page,
 * de passer d'une étape à une autre à la main, en cliquant sur l'étape en question ».
 *
 * CELA REVIENT SUR SA DEMANDE DU 18/09 — « le cycle est calculé automatiquement, il doit être
 * masqué » — et c'est cohérent : ce qu'il faisait retirer, c'était le rail où l'on posait un statut
 * de VERSION en double du reste de la fiche. Ce qui revient, c'est la main sur l'ÉTAPE du dossier,
 * quand le calcul de la base se trompe.
 *
 * ══ DEUX JALONS SUR QUATRE SE CLIQUENT, ET LE TROISIÈME OUVRE LA CLÔTURE ══
 *
 *  · « Créée » pose Brouillon, « En consultation » pose Active — ce sont deux étapes réelles, et
 *    cliquer « En consultation » est le geste qui ROUVRE un dossier endormi.
 *  · « L'issue » ne s'écrit pas d'un clic : clôturer réclame une finalité et un motif obligatoire
 *    (règle du 16/08/2026). Le nœud ouvre donc le panneau de clôture, comme le bouton du bandeau.
 *  · « Proposée » SE CLIQUE AUSSI, et j'avais eu tort de la laisser inerte. Je l'avais exclue parce
 *    que ce n'est pas une étape mais un FAIT — la date où la proposition est partie chez le client.
 *    William, 21/09/2026 : « pourquoi je ne peux pas cliquer sur Proposée ? C'est l'évolution que je
 *    t'ai demandée. »
 *
 *    IL A RAISON, ET POUR UNE RAISON QUE MA DISTINCTION MASQUAIT : une proposition envoyée depuis
 *    la boîte mail du commercial, sans passer par « Envoyer au client », n'est datée nulle part. Le
 *    dossier reste alors éternellement « en consultation », et surtout LA RELANCE NE PART JAMAIS —
 *    elle repose entièrement sur cette date. Le clic n'invente pas un statut : il consigne un fait
 *    qui a eu lieu ailleurs, ce que Kimatch ne peut pas deviner.
 *
 * ══ UN CHOIX MANUEL TIENT TOUJOURS ══
 *
 * William, 21/09/2026. `recalculer_statut_recommandation` reprenait l'étape à chaque mouvement de
 * version : un dossier remis en Active rebasculait tout seul, sans que personne comprenne pourquoi.
 * Depuis la migration du même jour, poser une étape à la main écrit `date_etape_manuelle`, et le
 * calcul s'arrête net tant qu'elle existe.
 *
 * LA MAIN REND LA MAIN, et ça se voit : un dossier figé le dit sous le chemin, avec le geste qui le
 * rend au calcul. Sans cette sortie, un dossier figé par erreur le resterait pour toujours — une
 * règle qui « tient toujours » a besoin d'une porte, sinon c'est un piège.
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
 *
 * ══════════ UN DOSSIER CLOS N'ATTEND PLUS RIEN ══════════
 *
 * William, 21/09/2026 : « quand je clôture une recommandation, il faut que tout le process se
 * complète, pas que je me retrouve avec un chemin qui n'a que quelques étapes de complétées ».
 *
 * CE QU'IL VOYAIT, ET IL AVAIT RAISON DE LE TROUVER FAUX : sur un dossier clos sans proposition
 * datée, « En consultation » et « Proposée » restaient en nœuds pointillés, reliés par la barre à
 * tirets DÉFILANTS — le seul signal d'attente de toute la frise. L'écran annonçait donc un travail
 * en cours sur un dossier mort. Ce n'est pas un détail d'affichage : c'est le contraire de la
 * vérité, sur 1 152 recommandations closes sur 1 625 (71 %).
 *
 * CE QUE JE N'AI PAS FAIT, ET POURQUOI. « Compléter le process » pourrait s'entendre comme : à la
 * clôture, écrire les dates manquantes. Je m'y refuse, et ce n'est pas de la timidité —
 * `date_presentation_client` est la SEULE source de la relance et de la mention « V3 » du jalon.
 * La remplir à la clôture inventerait un envoi qui n'a peut-être jamais eu lieu, et corromprait
 * la donnée sur laquelle repose un autre écran. La règle du dépôt est constante : « inventer un
 * horodatage serait pire que la ligne vide ».
 *
 * CE QUE J'AI FAIT : la frise reçoit un troisième état, `depasse` — ni franchi, ni à venir. Le
 * parcours est passé par là sans que l'étape ait lieu. Nœud plein et sourd, barre pleine et sourde,
 * plus aucune animation. Le chemin se lit d'un bout à l'autre, et il ne ment sur rien : on distingue
 * toujours ce qui a eu lieu de ce qui n'a pas eu lieu.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function EtapeRecommandation({
  reco,
  peutModifier,
  onChoisirEtape,
  onMarquerProposee,
  onRetirerProposee,
  onOuvrirCloture,
  onRendreAuCalcul,
}: {
  reco: Recommandation
  peutModifier?: boolean
  /** Pose une étape à la main. Voir le commentaire « LE CHEMIN SE CLIQUE » ci-dessous. */
  onChoisirEtape?: (code: 'BROUILLON' | 'ACTIVE') => void
  /** Date la présentation au client à la main, quand la proposition est partie hors de Kimatch. */
  onMarquerProposee?: () => void
  /** Défait cette date : la proposition n'est finalement pas partie. Voir « REVENIR EN ARRIÈRE ». */
  onRetirerProposee?: () => void
  /** La clôture passe par son panneau : elle réclame une finalité et un motif. */
  onOuvrirCloture?: () => void
  /** Rend le dossier au calcul automatique — l'échappatoire du choix manuel. */
  onRendreAuCalcul?: () => void
}) {
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

  /* Un clic ne se propose que si l'on peut écrire, et jamais pour poser l'étape déjà en cours. */
  const cliquable = (code: string, action: () => void) =>
    peutModifier && reco.etape !== code ? action : undefined

  const jalons: Jalon[] = [
    {
      cle: 'creee',
      libelle: 'Créée',
      picto: PictoBrouillon,
      franchi: true,
      onChoisir: cliquable('BROUILLON', () => onChoisirEtape?.('BROUILLON')),
      titre: reco.etape === 'BROUILLON'
        ? 'Le dossier est au brouillon'
        : 'Remettre le dossier au brouillon — ce choix tiendra',
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
      /* 186 dossiers clos n'ont aucune version : ils sont morts à l'état d'intention. Le jalon est
         derrière eux sans avoir eu lieu — c'est exactement ce que `depasse` dit. */
      depasse: estClose && reco.versions.length === 0,
      /* ══ REVENIR EN ARRIÈRE, ET NON SEULEMENT AVANCER (William, 22/09/2026) ══

         Marie a marqué « Proposée » par erreur sur un dossier DÉJÀ actif, et s'est retrouvée
         enfermée : « En consultation » refusait le clic — on ne repose pas l'étape en cours — et
         « Proposée » aussi, la règle interdisant de redater une présentation faite. Chaque garde
         était juste ; ensemble elles fermaient la seule porte de sortie.

         QUAND UNE PRÉSENTATION EST DATÉE, CE JALON LA DÉFAIT. C'est le sens littéral de « revenir
         en consultation » : le dossier reste actif, mais la proposition n'est plus réputée partie
         — et la relance, qui repose entièrement sur cette date, s'éteint avec elle.

         SAUF SUR UN DOSSIER CLOS, où ce même clic garde son sens d'origine : ROUVRIR. Un dossier
         clos et présenté n'a pas besoin qu'on défasse sa présentation — elle a bien eu lieu, elle
         fait partie de son histoire ; il a besoin de revivre. Confondre les deux ferait effacer
         un fait passé au moment où l'on veut reprendre le travail. */
      onChoisir: peutModifier && !estClose && datePresentation != null && onRetirerProposee
        ? onRetirerProposee
        : cliquable('ACTIVE', () => onChoisirEtape?.('ACTIVE')),
      titre: !estClose && datePresentation != null && peutModifier && onRetirerProposee
        ? 'Revenir en consultation — retirer la date de présentation et arrêter la relance'
        : reco.etape === 'ACTIVE'
        ? 'Le dossier est actif'
        : estClose
          ? reco.versions.length === 0
            ? 'Clos sans qu’aucune version n’ait été créée — rouvrir le dossier'
            : 'Rouvrir le dossier — il repasse en Active, et ce choix tiendra'
          : 'Rendre le dossier actif — ce choix tiendra',
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
      /* 966 dossiers clos portent des versions dont AUCUNE n'a de date de présentation. Souvent la
         proposition est partie de la boîte mail du commercial, sans passer par « Envoyer au
         client » : le fait a eu lieu, sa date n'a jamais été observée. On ne l'invente pas. */
      depasse: estClose && datePresentation == null,
      /* Une seule fois : redater une présentation déjà faite remettrait le compteur des deux jours
         ouvrés à zéro et REPOUSSERAIT la relance au lieu de la rapprocher. */
      onChoisir:
        peutModifier && datePresentation == null && reco.versions.length > 0 && onMarquerProposee
          ? onMarquerProposee
          : undefined,
      titre: datePresentation
        ? `Proposition envoyée le ${new Date(datePresentation).toLocaleDateString('fr-FR')}`
        : reco.versions.length === 0
          ? 'Aucune version : il n’y a rien à proposer au client'
          : estClose
            ? 'Clos sans présentation datée — dater après coup si la proposition est bien partie'
            : 'Marquer la proposition comme envoyée au client — c’est cette date qui déclenche la relance',
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
      /* La clôture ne s'écrit pas d'un clic : elle réclame une finalité et un motif. Le nœud ouvre
         le même panneau que le bouton du bandeau plutôt que d'en proposer un second chemin. */
      onChoisir: peutModifier && !estClose && onOuvrirCloture ? onOuvrirCloture : undefined,
      titre: estClose ? 'Dossier clos' : 'Clôturer le dossier — une finalité et un motif sont demandés',
      couleur: issue?.couleur,
      date: estClose ? (reco.date_cloture ?? null) : null,
      /* LE MOTIF NE S'ÉCRIT PLUS ICI. Obligatoire à la saisie depuis le 16/08/2026, il fait souvent
         une phrase entière — collé à la ligne de date, il la faisait déborder sur une troisième
         ligne, celle que William ne veut pas. Il reste entier dans la carte de clôture, plus bas
         sur la fiche, où il a la largeur pour se lire. */
      contexte: estClose ? contexteDe(reco.date_cloture) : null,
    },
  ]

  const fige = Boolean(reco.date_etape_manuelle)
  const [ouvert, setOuvert] = useState(false)

  /* L'ÉTAPE AFFICHÉE EST LA DERNIÈRE FRANCHIE — celle où la frise posait son nœud le plus avancé. */
  const courante = [...jalons].reverse().find((j) => j.franchi) ?? jalons[0]
  const gestes = jalons.filter((j) => j.onChoisir && j.titre)
  const menu = gestes.length > 0 || (fige && peutModifier && onRendreAuCalcul)
  const couleur = courante.couleur ?? '#0d7a5f'
  const Picto = courante.picto

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={!menu}
        onClick={() => setOuvert((v) => !v)}
        title={fige ? 'Étape posée à la main — Kimatch ne la recalcule plus' : 'Étape du dossier'}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-km-pill border px-2.5 py-[3px] text-km-label font-bold tracking-[0.04em] transition-colors',
          menu ? 'hover:brightness-95' : 'cursor-default',
        )}
        style={{ color: couleur, borderColor: `${couleur}40`, background: `${couleur}12` }}
      >
        <Picto taille={13} />
        {courante.libelle.toUpperCase()}
        {courante.marqueur && <span className="font-mono opacity-80">{courante.marqueur}</span>}
        {courante.date && (
          <span className="font-mono font-semibold opacity-75">{new Date(courante.date).toLocaleDateString('fr-FR')}</span>
        )}
        {fige && <Lock className="h-[10px] w-[10px]" />}
        {menu && <ChevronDown className="h-[11px] w-[11px] opacity-70" />}
      </button>

      {ouvert && menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 top-full z-40 mt-1.5 w-[320px] rounded-km-md border border-km-line bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
            <p className="px-2.5 pb-1 pt-1.5 text-km-tiny font-extrabold uppercase tracking-[.08em] text-km-faint">Changer l’étape</p>
            {gestes.map((j) => (
              <button
                key={j.cle}
                type="button"
                onClick={() => { setOuvert(false); j.onChoisir?.() }}
                className="flex w-full flex-col items-start gap-[1px] rounded-km-sm px-2.5 py-2 text-left hover:bg-km-bg"
              >
                <span className="text-km-body font-bold" style={{ color: j.couleur ?? undefined }}>{j.libelle}</span>
                <span className="text-km-label text-km-faint">{j.titre}</span>
              </button>
            ))}
            {fige && peutModifier && onRendreAuCalcul && (
              <button
                type="button"
                onClick={() => { setOuvert(false); onRendreAuCalcul() }}
                className="mt-1 flex w-full items-start gap-2 rounded-km-sm border-t border-km-line-soft px-2.5 pb-2 pt-2.5 text-left hover:bg-km-bg"
              >
                <RotateCcw className="mt-[3px] h-3.5 w-3.5 shrink-0 text-km-muted" />
                <span className="flex flex-col gap-[1px]">
                  <span className="text-km-body font-bold text-km-text">Laisser Kimatch décider</span>
                  <span className="text-km-label text-km-faint">
                    Étape posée à la main{reco.date_etape_manuelle ? ` le ${new Date(reco.date_etape_manuelle).toLocaleDateString('fr-FR')}` : ''} : la rendre au calcul automatique.
                  </span>
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </span>
  )
}
