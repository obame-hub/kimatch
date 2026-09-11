import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ══ UN SEUL BOUTON « FILTRES », QUI OUVRE TOUT ══
 *
 * William, 11/09/2026, en trois temps. D'abord une rangée de onze pastilles : « il y a trop de
 * filtres, l'utilisation doit être rendue hyper simple ». Puis deux menus séparés : « il faudrait
 * plutôt que ce soit une liste déroulante au clic avec multiples choix, cela permettrait de tout
 * afficher sans besoin de scroll ». Enfin : « je veux plutôt un bouton filtre qui affiche ensuite
 * les 2 filtres puis les multi-choix ».
 *
 * Chaque étape retire du bruit de la barre de titre. L'aboutissement est celui-ci : UN bouton, et
 * tout le reste caché derrière. Une barre de travail doit montrer ce qu'on regarde, pas les
 * réglages qui servent une fois par jour.
 *
 * ── POURQUOI UN PANNEAU À PLUSIEURS GROUPES, ET NON DEUX MENUS CÔTE À CÔTE ──
 *
 * Deux menus, c'est deux ouvertures, deux fermetures, et l'impossibilité de voir d'un coup ce qui
 * est filtré. Ici les groupes s'affichent EN COLONNES dans un même panneau : le porteur à gauche,
 * le type à droite. On voit les deux axes ensemble, on coche ce qu'on veut, on ferme une fois.
 *
 * Et c'est ce qui règle définitivement la question du défilement : le panneau s'ouvre à la taille
 * de son contenu, en largeur comme en hauteur.
 *
 * ── LE PANNEAU PASSE PAR UN PORTAIL ──
 *
 * Sans lui, il est coupé par le premier parent en `overflow: hidden` — et une barre de titre de
 * tableau vit toujours dans un conteneur qui défile. Sa position est calculée AVANT la peinture,
 * sinon il apparaîtrait une image en haut à gauche de la page avant de sauter à sa place ; et il
 * bascule au-dessus du bouton quand le bas de la fenêtre est trop proche.
 *
 * Même mécanique que `MenuChoix`, délibérément : c'est la partie qu'il ne faut pas réinventer
 * différemment d'un composant à l'autre.
 *
 * ── AUCUNE CASE COCHÉE VEUT DIRE « PAS DE FILTRE » ──
 *
 * Et non « ne rien montrer ». Décocher tout pour ne plus rien voir n'a pas de sens : ce que
 * l'utilisateur exprime alors, c'est qu'il abandonne cet axe. Le décompte du bouton ne compte donc
 * que les axes RÉELLEMENT restreints — un groupe vide n'y figure pas.
 */

export interface ChoixFiltre {
  valeur: string
  libelle: string
  /** L'effectif, affiché à droite de la ligne. Il porte sur l'ensemble, pas sur le résultat filtré. */
  nombre?: number
}

export interface GroupeFiltre {
  cle: string
  /** Le titre de la colonne — « Porteur », « Type ». */
  etiquette: string
  choix: ChoixFiltre[]
  valeurs: string[]
  onChange: (v: string[]) => void
}

export function MenuFiltres({
  groupes,
  className,
  aligne = 'droite',
  sombre = false,
}: {
  groupes: GroupeFiltre[]
  className?: string
  aligne?: 'gauche' | 'droite'
  /** Sur une barre de titre sombre, le bouton s'habille en clair. */
  sombre?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [cadre, setCadre] = useState<{ haut: number; gauche: number; largeur: number; versLeHaut: boolean } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const panneau = useRef<HTMLDivElement>(null)

  /* On ne compte QUE les axes réellement restreints : un groupe sans case cochée ne filtre rien,
     il ne doit donc pas gonfler le compteur du bouton. */
  const axesActifs = groupes.filter((g) => g.valeurs.length > 0).length
  const casesCochees = groupes.reduce((n, g) => n + g.valeurs.length, 0)

  useLayoutEffect(() => {
    if (!ouvert || !bouton.current) return
    const r = bouton.current.getBoundingClientRect()
    const plusLong = Math.max(...groupes.map((g) => g.choix.length), 1)
    const hauteurEstimee = Math.min(plusLong * 30 + 82, 420)
    const largeur = Math.min(groupes.length * 200 + 16, window.innerWidth - 32)
    const placeEnDessous = window.innerHeight - r.bottom
    const versLeHaut = placeEnDessous < hauteurEstimee + 16 && r.top > hauteurEstimee
    setCadre({
      haut: versLeHaut ? r.top - 6 : r.bottom + 6,
      // Aligné à droite, le panneau part du bord droit du bouton : ouvert vers la gauche, il reste
      // dans la page même quand le bouton est collé au bord.
      gauche: r.right,
      largeur,
      versLeHaut,
    })
  }, [ouvert, groupes])

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      const c = e.target as Node
      if (!bouton.current?.contains(c) && !panneau.current?.contains(c)) setOuvert(false)
    }
    // Un panneau ouvert doit suivre son bouton ou disparaître : sa position est figée à
    // l'ouverture, le laisser flotter pendant un défilement le détacherait de ce qu'il commande.
    const bouge = () => setOuvert(false)
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOuvert(false); bouton.current?.focus() }
    }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', auClavier)
    window.addEventListener('scroll', bouge, true)
    window.addEventListener('resize', bouge)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', auClavier)
      window.removeEventListener('scroll', bouge, true)
      window.removeEventListener('resize', bouge)
    }
  }, [ouvert])

  function basculer(g: GroupeFiltre, v: string) {
    g.onChange(g.valeurs.includes(v) ? g.valeurs.filter((x) => x !== v) : [...g.valeurs, v])
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={axesActifs > 0 ? `Filtres — ${casesCochees} sélectionnés` : 'Filtres'}
        title={axesActifs > 0 ? `${casesCochees} filtre${casesCochees > 1 ? 's' : ''} actif${casesCochees > 1 ? 's' : ''}` : 'Filtrer la liste'}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-km-label font-semibold',
          'cursor-pointer transition-all duration-200 hover:-translate-y-px',
          'focus-visible:outline-none focus-visible:ring-2',
          sombre
            ? cn('focus-visible:ring-white/60',
                 axesActifs > 0 || ouvert
                   ? 'border-white/40 bg-white/20 text-white'
                   : 'border-white/25 bg-transparent text-white/60 hover:border-white/45 hover:text-white')
            : cn('focus-visible:ring-km-green/40',
                 axesActifs > 0 || ouvert
                   ? 'border-km-green bg-km-green-soft text-km-text'
                   : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft hover:text-km-text'),
          className,
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
        Filtres
        {/* LE COMPTEUR N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À DIRE. Un « 0 » permanent serait un
            bruit de plus, exactement ce que ce bouton est venu supprimer. */}
        {casesCochees > 0 && (
          <span className={cn('rounded-full px-1.5 tabular-nums', sombre ? 'bg-white/25' : 'bg-km-green/15')}>
            {casesCochees}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', ouvert && 'rotate-180')} />
      </button>

      {ouvert && cadre && createPortal(
        <div
          ref={panneau}
          role="dialog"
          aria-label="Filtres"
          style={{
            position: 'fixed',
            top: cadre.versLeHaut ? undefined : cadre.haut,
            bottom: cadre.versLeHaut ? window.innerHeight - cadre.haut : undefined,
            left: aligne === 'gauche' ? cadre.gauche - cadre.largeur : undefined,
            right: aligne === 'droite' ? window.innerWidth - cadre.gauche : undefined,
            width: cadre.largeur,
          }}
          className="animate-km-hub-pop z-50 rounded-km-md border border-km-line bg-km-surface p-2 shadow-km-pop"
        >
          {/* LES GROUPES EN COLONNES : on voit les deux axes ensemble, on coche, on ferme une fois. */}
          <div className="flex gap-2">
            {groupes.map((g, i) => (
              <div key={g.cle} className={cn('min-w-0 flex-1', i > 0 && 'border-l border-km-line pl-2')}>
                <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
                  <span className="truncate text-km-tiny font-bold uppercase tracking-[.08em] text-km-faint">
                    {g.etiquette}
                  </span>
                  {g.valeurs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => g.onChange([])}
                      className="shrink-0 text-km-tiny font-semibold text-km-green hover:underline"
                    >
                      effacer
                    </button>
                  )}
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  {g.choix.length === 0 ? (
                    <p className="px-1.5 py-2 text-km-tiny text-km-faint">Rien à filtrer</p>
                  ) : g.choix.map((c) => {
                    const coche = g.valeurs.includes(c.valeur)
                    return (
                      <button
                        key={c.valeur}
                        type="button"
                        role="checkbox"
                        aria-checked={coche}
                        onClick={() => basculer(g, c.valeur)}
                        className="flex w-full items-center gap-2 rounded-km-sm px-1.5 py-1.5 text-left text-km-body text-km-muted transition-colors hover:bg-km-green-soft hover:text-km-text"
                      >
                        {/* UNE CASE, PAS UNE COCHE SEULE : en sélection multiple, l'œil doit voir
                            d'un coup ce qui est coché ET ce qui ne l'est pas. Une coche présente ou
                            absente ne donne que la moitié de l'information. */}
                        <span className={cn(
                          'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                          coche ? 'border-km-green bg-km-green text-white' : 'border-km-line bg-km-surface',
                        )}>
                          {coche && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{c.libelle}</span>
                        {c.nombre !== undefined && (
                          <span className="shrink-0 rounded-full bg-km-soft px-1.5 text-km-tiny font-bold tabular-nums text-km-muted">
                            {c.nombre}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* LE PIED N'APPARAÎT QUE QUAND IL SERT. Un « tout effacer » grisé en permanence occupe
              une ligne pour ne rien dire. */}
          {casesCochees > 0 && (
            <div className="mt-1 border-t border-km-line pt-1">
              <button
                type="button"
                onClick={() => groupes.forEach((g) => g.onChange([]))}
                className="w-full rounded-km-sm px-2 py-1 text-left text-km-tiny font-semibold text-km-muted transition-colors hover:bg-km-soft hover:text-km-text"
              >
                Tout effacer
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
