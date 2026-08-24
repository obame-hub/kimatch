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
const CODES_RAIL = ['BROUILLON', 'CONSULTATION', 'OFFRES_RECUES', 'A_PRESENTER', 'PRESENTEE'] as const

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
  codeCourant,
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
  codeCourant: string
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
    <div className="rounded-[13px] border border-kw-border bg-white px-[18px] pb-2 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Cycle de vie</span>
        <span className="flex-1" />
        {peutModifier && !finalite && suivante && (
          <button
            type="button"
            onClick={onAvancer}
            disabled={avanceEnCours}
            className="inline-flex items-center gap-1.5 rounded-kw-md px-[13px] py-1.5 text-kw-base font-bold text-white shadow-[0_3px_9px_rgba(176,118,60,.3)] disabled:opacity-60"
            style={{ background: DEGRADE_OR }}
          >
            {avanceEnCours ? 'Enregistrement…' : <>Étape suivante <ArrowRight className="h-[11px] w-[11px]" /></>}
          </button>
        )}
        {peutModifier && !finalite && !suivante && (
          <button
            type="button"
            onClick={onOuvrirCloture}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-kw-md border-[1.5px] border-[#8a4b2a] px-[13px] py-1.5 text-kw-base font-bold text-kw-ink',
              clotureOuverte ? 'bg-kw-amber-light' : 'bg-kw-amber-light hover:bg-[#f7ece3]',
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
            className="rounded-kw-pill px-[13px] py-1.5 text-kw-xs font-extrabold tracking-[0.05em] text-white"
            style={{ background: fin.couleur, boxShadow: `0 3px 9px ${fin.couleur}44`, cursor: peutModifier ? 'pointer' : 'default' }}
          >
            {finalite === 'ACCEPTEE' ? '✓ ACCEPTÉE' : finalite === 'REFUSEE' ? '✗ REFUSÉE' : '— EXPIRÉE'}
          </button>
        )}
      </div>

      {children}

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
                    : faite
                      ? {
                          width: 34,
                          height: 34,
                          background: DEGRADE_OR,
                          color: '#fff',
                          boxShadow: '0 3px 10px rgba(176,118,60,.32), inset 0 -2px 5px rgba(0,0,0,.14)',
                        }
                      : courante
                        ? { width: 34, height: 34, background: '#fff', border: '2px dashed #cf9a5e', color: '#cf9a5e' }
                        : { width: 34, height: 34, background: '#fff', border: '2px dashed #dcdad5', color: '#c9cbc6' }
                }
              >
                <Icone className={estDernier && finalite ? 'h-[15px] w-[15px]' : 'h-[13px] w-[13px]'} />
              </div>
            </div>,
            i < dernier ? (
              <div
                key={`${etape.id}-barre`}
                className="mx-[-10px] h-[5px] rounded-[3px]"
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
                className="text-kw-md font-extrabold tracking-[-0.01em]"
                style={{
                  color: faite
                    ? estDernier && fin
                      ? fin.couleur
                      : '#16181d'
                    : courante
                      ? '#8a4b2a'
                      : '#c0c2bd',
                }}
              >
                {estDernier && fin ? fin.libelle : etape.libelle}
              </div>
            </div>,
            i < dernier ? <div key={`${etape.id}-lbl-vide`} /> : null,
          ]
        })}
      </div>

      {/* Une recommandation posée sur une étape de l'ancien cycle ne se voit pas dans le rail :
          on le dit, sinon le rail semble simplement vide sans raison. */}
      {indexCourant < 0 && !finalite && (
        <p className="pb-1 text-center text-kw-tiny text-kw-faint">
          Étape « {etapes.find((e) => e.code === codeCourant)?.libelle ?? codeCourant} » : ancien cycle de vie, hors rail.
        </p>
      )}
    </div>
  )
}
