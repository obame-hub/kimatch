import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA COQUILLE DES PARCOURS DE CRÉATION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « le design que tu as proposé, je veux que tu réutilises la même logique
 * pour redesigner l'ensemble des enchaînements d'écran amenant à une création d'enregistrement
 * (pop-up, barre à gauche anthracite, fonctionnement par étape, etc.) ».
 *
 * Née pour la conversion d'une piste, la coquille sort donc de cet écran-là pour devenir le
 * vocabulaire commun : une fenêtre posée sur la page d'où l'on vient, un rail anthracite qui porte
 * les étapes ET ce que chacune a produit, un panneau blanc qui change seul.
 *
 * ══ POURQUOI PAS `Dialog` ══
 *
 * `Dialog` impose un titre, une description et un fond blanc sur toute sa surface. Ici la moitié
 * gauche est anthracite et l'en-tête vit DANS le rail. Le reste — le portail, le voile, la touche
 * Échap, le compteur de fenêtres ouvertes — est repris à l'identique, parce que ce sont eux qui
 * font qu'une fenêtre se comporte comme les autres.
 *
 * ══ UNE FENÊTRE, ET NON UN ÉCRAN ══
 *
 * « Ça donne plus l'impression qu'un process se lance, et non pas un changement de page complet »
 * (23/09/2026). La page d'origine reste visible tout autour : on sait qu'on y reviendra, et ce
 * qu'on fait se lit comme quelque chose qu'on a DÉCLENCHÉ depuis elle.
 */

export interface EtapeParcours {
  cle: string
  libelle: string
  /** Étape que Kimatch franchit seul — le rail l'annonce plutôt que de la faire attendre. */
  auto?: boolean
}

/** Ce qu'une étape déjà franchie a produit, tel que le rail le rappelle. */
export interface ResumeEtape {
  lignes: string[]
  mono?: boolean
  /** Des éléments qu'on rouvre d'un clic — les compteurs d'un lot de factures (29/09/2026). */
  elements?: ElementRail[]
}

/** Un élément cliquable du rail : son nom, une précision, et où il en est. */
export interface ElementRail {
  cle: string
  libelle: string
  detail?: string | null
  etat: 'lecture' | 'complet' | 'incomplet' | 'erreur'
  actif?: boolean
  onChoisir: () => void
}

/* L'état se lit à la forme autant qu'à la couleur : un anneau qui tourne, une coche, un point creux,
   un triangle — jamais le vert et le rouge seuls. */
function EtatElement({ etat }: { etat: ElementRail['etat'] }) {
  if (etat === 'lecture') return <Loader2 className="h-[12px] w-[12px] shrink-0 animate-spin text-km-side-green" />
  if (etat === 'complet') {
    return (
      <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full bg-km-side-green">
        <Check className="h-[8px] w-[8px] stroke-[3.6] text-[#10231D]" />
      </span>
    )
  }
  if (etat === 'erreur') return <AlertTriangle className="h-[12px] w-[12px] shrink-0 text-[#F0A08F]" />
  return <span className="h-[11px] w-[11px] shrink-0 rounded-full border-[1.5px] border-[#C9A64E]" />
}

/*
  ══════════════════════════════════════════════════════════════════════════════════════════════════
  FERMER UN PARCOURS SE CONFIRME DÈS QU'IL Y A QUELQUE CHOSE À PERDRE
  ══════════════════════════════════════════════════════════════════════════════════════════════════

  William, 29/09/2026 : « cette fonctionnalité de confirmer une fermeture avant de fermer un process
  devrait être faite à chaque fois. Sur les process qu'on a déjà créés et sur les futurs à créer
  également. Car il est très frustrant de tout perdre avec juste une fausse manip. »

  LA RÈGLE VIT DANS LA COQUILLE, PAS DANS CHAQUE PARCOURS. `FenetreParcours` n'accepte plus un simple
  `onFermer` : elle exige une `sortie`, que seul `useSortieParcours` fabrique, et qui exige à son tour
  de dire `entame` — y a-t-il, là, maintenant, quelque chose que fermer ferait perdre ? Un parcours
  à venir ne peut donc pas être écrit sans répondre à la question : le typage le refuse.

  TOUS LES GESTES DE SORTIE PASSENT PAR `sortie.demander` : la croix du rail, Échap, le clic sur le
  voile, et les « Annuler » / « Fermer » des écrans. Rien d'entamé : on ferme sans question, comme
  avant. Sinon : une petite fenêtre, « Reprendre » en bouton principal — c'est la réponse à une
  fausse manip, donc celle qu'un Entrée réflexe doit donner.
*/

/** Une ligne de la confirmation : ce qui se perd (`perdu`), ou ce qui reste en place. */
export interface LigneSortie {
  texte: ReactNode
  perdu?: boolean
}

export interface OptionsSortie {
  /** Y a-t-il quelque chose — saisi, déposé, choisi — que fermer maintenant ferait perdre ? */
  entame: boolean
  /** La fermeture elle-même, une fois décidée (ou sans question quand rien n'est entamé). */
  onFermer: () => void
  /** Un travail est en cours d'écriture : on ne ferme pas du tout, on attend qu'il aboutisse. */
  bloque?: boolean
  titre?: string
  description?: string
  lignes?: LigneSortie[]
  /** Une précision en encadré, sous les lignes. */
  note?: string
  libelleFermer?: string
}

export interface SortieParcours {
  demander: () => void
  /** Réservé à la coquille : l'état de la confirmation et ses deux réponses. */
  demandee: boolean
  reprendre: () => void
  confirmer: () => void
  options: OptionsSortie
}

export function useSortieParcours(options: OptionsSortie): SortieParcours {
  const [demandee, setDemandee] = useState(false)
  /* Les options changent à chaque frappe ; les gestes, eux, doivent rester les mêmes fonctions pour
     que les écoutes du clavier ne se réinstallent pas à chaque rendu. */
  const courantes = useRef(options)
  courantes.current = options

  const demander = useCallback(() => {
    const o = courantes.current
    if (o.bloque) return
    if (o.entame) setDemandee(true)
    else o.onFermer()
  }, [])
  const reprendre = useCallback(() => setDemandee(false), [])
  const confirmer = useCallback(() => {
    setDemandee(false)
    courantes.current.onFermer()
  }, [])

  return { demander, demandee, reprendre, confirmer, options }
}

function ConfirmationSortie({ sortie }: { sortie: SortieParcours }) {
  const o = sortie.options
  const lignes = o.lignes ?? [{ texte: 'Ce que vous avez saisi dans ce parcours sera perdu.', perdu: true }]
  return (
    <Dialog
      open
      onClose={sortie.reprendre}
      title={o.titre ?? 'Fermer sans terminer ?'}
      description={o.description ?? 'Rien de ce qui est en cours n’est encore enregistré.'}
      className="max-w-md"
    >
      <div className="space-y-3">
        <ul className="space-y-1.5 text-km-body leading-snug text-km-text">
          {lignes.map((l, i) => (
            <li key={i} className="flex gap-2">
              {l.perdu
                ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-red" />
                : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-green" />}
              <span>{l.texte}</span>
            </li>
          ))}
        </ul>
        {o.note && (
          <p className="rounded-lg border border-km-line bg-km-bg/60 px-3 py-2 text-km-label leading-snug text-km-muted">
            {o.note}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-km-line pt-3">
          <Button variant="ghost" onClick={sortie.confirmer}>{o.libelleFermer ?? 'Fermer sans terminer'}</Button>
          <Button autoFocus onClick={sortie.reprendre}>Reprendre</Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ══ DEUX PARCOURS L'UN SUR L'AUTRE ══
   Le mandat ouvre la création d'un contact par-dessus lui-même. Les deux écoutent Échap : sans
   cette pile, la touche fermerait le contact ET demanderait la sortie du mandat. Seul le parcours
   du dessus répond. */
const pileDesParcours: number[] = []
let prochainParcours = 0

export function FenetreParcours({ sortie, children }: { sortie: SortieParcours; children: ReactNode }) {
  const { demander, reprendre, demandee } = sortie
  const moi = useRef<number>(-1)
  useEffect(() => {
    moi.current = ++prochainParcours
    pileDesParcours.push(moi.current)
    return () => {
      const i = pileDesParcours.indexOf(moi.current)
      if (i >= 0) pileDesParcours.splice(i, 1)
    }
  }, [])
  /* Échap pendant la confirmation, c'est « Reprendre » — jamais une seconde demande de sortie. */
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pileDesParcours[pileDesParcours.length - 1] !== moi.current) return
      if (demandee) reprendre()
      else demander()
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [demander, reprendre, demandee])

  /* Les pastilles flottantes (appel, notifications) se retirent quand le document porte cette
     marque. Un compteur et non un booléen : une confirmation peut s'ouvrir par-dessus celle-ci. */
  useEffect(() => {
    const n = Number(document.body.dataset.modalesOuvertes ?? '0') + 1
    document.body.dataset.modalesOuvertes = String(n)
    return () => {
      const reste = Number(document.body.dataset.modalesOuvertes ?? '1') - 1
      if (reste > 0) document.body.dataset.modalesOuvertes = String(reste)
      else delete document.body.dataset.modalesOuvertes
    }
  }, [])

  return createPortal(
    <div
      className="animate-km-fade fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,14,12,0.62)] p-4 backdrop-blur-[3px]"
      onClick={(e) => { if (e.target === e.currentTarget) demander() }}
    >
      <div className="animate-fade-up flex h-[740px] max-h-[calc(100vh-2.5rem)] w-[1000px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(6,10,8,0.44),0_3px_14px_rgba(6,10,8,0.26)]">
        {children}
      </div>
      {demandee && <ConfirmationSortie sortie={sortie} />}
    </div>,
    document.body,
  )
}

/*
  ══ LE GRIS DES ÉTAPES À VENIR EST MESURÉ ══

  La maquette les posait en #6E7A73 sur l'anthracite : 3,8:1, sous les 4,5 exigés pour du petit
  texte. C'est le défaut déjà relevé deux fois dans `index.css` — un gris juste sur du blanc cesse
  de l'être sur du sombre. `km-side-faint` donne 5,2:1 à teinte égale. Ce qui distingue une étape à
  venir reste l'anneau creux et la graisse, pas un gris qu'on ne peut pas lire.
*/
const GRIS_A_VENIR = 'text-km-side-faint'

function Pastille({ etat, numero }: { etat: 'faite' | 'courante' | 'avenir'; numero: number }) {
  if (etat === 'faite') {
    return (
      <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-km-side-green">
        <Check className="h-[11px] w-[11px] stroke-[3.4] text-[#10231D]" />
      </span>
    )
  }
  if (etat === 'courante') {
    return (
      <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-km-side-green text-[10.5px] font-bold text-[#10231D]">
        {numero}
      </span>
    )
  }
  return (
    <span className={cn(
      'flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#3C453F] text-[10.5px] font-bold',
      GRIS_A_VENIR,
    )}>
      {numero}
    </span>
  )
}

export function RailParcours({ surtitre = 'Création', titre, reference, etapes, courante, sousTitre, resumes, note, onFermer }: {
  /** Le petit mot au-dessus du titre : « Création » pour la plupart, « Clôture » pour une recommandation qu'on ferme. */
  surtitre?: string
  titre: string
  reference?: string | null
  etapes: EtapeParcours[]
  courante: string
  /** La ligne sous l'étape en cours. */
  sousTitre?: string
  /** Ce que chaque étape a produit, par clé. */
  resumes?: Record<string, ResumeEtape | undefined>
  note?: { titre: string; texte: string }
  onFermer: () => void
}) {
  const index = etapes.findIndex((e) => e.cle === courante)

  return (
    <div className="flex w-[280px] shrink-0 flex-col gap-[22px] bg-km-side-bas px-[22px] py-[26px]">

      <div className="flex items-start gap-[10px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-km-side-faint">{surtitre}</span>
          <span className="text-[18px] font-semibold leading-[1.25] text-white">{titre}</span>
          {reference && <span className="font-mono text-[10.5px] text-km-side-faint">{reference}</span>}
        </div>
        {/* UNE FENÊTRE SE FERME, UNE PAGE NON. Le geste doit exister, et c'est lui qui déclenche
            la confirmation de sortie quand quelque chose a déjà été écrit. */}
        <button
          type="button"
          aria-label="Fermer"
          onClick={onFermer}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#2A322D] text-[#9EABA4] transition-colors hover:text-white"
        >
          <X className="h-[13px] w-[13px] stroke-[2.4]" />
        </button>
      </div>

      <div className="h-px bg-km-side-line" />

      <div className="flex flex-1 flex-col gap-[3px]">
        {etapes.map((e, i) => {
          const etat = i < index ? 'faite' : i === index ? 'courante' : 'avenir'
          /* LE RÉCAPITULATIF S'AFFICHE AUSSI SUR L'ÉTAPE EN COURS : certains écrans repartent à zéro
             en cours d'étape (le périmètre, compteur par compteur). Sans lui, ce qui vient d'être
             enregistré n'apparaîtrait nulle part et on croirait l'avoir perdu. */
          const resume = etat === 'avenir' ? undefined : resumes?.[e.cle]

          return (
            <div
              key={e.cle}
              className={cn(
                'flex gap-[11px] px-[11px] py-[10px]',
                etat === 'courante' && 'rounded-[11px] bg-[#2A322D]',
              )}
            >
              <Pastille etat={etat} numero={i + 1} />
              <div className="flex min-w-0 flex-col gap-[6px]">
                <span className={cn(
                  'text-[12.5px]',
                  etat === 'courante' ? 'font-semibold text-white' : 'font-medium',
                  etat === 'faite' && 'text-[#9EABA4]',
                  etat === 'avenir' && GRIS_A_VENIR,
                )}>
                  {e.libelle}
                </span>

                {etat === 'courante' && sousTitre && (
                  <span className="text-[10.5px] text-[#9EABA4]">{sousTitre}</span>
                )}
                {e.auto && etat === 'avenir' && (
                  <span className={cn('text-[10px]', GRIS_A_VENIR)}>Automatique</span>
                )}

                {resume?.elements && resume.elements.length > 0 && (
                  <div className="flex flex-col gap-[2px]">
                    {resume.elements.map((el) => (
                      <button
                        key={el.cle}
                        type="button"
                        onClick={el.onChoisir}
                        aria-current={el.actif ? 'true' : undefined}
                        className={cn(
                          'flex items-start gap-[8px] rounded-[8px] px-[8px] py-[6px] text-left transition-colors',
                          el.actif ? 'bg-km-side-bas' : 'hover:bg-km-side-bas/60',
                        )}
                      >
                        <span className="mt-[2px]"><EtatElement etat={el.etat} /></span>
                        <span className="flex min-w-0 flex-col gap-[1px]">
                          <span className={cn(
                            'truncate font-mono text-[10.5px] leading-[1.35]',
                            el.actif ? 'text-white' : 'text-[#D8DFDA]',
                          )}>
                            {el.libelle}
                          </span>
                          {el.detail && (
                            <span className="truncate text-[10px] leading-[1.35] text-km-side-faint">{el.detail}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {resume && resume.lignes.length > 0 && (
                  <div className="flex flex-col gap-[3px] border-l-2 border-km-side-line pl-[9px]">
                    {resume.lignes.map((l) => (
                      <span
                        key={l}
                        className={cn(
                          'leading-[1.35] text-[#D8DFDA]',
                          resume.mono ? 'font-mono text-[10.5px]' : 'text-[11px]',
                        )}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {note && (
        <div className="flex flex-col gap-[5px] rounded-[12px] border border-km-side-line bg-km-side px-[13px] py-[12px]">
          <span className="text-[10.5px] font-semibold text-[#D8DFDA]">{note.titre}</span>
          <span className="text-[10.5px] leading-[1.45] text-km-side-faint">{note.texte}</span>
        </div>
      )}
    </div>
  )
}

/** L'en-tête du panneau de droite, commun à toutes les étapes de tous les parcours. */
export function EnTeteEtape({ numero, total, titre }: { numero: number; total: number; titre: string }) {
  return (
    <div className="mb-[22px] flex flex-col gap-[5px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-km-green">
        Étape {numero} sur {total}
      </span>
      <h1 className="text-[26px] font-semibold tracking-[-0.017em] text-km-text">{titre}</h1>
    </div>
  )
}

/** Le panneau de droite : la zone blanche qui change d'une étape à l'autre. */
export function PanneauParcours({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-col px-9 pb-[22px] pt-8">{children}</div>
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES TROIS PRIMITIVES DE SAISIE DES PARCOURS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Elles sont nées dans le formulaire PDL le 23/09/2026, quand William a demandé « améliore le
 * design des toggles pour rendre la valeur sélectionnée plus lisible » et, le même jour, la fin
 * des champs ambrés : « je ne veux pas de couleur jaune pour les champs obligatoires ».
 *
 * ELLES REMONTENT ICI PARCE QU'UN SECOND PARCOURS LES DEMANDE — celui du contact. Les recopier
 * aurait produit deux jeux de classes à faire vivre en parallèle, et c'est exactement la raison
 * pour laquelle `PdlDraftRows` a été restylé sur place plutôt que copié : deux formulaires en
 * parallèle finissent toujours par diverger. Le déplacement est à l'identique, au pixel près.
 */

/** Le champ de saisie de tous les parcours. */
export const SAISIE =
  'w-full rounded-[9px] border border-km-line bg-white px-[11px] py-[8px] text-[13px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)] disabled:bg-km-soft'

/** Sa variante pour ce qui se lit chiffre par chiffre : un PDL, un SIREN, un numéro. */
export const SAISIE_MONO =
  'w-full rounded-[9px] border border-km-line bg-white px-[11px] py-[8px] font-mono text-[12.5px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)] disabled:bg-km-soft'

/** L'intitulé au-dessus d'un champ. L'astérisque dit l'obligation — aucune couleur ne la dit. */
export function Champ({ intitule, requis, children, className }: {
  intitule: string
  requis?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[5px]', className)}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
        {intitule}
        {requis && <span className="text-km-muted"> *</span>}
      </span>
      {children}
    </div>
  )
}

/**
 * Segments : la valeur retenue en vert plein, jamais en ambre.
 *
 * `obligatoire` interdit le second clic qui déselectionne. Un choix binaire qui a toujours une
 * réponse — M. ou Mme, contact ou membre du conseil syndical — ne doit pas pouvoir revenir au
 * vide : le vide n'y veut rien dire, et il rendrait le bouton de validation inactif sans que
 * l'écran puisse dire pourquoi.
 */
export function Segments({ valeur, options, onChoisir, obligatoire }: {
  valeur: string
  options: { valeur: string; libelle: string; titre?: string }[]
  onChoisir: (v: string) => void
  obligatoire?: boolean
}) {
  return (
    <div className="flex gap-[2px] rounded-[9px] border border-km-line bg-km-soft p-[3px]">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          title={o.titre}
          onClick={() => onChoisir(o.valeur === valeur && !obligatoire ? '' : o.valeur)}
          className={cn(
            'flex-1 rounded-[6px] px-[5px] py-[6px] text-[12px] transition-colors',
            o.valeur === valeur
              ? 'bg-km-green font-bold text-white'
              : 'font-medium text-km-muted hover:bg-white hover:text-km-text',
          )}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  )
}
