import type { LucideIcon } from 'lucide-react'

/** Une des quatre tuiles de tête du tableau de bord (maquette William, 11/08/2026).
 *
 * Dégradé plein, grand chiffre, barre de remplissage et un reflet qui balaie lentement la tuile.
 * Les couleurs sont passées en dur plutôt que par classes Tailwind : ce sont des dégradés propres
 * à chaque famille d'objet (contrat, opportunité, mandat, signal), repris de la maquette au pixel,
 * et qui n'existent pas dans la palette générale. */
export function TuileIndicateur({
  libelle,
  valeur,
  unite,
  detail,
  icone: Icone,
  couleurHaut,
  couleurBas,
  /** Part de la barre remplie, entre 0 et 1. */
  remplissage,
  /** Rang de la tuile, pour décaler les animations et éviter un effet de bloc. */
  index,
  onClick,
}: {
  libelle: string
  valeur: number
  unite: string
  detail: string
  icone: LucideIcon
  couleurHaut: string
  couleurBas: string
  remplissage: number
  index: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="animate-kw-card-rise group relative overflow-hidden rounded-2xl px-[17px] pb-4 pt-[15px] text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px]"
      style={{
        background: `linear-gradient(145deg,${couleurHaut} 0%,${couleurBas} 100%)`,
        boxShadow: `0 8px 22px -12px ${couleurBas}aa`,
        animationDelay: `${index * 0.05}s`,
      }}
    >
      {/* Reflet : purement décoratif, ne doit jamais intercepter le clic. */}
      <span
        aria-hidden
        className="animate-kw-sheen pointer-events-none absolute inset-y-0 left-0 w-[40%]"
        style={{
          background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)',
          animationDelay: `${index * 0.7}s`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-[34px] -top-[34px] h-32 w-32 rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(255,255,255,.22),transparent 68%)' }}
      />

      <div className="relative flex items-start gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[.19] text-white">
          <Icone className="h-4 w-4" />
        </span>
        <span className="pt-[3px] text-[10.5px] font-extrabold uppercase leading-[1.35] tracking-[.08em] text-white/[.72]">
          {libelle}
        </span>
      </div>

      <div className="relative mt-3.5 flex items-baseline gap-2.5">
        <span className="text-[44px] font-bold leading-[.92] tracking-[-.035em] text-white">{valeur}</span>
        <span className="text-xs font-semibold text-white/[.66]">{unite}</span>
      </div>

      <div className="relative mt-[11px] h-[5px] overflow-hidden rounded bg-white/20">
        <div
          className="animate-kw-bar-grow h-full origin-left rounded bg-white/[.85]"
          style={{ width: `${Math.min(100, remplissage * 100)}%`, animationDelay: `${index * 0.12 + 0.2}s` }}
        />
      </div>

      <div className="relative mt-[9px] text-[11.5px] leading-[1.4] text-white/[.78]">{detail}</div>
    </button>
  )
}
