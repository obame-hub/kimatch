import type { CSSProperties, ReactNode } from 'react'
import { teinteScore, teinteEllipro } from '@/lib/niveauScore'

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

/** Concaténation de classes, en local : ce fichier n'importait rien jusqu'ici. */
function cnHero(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

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
              animation: `km-heros-ring 1.1s cubic-bezier(.3,1.05,.4,1) ${delai} both`,
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
        <span className="text-km-metric font-bold tabular-nums leading-none">{children}</span>
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
        style={{ ...halo, animation: `km-heros-glow 5s ease-in-out ${delaiHalo} infinite` }}
      />
      <div
        className="absolute bottom-0 top-0 w-[60px]"
        style={{
          background: `linear-gradient(90deg,transparent,rgba(255,255,255,${opaciteSheen}),transparent)`,
          animation: `km-heros-sheen ${dureeSheen} ease-in-out ${delaiSheen} infinite`,
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
 * ══ HÉRO 1 — LA QUALITÉ DU COMPTE ══
 *
 * Naoëlle, 02/09/2026 : « on va enlever toute la page que tu as créée, mais on va mettre cette
 * notion à la place de la card valeur du compte sur la fiche du compte, à côté du score Ellipro. Et
 * du coup quand on clique dessus on verra tous les compteurs concernés. »
 *
 * CE QUI PART, ET POURQUOI C'EST UN BON ÉCHANGE. « Valeur du compte » agrégeait trois facteurs
 * inventés — ancienneté, part de sites clients, potentiel des prospects — avec des coefficients que
 * la maquette de William laissait « à valider », et qui ne l'ont jamais été. Le chiffre était donc
 * une opinion sans source. La qualité, elle, se déduit de faits vérifiables : y a-t-il un contrat en
 * cours, une échéance à venir, un responsable. On remplace un score qu'on ne pouvait pas défendre
 * par un score qu'on peut expliquer ligne à ligne.
 *
 * LA COULEUR SUIT LE SCORE. C'est l'autre demande du même message : « faudrait changer le vert et le
 * bleu, car ça ne donne pas d'urgence ». Rouge sous 40, orange, jaune, vert à partir de 80 — voir
 * `niveauScore`. Un compte à 12 et un compte à 95 ne peuvent plus se peindre pareil.
 *
 * LA CARTE ENTIÈRE EST LE BOUTON, et non une petite flèche dans un coin : le geste attendu après
 * avoir lu un mauvais score est d'aller voir lesquels, donc autant que toute la surface l'ouvre.
 */
export function HeroQualiteCompte({
  score,
  nbCompteurs,
  sansContrat,
  echeanceARevoir,
  sansResponsable,
  parfaits,
  onVoirCompteurs,
}: {
  score: number
  nbCompteurs: number
  sansContrat: number
  echeanceARevoir: number
  sansResponsable: number
  parfaits: number
  onVoirCompteurs?: () => void
}) {
  const t = teinteScore(score)
  const vide = nbCompteurs === 0

  /* LES TROIS MANQUES, DANS L'ORDRE DU BARÈME. Le contrat pèse le plus lourd — il fait passer de 30
     à 100 —, l'échéance ensuite, le responsable en dernier puisqu'il ne vaut que vingt ou trente
     points. Les afficher dans cet ordre, c'est dire par quoi commencer. */
  const manques = [
    { libelle: 'sans contrat en cours', nombre: sansContrat },
    { libelle: 'échéance absente ou dépassée', nombre: echeanceARevoir },
    { libelle: 'sans responsable', nombre: sansResponsable },
  ].filter((m) => m.nombre > 0)

  return (
    <div
      role={onVoirCompteurs ? 'button' : undefined}
      tabIndex={onVoirCompteurs ? 0 : undefined}
      onClick={onVoirCompteurs}
      onKeyDown={(e) => {
        if (onVoirCompteurs && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onVoirCompteurs()
        }
      }}
      className={cnHero(
        'animate-km-hero-rise relative overflow-visible rounded-2xl px-[15px] py-[13px] text-white',
        onVoirCompteurs && 'cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
      )}
      style={{ background: t.fond, boxShadow: t.ombre }}
    >
      <Decor
        halo={{ right: -60, top: -80, background: t.halo }}
        dureeSheen="6s"
        delaiSheen="0s"
        delaiHalo="0s"
        opaciteSheen=".13"
      />

      <div className="relative flex items-center gap-3">
        <Anneau
          part={score / 100}
          couleurDebut={t.anneau[0]}
          couleurFin={t.anneau[1]}
          identifiantDegrade="kwGradQualite"
          delai=".12s"
        >
          {score}
        </Anneau>

        <div className="min-w-0 flex-1">
          <div
            className="text-km-tiny font-extrabold uppercase tracking-[.1em]"
            style={{ color: t.intitule }}
          >
            Qualité du compte
          </div>
          <div className="mt-0.5 truncate text-sm font-extrabold tracking-[-.01em]">
            {vide ? 'Aucun compteur' : t.libelle}
          </div>
          <div className="mt-[5px] truncate text-km-tiny font-bold text-white/[.72]">
            {vide ? (
              /* UN COMPTE NEUF LE DIT PLUTÔT QUE DE SE TAIRE. « Quand on créera un compte, ce score
                 sera à zéro car il n'aura rien » : autant écrire pourquoi, sinon on cherche
                 l'erreur. */
              'Rien à mesurer tant qu’aucun compteur n’est rattaché'
            ) : (
              <>
                {score}/100
                <span className="mx-[5px] text-white/[.32]">·</span>
                {nbCompteurs} compteur{nbCompteurs > 1 ? 's' : ''}
                {parfaits > 0 && (
                  <>
                    <span className="mx-[5px] text-white/[.32]">·</span>
                    {parfaits} complet{parfaits > 1 ? 's' : ''}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* L'infobulle dit CE QUI MANQUE, pas comment le score est fabriqué : le calcul se lit dans
            le détail des compteurs, qu'un clic ouvre juste à côté. */}
        {!vide && (
          <span className="kw-ib h-5 w-5 flex-none self-start rounded-full border border-white/[.24] bg-white/[.16] text-km-xs font-extrabold transition-colors hover:bg-white/[.28]">
            <span className="flex h-full w-full items-center justify-center">i</span>
            <span className="kw-ibp">
              <span
                className="mb-2 block text-km-tiny font-extrabold uppercase tracking-[.07em]"
                style={{ color: t.intitule }}
              >
                Ce qui manque
              </span>
              {manques.length === 0 ? (
                <span className="block text-km-xs leading-[1.35] text-white/[.86]">
                  Rien : les {nbCompteurs} compteurs ont un contrat en cours et un responsable.
                </span>
              ) : (
                manques.map((m) => (
                  <span key={m.libelle} className="mb-1.5 flex items-baseline gap-2 last:mb-0">
                    <span className="flex-1 text-km-xs leading-[1.35] text-white/[.86]">
                      {m.libelle}
                    </span>
                    <span className="flex-none font-mono text-km-xs font-bold text-white">
                      {m.nombre}
                    </span>
                  </span>
                ))
              )}
              <span className="mt-2 block border-t border-white/[.18] pt-2 text-km-xs leading-[1.35] text-white/[.7]">
                Moyenne des scores des compteurs. Un compteur vaut 100 avec contrat et responsable,
                80 sans contrat mais avec échéance à venir et responsable, 0 sans rien.
              </span>
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

/** Un fait de la fiche Ellisphere : son intitulé, son explication au survol, sa valeur. */
export interface FaitEllipro {
  libelle: string
  /** Explication affichée au survol du libellé. */
  aide: string
  valeur: string
}

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
  /* LA MÊME ÉCHELLE QUE LA QUALITÉ, ramenée sur cent : Ellipro note sur dix, dans le même sens.
     Deux scores côte à côte doivent se comparer d'un regard, et deux échelles de couleur
     différentes sur la même ligne obligeraient à se rappeler laquelle est laquelle.
     UN COMPTE JAMAIS INTERROGÉ N'EST PAS ROUGE mais gris : rouge dirait « mauvais » là où la vérité
     est « inconnu ». Voir `teinteEllipro`. */
  const t = teinteEllipro(note)
  return (
    <div
      className="animate-km-hero-rise relative overflow-visible rounded-2xl px-[15px] py-[13px] text-white"
      style={{
        background: t.fond,
        boxShadow: t.ombre,
        animationDelay: '60ms',
      }}
    >
      <Decor
        halo={{
          left: -60,
          bottom: -90,
          background: t.halo,
        }}
        dureeSheen="6.5s"
        delaiSheen=".5s"
        delaiHalo=".8s"
        opaciteSheen=".12"
      />

      <div className="relative flex items-center gap-3">
        <Anneau
          part={remplis / 10}
          couleurDebut={t.anneau[0]}
          couleurFin={t.anneau[1]}
          identifiantDegrade="kwGradEllipro"
          delai=".2s"
        >
          {note ?? '—'}
        </Anneau>

        <div className="min-w-0 flex-1">
          <div
            className="text-km-tiny font-extrabold uppercase tracking-[.1em]"
            style={{ color: t.intitule }}
          >
            Score Ellipro
          </div>
          <div className="mt-0.5 truncate text-sm font-extrabold tracking-[-.01em]">{libelle}</div>

          <div className="mt-[7px] flex items-center gap-[3px]">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                title={`${i + 1} / 10`}
                className="block h-[6px] flex-1 rounded-[3px]"
                style={{
                  background: i < remplis
                    ? `linear-gradient(180deg,${t.anneau[0]},${t.anneau[1]})`
                    : 'rgba(255,255,255,.16)',
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
            className="h-5 w-5 flex-none self-start rounded-full border border-white/[.24] bg-white/[.16] text-km-xs font-extrabold transition-colors hover:bg-white/[.28]"
          >
            ↻
          </button>
        )}
      </div>

      <div className="relative mt-[11px] flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/[.14] pt-[9px]">
        {faits.map((f) => (
          <span key={f.libelle} className="flex items-baseline gap-1.5">
            <span title={f.aide} className="cursor-help text-km-tiny font-semibold text-white/[.6]">
              {f.libelle}
            </span>
            <span className="font-mono text-km-xs font-bold">{f.valeur}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * ══ LE MÊME HÉROS, UN CRAN PLUS BAS : LA QUALITÉ D'UN COMPTEUR ══
 *
 * Naoëlle, 02/09/2026 : « je ne vois pas le scoring des compteurs [...] j'aimerais que ça s'affiche
 * comme la card de qualité de compte sur la page d'un compte, sur 100, avec les codes couleur. »
 *
 * MÊME LANGAGE VISUEL, DÉLIBÉRÉMENT. Le score d'un compte est la moyenne de ces scores-là : les
 * peindre autrement obligerait à traduire mentalement d'un écran à l'autre au moment précis où l'on
 * cherche à vérifier une moyenne. Même anneau, mêmes seuils de couleur (`niveauScore`), même place
 * en haut de fiche.
 *
 * CE QUI CHANGE : la ligne du dessous. Sur un compte, elle résume un ensemble (« 12 compteurs, 3
 * complets ») ; ici elle nomme LA LIGNE DU BARÈME qui a produit le chiffre — « sans contrat +
 * échéance dépassée + sans responsable ». C'est ce qu'on vient lire sur une fiche : pas combien,
 * mais pourquoi.
 */
export function HeroQualiteCompteur({
  score,
  ligneBareme,
  onVoirDetail,
}: {
  score: number
  /** La ligne du barème de Michel qui a produit ce score — voir `ligneDuBareme`. */
  ligneBareme: string
  onVoirDetail?: () => void
}) {
  const t = teinteScore(score)

  return (
    <div
      role={onVoirDetail ? 'button' : undefined}
      tabIndex={onVoirDetail ? 0 : undefined}
      onClick={onVoirDetail}
      onKeyDown={(e) => {
        if (onVoirDetail && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onVoirDetail()
        }
      }}
      className={cnHero(
        'animate-km-hero-rise relative overflow-visible rounded-2xl px-[15px] py-[13px] text-white',
        onVoirDetail && 'cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
      )}
      style={{ background: t.fond, boxShadow: t.ombre }}
    >
      <Decor
        halo={{ right: -60, top: -80, background: t.halo }}
        dureeSheen="6s"
        delaiSheen="0s"
        delaiHalo="0s"
        opaciteSheen=".13"
      />

      <div className="relative flex items-center gap-3">
        <Anneau
          part={score / 100}
          couleurDebut={t.anneau[0]}
          couleurFin={t.anneau[1]}
          identifiantDegrade="kwGradQualiteCompteur"
          delai=".12s"
        >
          {score}
        </Anneau>

        <div className="min-w-0 flex-1">
          <div
            className="text-km-tiny font-extrabold uppercase tracking-[.1em]"
            style={{ color: t.intitule }}
          >
            Qualité du compteur
          </div>
          <div className="mt-0.5 truncate text-sm font-extrabold tracking-[-.01em]">{t.libelle}</div>
          <div className="mt-[5px] text-km-tiny font-bold leading-snug text-white/[.72]">
            {score}/100
            <span className="mx-[5px] text-white/[.32]">·</span>
            {ligneBareme}
          </div>
        </div>
      </div>
    </div>
  )
}
