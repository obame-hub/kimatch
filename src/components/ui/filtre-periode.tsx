import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, X } from 'lucide-react'
import { Input } from '@/components/ui/form'
import { CONTROLE_BARRE } from '@/components/ui/list-toolbar'
import { cn } from '@/lib/utils'

/**
 * FILTRER SUR UNE PÉRIODE — « le moyen de sélectionner une date » (Michel, 01/09/2026).
 *
 * Un bouton dans la barre de travail, qui dit l'état du filtre, et un panneau qui contient deux
 * choses : des raccourcis pour les périodes qu'on demande tous les jours, et deux champs de date
 * pour toutes les autres.
 *
 * ══ POURQUOI LES DEUX, ET PAS L'UN OU L'AUTRE ══
 *
 * Les raccourcis seuls ne répondent pas à « et le trimestre de l'an dernier ? ». Deux champs seuls
 * obligent à saisir quatre fois par jour les mêmes bornes — « les dépassées », c'est d'hier à
 * jamais, et personne ne devrait avoir à l'écrire. Les raccourcis remplissent les champs, ils ne les
 * remplacent pas : après un clic sur « 3 prochains mois », on VOIT les deux dates choisies et on
 * peut en corriger une. Rien n'est caché derrière un mot.
 *
 * ══ LE CHAMP DE DATE EST NATIF, ET C'EST UN CHOIX ══
 *
 * `MenuChoix` existe parce que la liste d'un `<select>` ouvert est dessinée par le navigateur hors
 * de la page, donc inatteignable par le CSS — une apparence qui ne nous appartient pas. Le
 * calendrier de `<input type="date">` est dans le même cas, mais l'échange n'est pas le même : un
 * calendrier réécrit à la main, c'est la navigation clavier mois par mois, les semaines
 * commençant lundi, les fuseaux, la saisie au format français ET la lecture par un lecteur d'écran —
 * beaucoup de choses à casser pour gagner un dessin. Le champ FERMÉ, lui, porte nos jetons.
 *
 * ══ LES BORNES SONT INCLUSIVES, DES DEUX CÔTÉS ══
 *
 * « du 1er au 30 » contient le 30. C'est ce que tout le monde entend, et c'est ce que la requête
 * fait : `gte(min)` et `lte(max)`. Une borne haute exclusive aurait perdu un dossier par mois sans
 * que personne ne s'en aperçoive.
 */

export interface Periode {
  /** Borne basse incluse, au format « AAAA-MM-JJ ». */
  min: string | null
  /** Borne haute incluse. */
  max: string | null
}

export const PERIODE_VIDE: Periode = { min: null, max: null }

export function periodeActive(p: Periode): boolean {
  return Boolean(p.min || p.max)
}

/** Le jour courant en « AAAA-MM-JJ », lu en heure LOCALE — `toISOString()` recule d'un jour le soir. */
function jourIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

function decale(jours: number): string {
  const d = new Date()
  d.setDate(d.getDate() + jours)
  return jourIso(d)
}

function decaleMois(mois: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + mois)
  return jourIso(d)
}

/**
 * Les raccourcis, dans l'ordre du travail : ce qui est en retard, ce qui arrive, ce qui est fait.
 *
 * « Dépassées » s'arrête HIER et non aujourd'hui : une échéance qui tombe ce matin n'est pas encore
 * ratée, et la ranger avec les retards ferait paniquer pour rien.
 */
const RACCOURCIS: { libelle: string; periode: () => Periode }[] = [
  { libelle: 'Dépassées', periode: () => ({ min: null, max: decale(-1) }) },
  { libelle: '30 prochains jours', periode: () => ({ min: jourIso(new Date()), max: decale(30) }) },
  { libelle: '3 prochains mois', periode: () => ({ min: jourIso(new Date()), max: decaleMois(3) }) },
  { libelle: '12 prochains mois', periode: () => ({ min: jourIso(new Date()), max: decaleMois(12) }) },
  { libelle: 'Cette année', periode: () => ({ min: `${new Date().getFullYear()}-01-01`, max: `${new Date().getFullYear()}-12-31` }) },
  { libelle: 'Année dernière', periode: () => ({ min: `${new Date().getFullYear() - 1}-01-01`, max: `${new Date().getFullYear() - 1}-12-31` }) },
]

const court = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4)

/** Ce que le bouton annonce. Il doit se lire sans être ouvert, sinon le filtre s'oublie. */
function resume(libelle: string, p: Periode): string {
  if (p.min && p.max) return `${libelle} ${court(p.min)} → ${court(p.max)}`
  if (p.min) return `${libelle} dès le ${court(p.min)}`
  if (p.max) return `${libelle} jusqu'au ${court(p.max)}`
  return libelle
}

export function FiltrePeriode({
  libelle,
  valeur,
  onChange,
}: {
  /** Le nom du champ filtré — « Clôture », « Échéance ». Sert de repli au bouton et de titre. */
  libelle: string
  valeur: Periode
  onChange: (p: Periode) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [cadre, setCadre] = useState<{ haut: number; gauche: number; versLeHaut: boolean } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const panneau = useRef<HTMLDivElement>(null)
  const actif = periodeActive(valeur)

  useLayoutEffect(() => {
    if (!ouvert || !bouton.current) return
    const r = bouton.current.getBoundingClientRect()
    const hauteur = 300
    const versLeHaut = window.innerHeight - r.bottom < hauteur + 16 && r.top > hauteur
    setCadre({ haut: versLeHaut ? r.top - 6 : r.bottom + 6, gauche: r.left, versLeHaut })
  }, [ouvert])

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => {
      const c = e.target as Node
      if (!bouton.current?.contains(c) && !panneau.current?.contains(c)) setOuvert(false)
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOuvert(false); bouton.current?.focus() }
    }
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', echap)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', echap)
    }
  }, [ouvert])

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        className={cn(
          CONTROLE_BARRE,
          'inline-flex items-center gap-1.5 px-2.5',
          actif
            ? 'border-km-green bg-km-green-soft text-km-text'
            : ouvert
              ? 'border-km-green bg-km-surface text-km-text'
              : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft hover:text-km-text',
        )}
      >
        <CalendarDays className={cn('h-3.5 w-3.5 shrink-0', actif ? 'text-km-green' : 'text-km-faint')} />
        <span className="truncate">{resume(libelle, valeur)}</span>
        {/* LA CROIX EST DANS LE BOUTON, PAS DANS LE PANNEAU. Un filtre posé s'enlève d'un geste,
            sans avoir à rouvrir ce qu'on vient de fermer. */}
        {actif && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Retirer le filtre ${libelle.toLowerCase()}`}
            onClick={(e) => { e.stopPropagation(); onChange(PERIODE_VIDE); setOuvert(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(PERIODE_VIDE) }
            }}
            className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-km-muted hover:bg-km-green/15 hover:text-km-text"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {ouvert && cadre && createPortal(
        <div
          ref={panneau}
          role="dialog"
          aria-label={`Filtrer par ${libelle.toLowerCase()}`}
          style={{
            position: 'fixed',
            top: cadre.versLeHaut ? undefined : cadre.haut,
            bottom: cadre.versLeHaut ? window.innerHeight - cadre.haut : undefined,
            left: Math.min(cadre.gauche, Math.max(8, window.innerWidth - 268)),
            width: 260,
          }}
          className="z-50 rounded-km-md border border-km-line bg-km-surface p-2.5 shadow-km-pop"
        >
          <p className="mb-1.5 text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">
            Raccourcis
          </p>
          <div className="flex flex-wrap gap-1">
            {RACCOURCIS.map((r) => {
              const p = r.periode()
              const choisi = valeur.min === p.min && valeur.max === p.max
              return (
                <button
                  key={r.libelle}
                  type="button"
                  onClick={() => { onChange(p); setOuvert(false) }}
                  className={cn(
                    'rounded-km-sm border px-2 py-1 text-km-tiny font-semibold transition-colors',
                    choisi
                      ? 'border-km-green bg-km-green text-white'
                      : 'border-km-line bg-km-surface text-km-muted hover:bg-km-green-soft hover:text-km-text',
                  )}
                >
                  {r.libelle}
                </button>
              )
            })}
          </div>

          <p className="mb-1.5 mt-3 text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">
            Dates précises
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-km-label text-km-muted">
              <span className="w-8 shrink-0">Du</span>
              <Input
                type="date"
                value={valeur.min ?? ''}
                max={valeur.max ?? undefined}
                onChange={(e) => onChange({ ...valeur, min: e.target.value || null })}
                className="h-[30px] flex-1"
              />
            </label>
            <label className="flex items-center gap-2 text-km-label text-km-muted">
              <span className="w-8 shrink-0">Au</span>
              <Input
                type="date"
                value={valeur.max ?? ''}
                min={valeur.min ?? undefined}
                onChange={(e) => onChange({ ...valeur, max: e.target.value || null })}
                className="h-[30px] flex-1"
              />
            </label>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-km-line pt-2">
            <button
              type="button"
              onClick={() => onChange(PERIODE_VIDE)}
              disabled={!actif}
              className="text-km-label font-semibold text-km-muted hover:text-km-text disabled:opacity-40"
            >
              Effacer
            </button>
            <button
              type="button"
              onClick={() => { setOuvert(false); bouton.current?.focus() }}
              className="rounded-km-sm bg-km-green px-2.5 py-1 text-km-label font-semibold text-white hover:brightness-95"
            >
              Fermer
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
