import { ExternalLink, Send, Check, Shield } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FINALITES_RECOMMANDATION, type CleFinalite } from '@/lib/finalitesRecommandation'
import type { ReferenceRow } from '@/lib/data/referenceTables'

/**
 * Rail de cycle de vie de la fiche Recommandation — Diagnostic → Consultation → Décision → Clôture.
 *
 * Ce sont les quatre étapes RÉELLEMENT utilisées : au 17/08/2026, les 1703 recommandations se
 * répartissent en Clôture 1573, Consultation 93, Diagnostic 31, Décision 6. Les neuf autres lignes
 * de `etapes_recommandation` sont l'ancien cycle (À préparer, En analyse, Prête, Présentée…) et
 * n'ont plus aucune recommandation dessus. Le rail les écarte donc, mais il lit la table plutôt que
 * de figer les codes : elle a déjà changé une fois le 12/08/2026.
 *
 * Le dernier cran prend la couleur de la finalité une fois la recommandation close (vert accepté,
 * rouge refusé, gris expiré) — c'est le geste du design, avec les trois finalités de la base et non
 * les cinq du dessin (décision de Naoëlle du 16/08/2026).
 */

// LES CINQ PALIERS VIVANTS de Michel : les trois issues terminales (Acceptée, Refusée,
// Abandonnée) ne sont pas des crans du rail, c'est la finalité qui les porte — comme avant, où
// « Clôture » prenait la couleur de son issue.
/**
 * LE RAIL SUIT LA VERSION, PLUS LE DOSSIER (Michel, 28/08/2026).
 *
 * « Sur quoi on travaille, c'est les versions, ce n'est pas les recommandations. » Les cinq paliers
 * de dossier — brouillon, consultation, offres reçues, à présenter, présentée — n'existent plus : il
 * n'en reste que quatre statuts, et trois d'entre eux ne sont pas des étapes qu'on franchit mais des
 * états déduits. Un rail sur le dossier n'aurait donc plus rien à montrer.
 *
 * Les trois paliers ci-dessous sont le vrai chemin d'un travail : on construit, c'est prêt, c'est
 * chez le client. La clôture n'y figure pas — ce n'est pas un palier de plus, c'est la sortie.
 */
const CODES_RAIL = ['EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION'] as const

/**
 * LES QUATRE STATUTS DU DOSSIER, DANS L'ORDRE DE SA TABLE.
 *
 * Naoëlle, 31/08/2026 : « je vois toujours pas la frise de statut de recommandation au-dessus des
 * statuts de version ». Michel l'avait demandé le même jour : les deux statuts « l'un au-dessus de
 * l'autre ». J'avais empilé deux petites pastilles dans l'en-tête de la fiche — ce n'est pas ce
 * qu'ils demandaient, et ça ne montre rien du chemin.
 *
 * SA TABLE « VUE GLOBALE DES STATUTS » A DEUX COLONNES, alignées ligne par ligne : Recommandation
 * et Version. Deux frises empilées, c'est cette table dessinée — on lit d'un coup d'œil que
 * « version en construction » veut dire « dossier actif », et que « version clôturée » peut vouloir
 * dire deux choses selon que le dossier a été clôturé ou non.
 *
 * L'ordre est celui de sa table, et c'est aussi celui de la colonne `ordre` en base : Brouillon 10,
 * Active 20, À réactiver 30, Clôturée 40. Les sept autres lignes de `etapes_recommandation` sont
 * l'ancien cycle et ne portent aucun dossier.
 */
const CODES_DOSSIER = ['BROUILLON', 'ACTIVE', 'A_REACTIVER', 'CLOTUREE'] as const

/**
 * La frise du DOSSIER, au-dessus de celle de la version.
 *
 * ── POURQUOI ELLE EST SOBRE ALORS QUE CELLE DU DESSOUS EST DORÉE ─────────────────────────────
 *
 * Parce que le dossier ne s'avance pas à la main : son statut est DÉDUIT du jeu des versions et des
 * contrats (Michel, 28/08 : « sur quoi on travaille, c'est les versions »). Une frise dorée avec
 * ses hachures animées annoncerait une progression qu'on pilote ; celle-ci constate.
 *
 * Deux frises au même niveau de bruit se disputeraient l'œil, et la maquette de Michel se veut
 * minimaliste. Celle-ci dit où en est le dossier ; celle du dessous reste l'endroit où l'on agit.
 */
function FriseDossier({
  etapes,
  codeCourant,
  peutModifier,
  onCloturer,
  onRouvrir,
}: {
  etapes: ReferenceRow[]
  codeCourant: string
  peutModifier: boolean
  onCloturer: () => void
  onRouvrir: () => void
}) {
  const crans = CODES_DOSSIER.map((code) => etapes.find((e) => e.code === code)).filter(
    (e): e is ReferenceRow => !!e,
  )
  if (crans.length === 0) return null
  const indexCourant = crans.findIndex((e) => e.code === codeCourant)
  const estClos = codeCourant === 'CLOTUREE'

  /* ══ CE QU'ON PEUT CLIQUER ICI, ET CE QU'ON NE PEUT PAS ══════════════════════════════════════

     Naoëlle, 31/08/2026 : « enlève aussi étape suivante et clôturer, on pourra modifier les statuts
     en cliquant sur les statuts direct de la frise ». Les deux boutons sont partis, la frise les
     remplace.

     MAIS TROIS DES QUATRE CRANS NE SONT PAS DES CHOIX. Brouillon, Active et À réactiver sont
     DÉDUITS par la base — aucune version, une version vivante, toutes les versions closes sans
     conclusion. Les rendre cliquables promettrait une action qui serait défaite au recalcul suivant,
     c'est-à-dire dès la prochaine version créée.

     Le seul geste que le métier confie à quelqu'un est la clôture. Michel, 31/08/2026 : « la version
     fait évoluer la recommandation, mais ne clôture JAMAIS la recommandation, ça doit se faire
     manuellement. » Donc : « Clôturée » ouvre le panneau de résultat, et sur un dossier déjà clos,
     cliquer n'importe où ailleurs le rouvre. Les autres crans portent une infobulle qui dit pourquoi
     ils ne se cliquent pas — un cran inerte sans explication se lit comme une panne. */
  return (
    <div className="mb-2.5 border-b border-km-line pb-2.5">
      <p className="mb-1.5 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
        Recommandation
      </p>
      <div className="flex items-center gap-1">
        {crans.map((cran, i) => {
          const courant = i === indexCourant
          const estCranCloture = cran.code === 'CLOTUREE'
          /* Cliquable : « Clôturée » sur un dossier ouvert (on le ferme), et n'importe quel autre
             cran sur un dossier clos (on le rouvre, la base décide où il retombe). */
          const actionnable = peutModifier && (estClos ? !estCranCloture : estCranCloture)
          const infobulle = actionnable
            ? estClos
              ? 'Rouvrir ce dossier — la base recalculera son statut'
              : 'Clôturer ce dossier'
            : courant
              ? cran.libelle
              : `« ${cran.libelle} » est calculé par l'application, d'après les versions et les contrats du dossier.`

          /* « À réactiver » et « Clôturée » sont deux SORTIES, pas deux crans successifs : un
             dossier clôturé n'est jamais passé par « à réactiver ». On n'estompe donc pas les crans
             « franchis » comme sur une progression — on met en avant celui où l'on est, et on laisse
             les autres lisibles mais discrets. C'est un repère de position, pas un compteur. */
          return (
            <div key={cran.id} className="flex min-w-0 flex-1 items-center gap-1">
              <button
                type="button"
                disabled={!actionnable}
                onClick={actionnable ? (estClos ? onRouvrir : onCloturer) : undefined}
                title={infobulle}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-km px-2 py-[5px] text-center text-km-label font-bold transition-colors',
                  courant
                    ? 'bg-km-green-soft text-km-green ring-1 ring-inset ring-km-green/30'
                    : 'bg-km-soft text-km-faint',
                  actionnable
                    ? 'cursor-pointer hover:bg-km-green-soft hover:text-km-green'
                    : 'cursor-default',
                )}
              >
                {cran.libelle}
              </button>
              {i < crans.length - 1 && (
                <span className="h-[2px] w-2 shrink-0 rounded-full bg-km-line" aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ICONES_ETAPE: Record<string, LucideIcon> = {
  BROUILLON: ExternalLink,
  CONSULTATION: Send,
  OFFRES_RECUES: Check,
  A_PRESENTER: Send,
  PRESENTEE: Shield,
}

const DEGRADE_OR = 'linear-gradient(135deg,#8a4b2a,#cf9a5e)'

/** Les étapes du rail, dans l'ordre, telles que la table les nomme. */
export function etapesDuRail(etapes: ReferenceRow[]): ReferenceRow[] {
  return CODES_RAIL.map((code) => etapes.find((e) => e.code === code)).filter((e): e is ReferenceRow => !!e)
}

/**
 * L'étape qui suit celle en cours, ou null si la suivante est la clôture (qui exige une finalité).
 *
 * PLUS AUCUN APPELANT depuis le 31/08/2026 : le bouton « Étape suivante » a été remplacé par des
 * crans cliquables, et une frise ne raisonne pas en « suivant » — chaque cran est une destination.
 * Conservée parce qu'elle est la seule description écrite de l'ordre du rail, et qu'un écran qui
 * voudrait un jour proposer « l'étape d'après » la réécrirait à l'identique.
 */
export function etapeSuivanteDuRail(etapes: ReferenceRow[], codeCourant: string): ReferenceRow | null {
  const rail = etapesDuRail(etapes)
  const i = rail.findIndex((e) => e.code === codeCourant)
  // Hors rail (ancien cycle) : on renvoie le premier cran, qui remet le dossier sur le circuit.
  if (i < 0) return rail[0] ?? null
  const suivante = rail[i + 1]
  // Après « Présentée », l'étape suivante est une décision : elle exige une finalité, donc elle ne
  // s'atteint pas par le bouton « étape suivante ».
  if (!suivante) return null
  return suivante
}

export function RailCycleVie({
  etapes,
  etapesDossier,
  codeDossier,
  codeCourant,
  numeroVersion,
  finalite,
  peutModifier,
  onOuvrirCloture,
  onChoisirStatutVersion,
  onRouvrir,
  avanceEnCours,
  children,
}: {
  etapes: ReferenceRow[]
  /** Les statuts du DOSSIER (`etapes_recommandation`), pour la frise du haut. */
  etapesDossier: ReferenceRow[]
  /** Le statut du dossier aujourd'hui — celui que la base a calculé. */
  codeDossier: string
  /** Le statut de la VERSION affichée, pour la frise du bas. */
  codeCourant: string
  /** Le numéro de la version affichée, écrit dans l'étiquette de la frise du bas. */
  numeroVersion?: number | null
  finalite: CleFinalite | null
  peutModifier: boolean
  onOuvrirCloture: () => void
  /** Le statut visé pour la version affichée. Remplace « étape suivante », qui n'allait que d'un
   *  cran et jamais en arrière. */
  onChoisirStatutVersion: (statutVersionId: string) => void
  onRouvrir: () => void
  avanceEnCours: boolean
  /** Le panneau de clôture, rendu par la fiche (finalité + motif obligatoire). */
  children?: React.ReactNode
}) {
  const rail = etapesDuRail(etapes)
  const dernier = rail.length - 1
  const indexCourant = rail.findIndex((e) => e.code === codeCourant)
  const fin = finalite ? FINALITES_RECOMMANDATION[finalite] : null

  return (
    <div className="rounded-[13px] border border-km-line bg-white px-[18px] pb-2 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">Cycle de vie</span>
        <span className="flex-1" />
        {/* ══ CETTE EN-TÊTE PORTAIT DEUX BOUTONS. ELLE N'EN PORTE PLUS AUCUN ═════════════════

            Naoëlle, 31/08/2026 : « enlève aussi étape suivante et clôturer, on pourra modifier les
            statuts en cliquant sur les statuts direct de la frise ». Les deux frises sont les
            commandes, et l'histoire des deux boutons explique pourquoi c'est la bonne réponse.

            « ÉTAPE SUIVANTE » n'allait que d'un cran, et jamais en arrière. Revenir demandait un
            SECOND chemin — le menu « Corriger le statut » de la carte de version — donc deux
            commandes pour un même changement, et il fallait savoir laquelle prendre selon le sens.
            Un clic sur le cran visé fait les deux, et se lit sans mode d'emploi : on montre où l'on
            veut aller.

            « CLÔTURER… » avait disparu tout seul, et c'est instructif. Sa condition d'affichage était
            « il n'y a plus de cran après celui-ci ». Tant que le rail portait les paliers du DOSSIER,
            cela voulait dire « le dossier est au bout ». Le 28/08 le rail est passé aux statuts de la
            VERSION, et la même phrase s'est mise à dire tout autre chose : le bouton n'apparaissait
            plus que si la version affichée était exactement « En décision » — donc introuvable dans
            les quatre cas courants, et un dossier avec un contrat mais sans version ne pouvait plus
            être fermé du tout.

            Un bouton dont la visibilité dépend d'une frise est fragile par construction. Porté PAR la
            frise, il ne peut plus se perdre : le cran « Clôturée » est toujours là.

            Reste que la clôture n'est pas un cran de plus, c'est la sortie. Michel : « la version
            fait évoluer la recommandation, mais ne clôture JAMAIS la recommandation, ça doit se faire
            manuellement. » Voir `FriseDossier` pour ce qui se clique et ce qui ne se clique pas. */}

        {/* LE RÉSULTAT RESTE, LUI, ET CE N'EST PAS UN DOUBLON. La frise dit que le dossier est clos ;
            elle ne dit pas pourquoi. C'est aussi le seul endroit où le résultat se lit depuis que la
            frise de la version a cessé de l'emprunter. Ce n'est plus un bouton : rouvrir se fait en
            cliquant un autre cran de la frise du dossier. */}
        {fin && (
          <span
            className="rounded-km-pill px-[13px] py-1.5 text-km-label font-extrabold tracking-[0.05em] text-white"
            style={{ background: fin.couleur, boxShadow: `0 3px 9px ${fin.couleur}44` }}
          >
            {/* « RÉSULTAT : » devant le mot. Sans lui, cette pastille se lit comme un statut de
                dossier — or les seuls statuts sont Brouillon, Active, À réactiver et Clôturée
                (Naoëlle, 31/08/2026, table « Vue globale des statuts »). */}
            {finalite === 'ACCEPTEE'
              ? 'RÉSULTAT : ✓ ACCEPTÉE'
              : finalite === 'REFUSEE'
                ? 'RÉSULTAT : ✗ REFUSÉE'
                : 'RÉSULTAT : — EXPIRÉE'}
          </span>
        )}
      </div>

      {/* ══ DEUX FRISES, LE DOSSIER PUIS LA VERSION ══
          Naoëlle, 31/08/2026 : « je vois toujours pas la frise de statut de recommandation
          au-dessus des statuts de version ». C'est sa table à deux colonnes, dessinée. */}
      <FriseDossier
        etapes={etapesDossier}
        codeCourant={codeDossier}
        peutModifier={peutModifier}
        onCloturer={onOuvrirCloture}
        onRouvrir={onRouvrir}
      />

      {/* LE PANNEAU DE CLÔTURE S'OUVRE SOUS LE CRAN QU'ON VIENT DE CLIQUER, et non au-dessus de la
          frise comme avant : il parle du dossier, il se place donc contre la frise du dossier. Un
          panneau qui s'ouvre ailleurs qu'à l'endroit cliqué fait douter que le clic ait porté. */}
      {children}

      {/* LA FRISE DU BAS PORTE MAINTENANT SON NOM. Sans lui, deux frises superposées sans étiquette
          se lisent comme une seule frise en deux morceaux — et c'est justement la confusion qu'on
          répare : « En construction » décrit la version, pas le dossier. */}
      <p className="mb-0.5 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
        Version{typeof numeroVersion === 'number' ? ` ${numeroVersion}` : ''}
      </p>

      {/* Grille : un nœud, une barre, un nœud… puis la rangée des libellés en dessous, alignée
          colonne par colonne comme dans le design. */}
      <div
        className="grid items-center px-1.5 pb-2 pt-3"
        style={{
          gridTemplateColumns: Array.from({ length: rail.length * 2 - 1 }, (_, i) =>
            i % 2 === 0 ? 'minmax(0,1fr)' : 'minmax(14px,.7fr)',
          ).join(' '),
        }}
      >
        {rail.flatMap((etape, i) => {
          /* ══ CETTE FRISE NE PARLE QUE DE LA VERSION ══
             Son dernier cran affichait la FINALITÉ DU DOSSIER à la place de « En décision » — le
             libellé, l'icône, la couleur. C'était défendable tant que c'était le seul endroit où le
             résultat pouvait se lire. Depuis qu'une frise du dossier existe au-dessus, deux frises
             dont l'une emprunte l'information de l'autre sont exactement la confusion qu'elles
             doivent lever. Le résultat vit maintenant dans sa pastille, nommée. */
          const Icone = ICONES_ETAPE[etape.code] ?? Check
          const faite = indexCourant >= 0 && i < indexCourant
          const courante = i === indexCourant
          return [
            <div key={etape.id} className="relative z-[1] flex justify-center">
              {/* ══ ON CLIQUE LE CRAN VOULU, PAS « SUIVANT » ══
                  Remplace « Étape suivante » et le menu « Corriger le statut » d'un seul geste : ce
                  bouton va où on lui dit, en avant comme en arrière. Le cran courant n'est pas
                  cliquable — y aller quand on y est déjà n'est pas une action. */}
              <button
                type="button"
                disabled={!peutModifier || courante || avanceEnCours}
                onClick={() => onChoisirStatutVersion(etape.id)}
                title={
                  courante
                    ? `Statut actuel de la version : ${etape.libelle}`
                    : peutModifier
                      ? `Passer la version à « ${etape.libelle} »`
                      : etape.libelle
                }
                className={cn(
                  'flex items-center justify-center rounded-full transition-transform',
                  peutModifier && !courante && !avanceEnCours
                    ? 'cursor-pointer hover:scale-[1.08]'
                    : 'cursor-default',
                )}
                style={
                  /* ══ L'ÉTAPE COURANTE EST LA PLUS VISIBLE, LES FRANCHIES S'EFFACENT ══

                         Naoëlle, 28/08/2026 : « change cette histoire de statut pointillé car on s'y
                         perd de fou ». Elle a raison, et l'appel de 16 h en donne la preuve : Michel
                         et elle ont passé une minute à croire que le statut était « Disponible »
                         alors qu'il était « En décision ». Naoëlle a même conclu que la frise
                         « n'était pas synchronisée » avec le menu — elle l'était, c'est le dessin
                         qui mentait.

                         POURQUOI ÇA TROMPAIT : l'étape franchie était pleine, dorée, avec une ombre
                         portée ; l'étape COURANTE était un cercle blanc en pointillé. L'œil va au
                         plein. On lisait donc le dernier cran franchi comme l'état actuel, ce qui
                         décale d'un cran toute la lecture du rail.

                         LA HIÉRARCHIE EST INVERSÉE : le courant prend le plein et l'anneau, le
                         franchi devient un simple jeton discret avec sa coche. On lit d'abord où on
                         est, ensuite d'où on vient — c'est l'ordre dans lequel on a besoin de
                         l'information. */
                  courante
                    ? {
                          width: 38,
                          height: 38,
                          background: DEGRADE_OR,
                          color: '#fff',
                          boxShadow: '0 0 0 6px rgba(207,154,94,.18), 0 5px 14px rgba(176,118,60,.4), inset 0 -2px 5px rgba(0,0,0,.14)',
                        }
                      : faite
                        ? { width: 30, height: 30, background: '#f3e8db', border: '1.5px solid #e0cdb4', color: '#a9763f' }
                        : { width: 34, height: 34, background: '#fff', border: '2px dashed #dcdad5', color: '#c9cbc6' }
                }
              >
                <Icone className={courante ? 'h-[15px] w-[15px]' : 'h-[12px] w-[12px]'} />
              </button>
            </div>,
            i < dernier ? (
              <div
                key={`${etape.id}-barre`}
                /* LES HACHURES DÉFILENT, comme sur la frise de l'opportunité de William. Signalé par
                   Naoëlle le 27/08 : « il y a plusieurs objets qui n'ont pas l'animation que William
                   a faite, les traits qui bougent entre deux statuts ».

                   Le motif était déjà là, mais figé — il disait « cette étape est en cours » sans le
                   MONTRER. Une hachure immobile se lit comme une texture ; la même qui avance dit
                   qu'il se passe quelque chose, et c'est tout l'intérêt de l'animation de William.

                   Elle ne s'applique qu'au segment en cours : `animate-km-stripe` déplace le fond de
                   36 px, exactement la taille du motif, donc le défilement est continu. */
                className={cn(
                  'mx-[-10px] h-[5px] rounded-[3px]',
                  indexCourant >= 0 && i === indexCourant &&
                    'animate-km-stripe motion-reduce:animate-none',
                )}
                style={
                  indexCourant >= 0 && i < indexCourant
                    ? { background: DEGRADE_OR }
                    : indexCourant >= 0 && i === indexCourant
                      ? {
                            // Barre hachurée : l'étape en cours n'est pas franchie, elle est en train
                            // de l'être. Le design la distingue de la barre pleine.
                          backgroundImage:
                            'repeating-linear-gradient(90deg,#ddb98c 0px,#ddb98c 12px,#f4e4cd 12px,#f4e4cd 24px)',
                          backgroundSize: '36px 5px',
                        }
                      : { background: '#eceae6' }
                }
              />
            ) : null,
          ]
        })}

        {rail.flatMap((etape, i) => {
          const faite = indexCourant >= 0 && i < indexCourant
          const courante = i === indexCourant
          return [
            <div key={`${etape.id}-lbl`} className="min-w-0 break-words pt-[7px] text-center">
              <div
                /* MÊME HIÉRARCHIE QUE LE CERCLE : le libellé courant est le plus lisible, le
                   franchi s'estompe. Il était l'inverse — le franchi en noir, le courant en brun
                   clair — ce qui redoublait la confusion du cercle plein. */
                className={cn(
                  'tracking-[-0.01em]',
                  courante ? 'text-km-name font-extrabold' : 'text-km-body font-bold',
                )}
                style={{ color: courante ? '#8a4b2a' : faite ? '#a9763f' : '#c0c2bd' }}
              >
                {etape.libelle}
                {/* LE MOT « ACTUEL » SOUS L'ÉTAPE COURANTE. Un dessin peut se lire de travers ;
                    un mot, non. C'est le filet de sécurité de toute cette correction. */}
                {courante && (
                  <span className="mt-0.5 block text-km-label font-bold uppercase tracking-[0.08em] text-km-muted">
                    actuel
                  </span>
                )}
              </div>
            </div>,
            i < dernier ? <div key={`${etape.id}-lbl-vide`} /> : null,
          ]
        })}
      </div>

      {/* Une recommandation posée sur une étape de l'ancien cycle ne se voit pas dans le rail :
          on le dit, sinon le rail semble simplement vide sans raison. */}
      {indexCourant < 0 && !finalite && (
        <p className="pb-1 text-center text-km-label text-km-faint">
          Étape « {etapes.find((e) => e.code === codeCourant)?.libelle ?? codeCourant} » : ancien cycle de vie, hors rail.
        </p>
      )}
    </div>
  )
}
