import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useInlineEdit } from '@/lib/useInlineEdit'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES BRIQUES DE LA FICHE COMPTEUR v4
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Maquette Claude Design du 30/09/2026 (`handoff-fiche-compteur`), « pixel perfect » demandé par
 * William. Chaque valeur ci-dessous vient du README du paquet ou des `style="…"` de sa référence
 * HTML : rien n'est arrondi à l'échelle Tailwind la plus proche, d'où les valeurs entre crochets.
 */

/** La carte standard : fond blanc, filet `km-line`, rayon 16. « Relief » ajoute `shadow-km-card`. */
export function Carte({ relief = false, className, children, ...reste }: {
  relief?: boolean
  className?: string
  children: ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...reste}
      className={cn('rounded-[16px] border border-km-line bg-white', relief && 'shadow-km-card', className)}
    >
      {children}
    </div>
  )
}

/** Le titre de section d'une carte — 10 px, 700, capitales, espacé de .08em. */
export function Sourcil({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-[.08em] text-km-faint', className)}>
      {children}
    </span>
  )
}

/** Le menu flottant de la maquette (listes de valeurs, contacts) : `shadow-km-pop`, 120 ms. */
export const MENU_FLOTTANT =
  'z-30 rounded-[12px] border border-km-line bg-white p-1 shadow-km-pop animate-[kmFade_.12s_ease-out]'

/** Ferme un menu au clic extérieur ou à Échap — et seulement le menu : l'événement s'arrête ici. */
export function useFermeture(ref: RefObject<HTMLElement>, ouvert: boolean, fermer: () => void) {
  useEffect(() => {
    if (!ouvert) return
    const clic = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fermer() }
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fermer() } }
    document.addEventListener('mousedown', clic)
    window.addEventListener('keydown', touche, true)
    return () => {
      document.removeEventListener('mousedown', clic)
      window.removeEventListener('keydown', touche, true)
    }
  }, [ref, ouvert, fermer])
}

/** JJ/MM/AAAA, sans décalage de fuseau pour une date seule. */
export function dateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/** JJ/MM/AAAA HH:MM, à l'heure de Paris. */
export function dateHeureFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} ${d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`
}

/** Le nombre de jours entiers d'aujourd'hui à une date (négatif si elle est passée). */
export function joursJusqua(iso: string | null | undefined): number | null {
  if (!iso) return null
  const cible = new Date(`${iso.slice(0, 10)}T12:00:00`)
  const auj = new Date()
  auj.setHours(12, 0, 0, 0)
  return Math.round((cible.getTime() - auj.getTime()) / 86_400_000)
}

/** « J−92 » écrit avec un vrai signe moins (U+2212) ; « J+12 » une fois la date passée. */
export function libelleJours(n: number): string {
  return n >= 0 ? `J\u2212${n}` : `J+${Math.abs(n)}`
}

/** Un nombre à la française, avec l'espace insécable des milliers (pas l'espace fine de Chrome). */
export function nombreFr(n: number, decimales?: number): string {
  return n
    .toLocaleString('fr-FR', decimales != null ? { minimumFractionDigits: decimales, maximumFractionDigits: decimales } : undefined)
    .replace(/\u202f/g, '\u00a0')
}

/** Initiales d'un nom de personne : « Claire Dumont » → « CD ». */
export function initiales(nom: string | null | undefined): string {
  return (nom ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase()
}

/**
 * ══ UNE VALEUR QUI SE MODIFIE EN PLACE ══
 *
 * Le brief demande `useInlineEdit` — même comportement que la fiche Compte : Entrée valide, Échap
 * annule, le départ du curseur valide. Ce qui change, c'est le rendu : au repos, la valeur garde sa
 * typographie et ne gagne qu'un soulignement pointillé au survol ; en édition, le champ prend la
 * même taille et la même graisse, dans un cadre vert.
 */
export function ValeurEditable({
  valeur,
  onCommit,
  onSaved,
  onError,
  modifiable,
  classeTexte,
  classeChamp,
  vide = '—',
  titre = 'Cliquer pour modifier',
  largeurChamp,
}: {
  valeur: string
  onCommit: (v: string) => Promise<void>
  onSaved?: () => void
  onError?: (e: Error) => void
  modifiable: boolean
  /** La typographie de la valeur, au repos comme en édition. */
  classeTexte: string
  classeChamp?: string
  vide?: string
  titre?: string
  largeurChamp?: string
}) {
  const e = useInlineEdit<string>({ value: valeur, onCommit, onSaved, onError })
  if (e.editing) {
    return (
      <input
        autoFocus
        value={e.draft}
        onChange={(ev) => e.setDraft(ev.target.value)}
        onKeyDown={e.handleKeyDown}
        onBlur={() => void e.commit()}
        style={largeurChamp ? { width: largeurChamp } : undefined}
        className={cn(
          classeTexte,
          'rounded-[8px] border border-km-green px-2 py-0.5 outline-none shadow-[0_0_0_3px_rgba(13,122,95,.12)]',
          !largeurChamp && 'w-full',
          classeChamp,
        )}
      />
    )
  }
  const affiche = e.displayValue || vide
  return (
    <div
      role={modifiable ? 'button' : undefined}
      tabIndex={modifiable ? 0 : undefined}
      title={modifiable ? titre : undefined}
      onClick={modifiable ? e.start : undefined}
      onKeyDown={modifiable ? (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); e.start() } } : undefined}
      className={cn(
        classeTexte,
        'max-w-full self-start overflow-hidden text-ellipsis whitespace-nowrap border-b border-dashed border-transparent',
        modifiable && 'cursor-text hover:border-km-green',
        !e.displayValue && 'text-km-faint',
        e.pending && 'opacity-60',
      )}
    >
      {affiche}
    </div>
  )
}

/** Une liste de valeurs sous une cellule : `left:8px`, 130 px au moins, 220 px au plus, coche verte. */
export function ListeValeurs({ options, actuelle, onChoisir }: {
  options: string[]
  actuelle: string | null | undefined
  onChoisir: (v: string) => void
}) {
  return (
    <div className={cn(MENU_FLOTTANT, 'absolute left-2 top-full max-h-[220px] min-w-[130px] overflow-y-auto')}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChoisir(o)}
          className="flex w-full justify-between gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left font-mono text-[12px] font-semibold text-km-text hover:bg-km-soft"
        >
          <span>{o}</span>
          {o === actuelle && <span className="text-km-green">✓</span>}
        </button>
      ))}
    </div>
  )
}

/** Petit état local « ouvert / fermé » avec sa fermeture au clic extérieur. */
export function useMenu() {
  const ref = useRef<HTMLDivElement>(null)
  const [ouvert, setOuvert] = useState(false)
  useFermeture(ref, ouvert, () => setOuvert(false))
  return { ref, ouvert, setOuvert, basculer: () => setOuvert((o) => !o) }
}
