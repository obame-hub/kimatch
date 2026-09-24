import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from 'lucide-react'
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
}

export function FenetreParcours({ onFermer, children }: { onFermer: () => void; children: ReactNode }) {
  useEffect(() => {
    const auClavier = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [onFermer])

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
      onClick={(e) => { if (e.target === e.currentTarget) onFermer() }}
    >
      <div className="animate-fade-up flex h-[740px] max-h-[calc(100vh-2.5rem)] w-[1000px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[20px] bg-white shadow-[0_32px_80px_rgba(6,10,8,0.44),0_3px_14px_rgba(6,10,8,0.26)]">
        {children}
      </div>
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

export function RailParcours({ titre, reference, etapes, courante, sousTitre, resumes, note, onFermer }: {
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
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-km-side-faint">Création</span>
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
