import { ExternalLink, Send, Check, Shield, X, Minus, ArrowRight } from 'lucide-react'
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
function FriseDossier({ etapes, codeCourant }: { etapes: ReferenceRow[]; codeCourant: string }) {
  const crans = CODES_DOSSIER.map((code) => etapes.find((e) => e.code === code)).filter(
    (e): e is ReferenceRow => !!e,
  )
  if (crans.length === 0) return null
  const indexCourant = crans.findIndex((e) => e.code === codeCourant)

  return (
    <div className="mb-2.5 border-b border-km-line pb-2.5">
      <p className="mb-1.5 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
        Recommandation
      </p>
      <div className="flex items-center gap-1">
        {crans.map((cran, i) => {
          const courant = i === indexCourant
          /* « À réactiver » et « Clôturée » sont deux SORTIES, pas deux crans successifs : un
             dossier clôturé n'est jamais passé par « à réactiver ». On n'estompe donc pas les crans
             « franchis » comme sur une progression — on met en avant celui où l'on est, et on laisse
             les autres lisibles mais discrets. C'est un repère de position, pas un compteur. */
          return (
            <div key={cran.id} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate rounded-km px-2 py-[5px] text-center text-km-label font-bold transition-colors',
                  courant
                    ? 'bg-km-green-soft text-km-green ring-1 ring-inset ring-km-green/30'
                    : 'bg-km-soft text-km-faint',
                )}
                title={cran.libelle}
              >
                {cran.libelle}
              </span>
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

const ICONES_FINALITE: Record<CleFinalite, LucideIcon> = {
  ACCEPTEE: Check,
  REFUSEE: X,
  EXPIREE: Minus,
}

const DEGRADE_OR = 'linear-gradient(135deg,#8a4b2a,#cf9a5e)'

/** Les étapes du rail, dans l'ordre, telles que la table les nomme. */
export function etapesDuRail(etapes: ReferenceRow[]): ReferenceRow[] {
  return CODES_RAIL.map((code) => etapes.find((e) => e.code === code)).filter((e): e is ReferenceRow => !!e)
}

/** L'étape qui suit celle en cours, ou null si la suivante est la clôture (qui exige une finalité). */
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
  clotureOuverte,
  onOuvrirCloture,
  onAvancer,
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
  clotureOuverte: boolean
  onOuvrirCloture: () => void
  onAvancer: () => void
  onRouvrir: () => void
  avanceEnCours: boolean
  /** Le panneau de clôture, rendu par la fiche (finalité + motif obligatoire). */
  children?: React.ReactNode
}) {
  const rail = etapesDuRail(etapes)
  const dernier = rail.length - 1
  const indexCourant = rail.findIndex((e) => e.code === codeCourant)
  const suivante = etapeSuivanteDuRail(etapes, codeCourant)
  const fin = finalite ? FINALITES_RECOMMANDATION[finalite] : null

  return (
    <div className="rounded-[13px] border border-km-line bg-white px-[18px] pb-2 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">Cycle de vie</span>
        <span className="flex-1" />
        {peutModifier && !finalite && suivante && (
          <button
            type="button"
            onClick={onAvancer}
            disabled={avanceEnCours}
            className="inline-flex items-center gap-1.5 rounded-km px-[13px] py-1.5 text-km-body font-bold text-white shadow-[0_3px_9px_rgba(176,118,60,.3)] disabled:opacity-60"
            style={{ background: DEGRADE_OR }}
          >
            {avanceEnCours ? 'Enregistrement…' : <>Étape suivante <ArrowRight className="h-[11px] w-[11px]" /></>}
          </button>
        )}
        {/* ══ LE BOUTON « CLÔTURER » NE DÉPEND PLUS DU RAIL ══════════════════════════════════

            Michel, appel du 31/08/2026 : « il y avait déjà un bouton clôturé je crois sur
            recommandation… donc on peut remettre ça en place, c'est juste qu'il a disparu, je ne
            sais pas pourquoi. »

            POURQUOI IL AVAIT DISPARU. Sa condition était `!suivante` — « il n'y a plus de cran
            après celui-ci ». Tant que le rail portait les cinq paliers du DOSSIER, cela voulait
            dire « le dossier est au bout, il ne reste qu'à le fermer ». Le 28/08 le rail est passé
            aux statuts de la VERSION, et la même condition s'est mise à dire tout autre chose :
            le bouton n'apparaît plus que si la version affichée est exactement « En décision ».

            Il devenait donc introuvable dans les quatre cas les plus courants — aucune version,
            version en construction, version disponible, version déjà clôturée. Un dossier avec un
            contrat mais sans version ne pouvait plus être fermé du tout.

            LA CLÔTURE N'EST PAS UN CRAN DE PLUS, C'EST LA SORTIE. Michel : « la version fait
            évoluer la recommandation, mais ne clôture JAMAIS la recommandation, ça doit se faire
            manuellement. » Une sortie est ouverte de partout : la seule condition est que le
            dossier ne soit pas déjà clos, et que la personne ait le droit de le modifier. */}
        {peutModifier && !finalite && (
          <button
            type="button"
            onClick={onOuvrirCloture}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-km border-[1.5px] border-[#8a4b2a] px-[13px] py-1.5 text-km-body font-bold text-km-text',
              clotureOuverte ? 'bg-km-amber-soft' : 'bg-km-amber-soft hover:bg-[#f7ece3]',
            )}
          >
            Clôturer… ▾
          </button>
        )}
        {fin && (
          <button
            type="button"
            onClick={peutModifier ? onRouvrir : undefined}
            title={peutModifier ? 'Cliquer pour rouvrir' : undefined}
            className="rounded-kw-pill px-[13px] py-1.5 text-km-label font-extrabold tracking-[0.05em] text-white"
            style={{ background: fin.couleur, boxShadow: `0 3px 9px ${fin.couleur}44`, cursor: peutModifier ? 'pointer' : 'default' }}
          >
            {finalite === 'ACCEPTEE' ? '✓ ACCEPTÉE' : finalite === 'REFUSEE' ? '✗ REFUSÉE' : '— EXPIRÉE'}
          </button>
        )}
      </div>

      {children}

      {/* ══ DEUX FRISES, LE DOSSIER PUIS LA VERSION ══
          Naoëlle, 31/08/2026 : « je vois toujours pas la frise de statut de recommandation
          au-dessus des statuts de version ». C'est sa table à deux colonnes, dessinée. */}
      <FriseDossier etapes={etapesDossier} codeCourant={codeDossier} />

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
          const estDernier = i === dernier
          const Icone = estDernier && finalite ? ICONES_FINALITE[finalite] : ICONES_ETAPE[etape.code] ?? Check
          const faite = estDernier ? !!finalite : indexCourant >= 0 && i < indexCourant
          const courante = !finalite && i === indexCourant
          return [
            <div key={etape.id} className="relative z-[1] flex justify-center">
              <div
                className="flex items-center justify-center rounded-full"
                style={
                  faite && estDernier && fin
                    ? {
                        width: 37,
                        height: 37,
                        background: fin.couleur,
                        color: '#fff',
                        boxShadow: `0 0 0 7px ${fin.couleur}1a, 0 6px 17px ${fin.couleur}55, inset 0 -2px 6px rgba(0,0,0,.15)`,
                      }
                    : /* ══ L'ÉTAPE COURANTE EST LA PLUS VISIBLE, LES FRANCHIES S'EFFACENT ══

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
                <Icone className={estDernier && finalite ? 'h-[15px] w-[15px]' : courante ? 'h-[15px] w-[15px]' : 'h-[12px] w-[12px]'} />
              </div>
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

                   Elle ne s'applique qu'au segment en cours : `animate-kw-stripe` déplace le fond de
                   36 px, exactement la taille du motif, donc le défilement est continu. */
                className={cn(
                  'mx-[-10px] h-[5px] rounded-[3px]',
                  !finalite && indexCourant >= 0 && i === indexCourant &&
                    'animate-kw-stripe motion-reduce:animate-none',
                )}
                style={
                  finalite && i === dernier - 1
                    ? { background: `linear-gradient(90deg,#cf9a5e,${fin?.couleur ?? '#cf9a5e'})` }
                    : indexCourant >= 0 && i < indexCourant
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
          const estDernier = i === dernier
          const faite = estDernier ? !!finalite : indexCourant >= 0 && i < indexCourant
          const courante = !finalite && i === indexCourant
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
                style={{
                  color: courante
                    ? '#8a4b2a'
                    : faite
                      ? estDernier && fin
                        ? fin.couleur
                        : '#a9763f'
                      : '#c0c2bd',
                }}
              >
                {estDernier && fin ? fin.libelle : etape.libelle}
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
