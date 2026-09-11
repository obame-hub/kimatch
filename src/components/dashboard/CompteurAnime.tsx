import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * ══ UN NOMBRE QUI DÉFILE, CHIFFRE PAR CHIFFRE ══
 *
 * William, 10/09/2026 : « une animation beaucoup plus fluide et dynamique […] animation de chiffre
 * qui défile pour soustraire un ou pour arriver au chiffre total lors du chargement de la page ».
 *
 * ── POURQUOI UN ROULEAU, ET PAS UNE INTERPOLATION ──
 *
 * La première version calculait les valeurs intermédiaires en JavaScript et réécrivait le texte à
 * chaque image : de 104 à 103, elle affichait « 104, 104, 103 » — un clignotement, pas un
 * défilement.
 *
 * Ici chaque position est un ROULEAU vertical portant 0 à 9, qu'on translate. Passer de 104 à 103
 * ne fait bouger que la colonne des unités, qui glisse du 4 au 3 — exactement le geste d'un
 * compteur mécanique. Et c'est le compositeur du navigateur qui l'anime, pas le fil principal :
 * aucun rendu React pendant le mouvement, donc aucune saccade.
 *
 * ── TOUT EST UNE BOÎTE DE 1 EM, Y COMPRIS LA VIRGULE ET LE SYMBOLE ──
 *
 * William, 10/09/2026 : « les décimales ne sont pas alignées avec le montant… ça rend pas beau ».
 * Il avait raison, et ce n'était pas un réglage à corriger mais un défaut de construction.
 *
 * UN `inline-block` EN `overflow: hidden` POSE SA LIGNE DE BASE SUR SON BORD INFÉRIEUR, et non sur
 * celle de son texte. Un rouleau collé à côté d'un `<span>` ordinaire ne peut donc pas s'aligner :
 * l'un s'appuie sur le bas de sa boîte, l'autre sur le pied de ses lettres. Environ un cinquième de
 * cadratin les sépare — invisible sur un mot, criant sur « 486 320 » suivi de « ,45 ».
 *
 * La correction ne consiste pas à décaler l'un des deux : elle consiste à ce qu'il n'y ait plus
 * qu'une seule sorte de boîte. Chiffres, espaces de milliers, virgule, décimales et symbole sont
 * tous des boîtes de 1 em centrées. Aucune ligne de base n'intervient, donc rien ne peut dériver —
 * quelle que soit la police, la taille ou le navigateur.
 *
 * ── AU CHARGEMENT, TOUT PART DE ZÉRO ──
 *
 * Les rouleaux commencent sur 0 et montent vers leur chiffre dès l'image suivante. Sans ce départ
 * décalé d'un cycle, le navigateur poserait directement la position finale : rien à voir.
 *
 * ── LES DIZAINES PARTENT AVANT LES UNITÉS ──
 *
 * 40 ms de décalage par position, en partant de la gauche. Les rouleaux ne s'arrêtent donc pas
 * ensemble : c'est ce léger étalement qui fait la différence entre un bloc qui bascule et un nombre
 * qui se compose.
 *
 * ── ET ON RESPECTE `prefers-reduced-motion` ──
 *
 * Quand le système demande moins d'animation, les rouleaux se placent sans transition :
 * l'information reste entière, seule la mise en scène disparaît.
 */

const DUREE_MS = 950
const DECALAGE_PAR_POSITION_MS = 40
/** Départ franc, arrivée qui se pose — la même courbe que les panneaux de l'application. */
const COURBE = 'cubic-bezier(.22,1,.36,1)'

const CHIFFRES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function sansMouvement(): boolean {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * Une position du nombre : un rouleau de dix chiffres dont on ne montre qu'une case.
 *
 * LA HAUTEUR EST EN `em`, PAS EN PIXELS : la carte décide de la taille du texte, le rouleau suit.
 */
function Rouleau({ chiffre, rang, fige }: { chiffre: number; rang: number; fige: boolean }) {
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: '1em', width: '.62em' }}
      aria-hidden
    >
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${chiffre * 10}%)`,
          transition: fige ? 'none' : `transform ${DUREE_MS}ms ${COURBE} ${rang * DECALAGE_PAR_POSITION_MS}ms`,
        }}
      >
        {CHIFFRES.map((n) => (
          /* `lineHeight: 1` EN STYLE EN LIGNE, ET C'EST UN CORRECTIF, PAS UNE PRÉFÉRENCE.
             La feuille de style de l'application pose une interligne de 1,5 qui descendait jusqu'ici :
             chaque case mesurait 34 px de haut pour une ligne de texte de 51 px. Les 17 px
             excédentaires débordaient de part et d'autre, et l'on voyait DANS LA FENÊTRE une tranche
             du chiffre voisin — un filet blanc au-dessus du 3, mesuré le 11/09/2026 sur la carte
             « Livrables ». Le rouleau était juste, c'est le texte qui dépassait de sa case. */
          <span
            key={n}
            className="flex items-center justify-center"
            style={{ height: '1em', lineHeight: 1 }}
          >
            {n}
          </span>
        ))}
      </span>
    </span>
  )
}

/** Un caractère fixe — virgule, espace de milliers, symbole — dans la MÊME boîte que les rouleaux. */
function Fixe({ children, largeur, className }: { children?: React.ReactNode; largeur: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center justify-center', className)}
      style={{ height: '1em', width: largeur, lineHeight: 1 }}
      aria-hidden
    >
      {children}
    </span>
  )
}

export function CompteurAnime({
  valeur,
  decimales = 0,
  suffixe,
  className,
  classeSecondaire,
  style,
}: {
  valeur: number
  /** 0 pour un compteur d'objets, 2 pour un montant en euros. */
  decimales?: 0 | 2
  /** Le symbole qui suit, dans la même boîte pour ne pas rompre l'alignement. */
  suffixe?: string
  /** Les classes de typographie du nombre — la carte décide de sa taille et de sa couleur. */
  className?: string
  /** Ce qui habille la partie secondaire : virgule, décimales et symbole. */
  classeSecondaire?: string
  /** Pour une couleur qui n'est pas un jeton Tailwind — les cinq encres des cartes du jour. */
  style?: React.CSSProperties
}) {
  /* Les rouleaux sont sur zéro au premier rendu et ne montent qu'ensuite : c'est ce qui produit le
     décompte d'arrivée. `fige` coupe la transition le temps de ce premier placement. */
  const [cible, setCible] = useState(0)
  const [fige, setFige] = useState(true)

  useEffect(() => {
    if (sansMouvement()) {
      setFige(true)
      setCible(valeur)
      return
    }
    // Une image d'attente avant de lever le frein : sans elle, le navigateur regroupe le passage de
    // 0 à la valeur avec le premier rendu et ne joue aucune transition.
    const t = requestAnimationFrame(() => {
      setFige(false)
      setCible(valeur)
    })
    return () => cancelAnimationFrame(t)
  }, [valeur])

  const negatif = cible < 0
  const absolu = Math.abs(cible)
  const entier = Math.trunc(absolu)
  /* `Math.round` sur la partie fractionnaire seule, et non sur le nombre entier : arrondir
     30 087,996 ici donnerait « 30 087,100 » si on ne bornait pas à 99. */
  const centimes = decimales === 2 ? Math.min(99, Math.round((absolu - entier) * 100)) : 0

  const chiffresEntiers = String(entier).split('').map(Number)
  const largeur = chiffresEntiers.length

  return (
    <span className={cn('inline-flex items-center leading-none tabular-nums', className)} style={style}>
      {/* Le nombre RÉEL, pour les lecteurs d'écran : les rouleaux ne sont qu'une mise en scène. */}
      <span className="sr-only" aria-live="polite">
        {valeur.toLocaleString('fr-FR', decimales === 2
          ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : undefined)}
        {suffixe ? ` ${suffixe}` : ''}
      </span>

      {negatif && <Fixe largeur=".42em">−</Fixe>}

      {chiffresEntiers.map((chiffre, i) => (
        <span key={`e-${largeur}-${i}`} className="inline-flex items-center">
          {/* L'ESPACE DES MILLIERS À LA FRANÇAISE, insérée tous les trois chiffres en repartant de
              la droite — sans quoi « 1234 » s'écrirait « 123 4 ». */}
          {i > 0 && (largeur - i) % 3 === 0 && <Fixe largeur=".24em" />}
          <Rouleau chiffre={chiffre} rang={i} fige={fige} />
        </span>
      ))}

      {decimales === 2 && (
        <span className={cn('inline-flex items-center', classeSecondaire)}>
          <Fixe largeur=".3em">,</Fixe>
          {String(centimes).padStart(2, '0').split('').map((c, i) => (
            <Rouleau key={`d-${i}`} chiffre={Number(c)} rang={largeur + i} fige={fige} />
          ))}
        </span>
      )}

      {suffixe && (
        <span className={cn('inline-flex items-center', classeSecondaire)}>
          <Fixe largeur=".26em" />
          <Fixe largeur=".62em">{suffixe}</Fixe>
        </span>
      )}
    </span>
  )
}
