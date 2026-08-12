import type { CSSProperties, ReactNode } from 'react'

/**
 * Les deux héros de l'onglet Compte — maquette « Fiche Compte » de William (12/08/2026).
 *
 * Valeurs reprises telles quelles : dégradés radiaux, ombres, halo pulsant, reflet balayant,
 * anneau de progression animé et cadence des segments. Elles sont en style inline comme chez lui,
 * parce que Tailwind n'exprime ni un `radial-gradient` positionné, ni les courbes d'accélération
 * employées, ni un délai d'animation calculé par index.
 *
 * Ce que la maquette ne donne pas, c'est le calcul : elle affiche 81/100 en dur. Le barème retenu
 * est celui de son infobulle « Détail du calcul » — ancienneté, part de sites clients, potentiel
 * des prospects — chacun sur une échelle de 35 points, l'échelle que ses barres utilisent déjà.
 * Les coefficients restent à valider avec lui.
 */

/** Circonférence de l'anneau : r=42 → 2πr ≈ 264, la valeur en dur de la maquette. */
const CIRCONFERENCE = 264

function Anneau({
  /** Part remplie, entre 0 et 1. */
  part,
  couleurDebut,
  couleurFin,
  identifiantDegrade,
  delai,
  children,
}: {
  part: number
  couleurDebut: string
  couleurFin: string
  identifiantDegrade: string
  delai: string
  children: ReactNode
}) {
  const offset = CIRCONFERENCE - CIRCONFERENCE * Math.max(0, Math.min(1, part))

  return (
    <div className="relative h-14 w-14 flex-none">
      <svg viewBox="0 0 100 100" className="h-14 w-14" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="11" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={`url(#${identifiantDegrade})`}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={CIRCONFERENCE}
          style={
            {
              // Animation de la maquette : l'anneau se remplit de la circonférence vers l'offset
              // cible. Les deux bornes passent par des custom properties, comme chez William —
              // vérifié dans le navigateur, Chrome interpole bien (157px à mi-parcours d'un
              // 264 → 50). Les @keyframes vivent dans index.css et non dans tailwind.config.js :
              // appelées ici en style inline, aucune classe `animate-*` ne les retient, et le
              // purge du bundle les supprimait.
              '--l': String(CIRCONFERENCE),
              '--o': String(offset),
              strokeDashoffset: offset,
              animation: `kw-ring-in 1.1s cubic-bezier(.3,1.05,.4,1) ${delai} both`,
            } as CSSProperties
          }
        />
        <defs>
          <linearGradient id={identifiantDegrade} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={couleurDebut} />
            <stop offset="100%" stopColor={couleurFin} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[18px] font-extrabold leading-none tracking-[-.02em]">{children}</span>
      </div>
    </div>
  )
}

/** Halo pulsant et reflet balayant, communs aux deux héros. Purement décoratifs : ils ne doivent
 *  jamais intercepter le clic, d'où le `pointer-events-none` sur le calque. */
function Decor({
  halo,
  dureeSheen,
  delaiSheen,
  delaiHalo,
  opaciteSheen,
}: {
  halo: CSSProperties
  dureeSheen: string
  delaiSheen: string
  delaiHalo: string
  opaciteSheen: string
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div
        className="absolute h-[200px] w-[200px] rounded-full"
        style={{ ...halo, animation: `kw-glow-pulse 5s ease-in-out ${delaiHalo} infinite` }}
      />
      <div
        className="absolute bottom-0 top-0 w-[60px]"
        style={{
          background: `linear-gradient(90deg,transparent,rgba(255,255,255,${opaciteSheen}),transparent)`,
          animation: `kw-sheen ${dureeSheen} ease-in-out ${delaiSheen} infinite`,
        }}
      />
    </div>
  )
}

export interface FacteurValeur {
  libelle: string
  points: number
  /** Points maximum de ce facteur, pour dimensionner sa barre à sa juste proportion. La maquette
   *  divise par 35 en dur ; le barème de Kimatch plafonne différemment selon le facteur. */
  maximum: number
  /** Ambre pour ce qui reste à convertir, bleu clair pour l'acquis — codage de la maquette. */
  teinte: 'acquis' | 'potentiel'
}

/**
 * Héro 1 — valeur du compte. Le score agrège trois facteurs, détaillés dans l'infobulle « i ».
 */
export function HeroValeurCompte({
  score,
  libelle,
  facteurs,
  evolution,
  onPlanAction,
}: {
  score: number
  libelle: string
  facteurs: FacteurValeur[]
  /** Variation sur 12 mois, nulle quand l'historique ne permet pas de la calculer. */
  evolution: number | null
  onPlanAction?: () => void
}) {
  return (
    <div
      className="animate-kw-hero-rise relative overflow-visible rounded-2xl px-[15px] py-[13px] text-white"
      style={{
        background: 'radial-gradient(125% 130% at 6% 0%,#4d78ab 0%,#33547d 48%,#1e3654 100%)',
        boxShadow: '0 8px 24px rgba(30,54,84,.24)',
      }}
    >
      <Decor
        halo={{
          right: -60,
          top: -80,
          background: 'radial-gradient(circle,rgba(150,200,255,.26),transparent 70%)',
        }}
        dureeSheen="6s"
        delaiSheen="0s"
        delaiHalo="0s"
        opaciteSheen=".13"
      />

      <div className="relative flex items-center gap-3">
        <Anneau part={score / 100} couleurDebut="#a9d4ff" couleurFin="#5fa8f5" identifiantDegrade="kwGradValeur" delai=".12s">
          {score}
        </Anneau>

        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase tracking-[.1em] text-[#a9c9ea]">Valeur du compte</div>
          <div className="mt-0.5 truncate text-sm font-extrabold tracking-[-.01em]">{libelle}</div>
          <div className="mt-[5px] flex items-center gap-[7px] text-[9.5px] font-bold text-white/[.72]">
            {evolution !== null && (
              <span style={{ color: evolution >= 0 ? '#8fe6bd' : '#ffb4a2' }}>
                {evolution >= 0 ? '▲' : '▼'} {evolution >= 0 ? '+' : ''}
                {evolution}
              </span>
            )}
            12 mois
            <span className="text-white/[.32]">·</span>
            {score}/100
          </div>
        </div>

        {/* Infobulle du détail de calcul, au survol comme dans la maquette (.ib / .ibp). */}
        <span className="kw-ib h-5 w-5 flex-none self-start rounded-full border border-white/[.24] bg-white/[.16] text-[10px] font-extrabold transition-colors hover:bg-white/[.28]">
          <span className="flex h-full w-full items-center justify-center">i</span>
          <span className="kw-ibp">
            <span className="mb-2 block text-[9px] font-extrabold uppercase tracking-[.07em] text-[#a9c9ea]">
              Détail du calcul
            </span>
            {facteurs.map((f) => (
              <span key={f.libelle} className="mb-2 block last:mb-0">
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 text-[10.5px] leading-[1.35] text-white/[.86]">{f.libelle}</span>
                  <span
                    className="flex-none font-mono text-[10px] font-bold"
                    style={{ color: f.teinte === 'potentiel' ? '#ffd79a' : '#a9d4ff' }}
                  >
                    +{f.points}
                  </span>
                </span>
                <span className="mt-1 block h-[3px] overflow-hidden rounded-sm bg-white/[.14]">
                  <span
                    className="block h-full rounded-sm"
                    style={{
                      width: `${Math.min(100, (f.points / Math.max(1, f.maximum)) * 100)}%`,
                      background: `linear-gradient(90deg,${f.teinte === 'potentiel' ? '#ffd79a' : '#a9d4ff'},rgba(255,255,255,.55))`,
                    }}
                  />
                </span>
              </span>
            ))}
            {onPlanAction && (
              <button
                type="button"
                onClick={onPlanAction}
                className="mt-2 block w-full rounded-lg bg-white/[.16] py-1.5 text-[10.5px] font-bold transition-colors hover:bg-white/[.26]"
              >
                ◈ Voir le plan d’action
              </button>
            )}
          </span>
        </span>
      </div>
    </div>
  )
}

export interface FaitEllipro {
  libelle: string
  /** Explication affichée au survol du libellé. */
  aide: string
  valeur: string
}

/**
 * Héro 2 — score Ellipro. Dix segments plutôt qu'une barre continue : la notation Ellisphere est
 * une note sur 10, la maquette la représente donc en pas discrets.
 */
export function HeroScoreEllipro({
  note,
  libelle,
  faits,
  onActualiser,
}: {
  /** Note Ellisphere sur 10. `null` quand le compte n'a jamais été interrogé. */
  note: number | null
  libelle: string
  faits: FaitEllipro[]
  onActualiser?: () => void
}) {
  const remplis = note ?? 0
  return (
    <div
      className="animate-kw-hero-rise relative overflow-visible rounded-2xl px-[15px] py-[13px] text-white"
      style={{
        background: 'radial-gradient(125% 130% at 92% 0%,#189c78 0%,#0b5c48 48%,#07382c 100%)',
        boxShadow: '0 8px 24px rgba(7,56,44,.24)',
        animationDelay: '60ms',
      }}
    >
      <Decor
        halo={{
          left: -60,
          bottom: -90,
          background: 'radial-gradient(circle,rgba(120,235,190,.24),transparent 70%)',
        }}
        dureeSheen="6.5s"
        delaiSheen=".5s"
        delaiHalo=".8s"
        opaciteSheen=".12"
      />

      <div className="relative flex items-center gap-3">
        <Anneau part={remplis / 10} couleurDebut="#8fe6bd" couleurFin="#3fc492" identifiantDegrade="kwGradEllipro" delai=".2s">
          {note ?? '—'}
        </Anneau>

        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase tracking-[.1em] text-[#9fdcc4]">Score Ellipro</div>
          <div className="mt-0.5 truncate text-sm font-extrabold tracking-[-.01em]">{libelle}</div>

          <div className="mt-[7px] flex items-center gap-[3px]">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                title={`${i + 1} / 10`}
                className="block h-[6px] flex-1 rounded-[3px]"
                style={{
                  background: i < remplis ? 'linear-gradient(180deg,#8fe6bd,#3fc492)' : 'rgba(255,255,255,.16)',
                  // Les segments remplis se posent l'un après l'autre, 45 ms d'écart.
                  animation: i < remplis ? `kw-hero-rise .4s ease-out ${260 + i * 45}ms both` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {onActualiser && (
          <button
            type="button"
            onClick={onActualiser}
            title="Actualiser le score auprès d’Ellisphere"
            className="h-5 w-5 flex-none self-start rounded-full border border-white/[.24] bg-white/[.16] text-[10px] font-extrabold transition-colors hover:bg-white/[.28]"
          >
            ↻
          </button>
        )}
      </div>

      <div className="relative mt-[11px] flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/[.14] pt-[9px]">
        {faits.map((f) => (
          <span key={f.libelle} className="flex items-baseline gap-1.5">
            <span title={f.aide} className="cursor-help text-[9.5px] font-semibold text-white/[.6]">
              {f.libelle}
            </span>
            <span className="font-mono text-[10.5px] font-bold">{f.valeur}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
