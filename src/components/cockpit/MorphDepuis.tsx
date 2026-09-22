import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE QUI DEVIENT L'ÉDITEUR
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « j'aimerais avoir l'impression que la card du mail vienne se transformer
 * en éditeur, une animation fluide et premium de top qualité ».
 *
 * ══ POURQUOI `clip-path` ET NON UN `transform` ══
 *
 * La façon classique de faire « un élément devient un autre » est un FLIP : on mesure le départ,
 * on mesure l'arrivée, et on joue la différence en `translate` + `scale`. Elle ne convient pas ici,
 * et pour une raison visible à l'œil : la mise à l'échelle DÉFORME tout ce que le cadre contient —
 * le rayon des coins s'ovalise, la bordure d'un pixel s'épaissit, et le texte de l'éditeur
 * apparaîtrait étiré avant de reprendre sa taille. Sur un écran qu'on regarde de près, ça se voit,
 * et ça fait bon marché.
 *
 * `clip-path: inset(…)` RÉVÈLE AU LIEU D'ÉTIRER. L'éditeur est déjà à sa taille finale, avec sa
 * typographie juste ; on ne montre d'abord que le rectangle exact qu'occupait la carte, puis on
 * ouvre ce rectangle jusqu'aux bords. Rien n'est déformé parce que rien n'est redimensionné.
 *
 * ET LE RACCORD EST PARFAIT PARCE QUE LES DEUX BOÎTES SE RESSEMBLENT : même fond, même bordure,
 * même rayon de 16 px. Au premier pixel de l'animation, ce qu'on voit EST la carte.
 *
 * ══ LE CONTENU SUIT LE CADRE DE PRÈS, ET PAS DE LOIN ══
 *
 * Deux animations, pas une : le cadre s'ouvre, le contenu monte en fondu juste derrière. Sans ce
 * décalage on voit une boîte pleine de texte grandir ; avec, on voit une carte s'ouvrir puis se
 * remplir. C'est la différence entre une transition et une transformation.
 *
 * LE RETARD A DISPARU, ET C'EST UNE CORRECTION VENUE DE L'ÉCRAN. En capturant l'animation en
 * cours, le cadre apparaissait VIDE pendant ses premières images : le fond d'une carte sur
 * l'anthracite est presque invisible, et sans contenu dedans il n'y avait littéralement rien à
 * voir. L'effet ne se lisait plus comme une carte qui devient un éditeur, mais comme un trou qui
 * s'ouvre puis se remplit.
 *
 * LA HIÉRARCHIE VIENT MAINTENANT DES DURÉES, PAS D'UN DÉLAI : le contenu monte en 500 ms, le cadre
 * s'ouvre en 700. Le cadre mène donc toujours, mais rien n'est jamais vide — dès la première image
 * on voit la carte, avec son contenu qui commence à paraître.
 *
 * ══ LA COURBE, ET POURQUOI ELLE A CHANGÉ EN MÊME TEMPS QUE LA DURÉE ══
 *
 * William, 22/09/2026 : « j'ai envie de voir cette animation, donc ralentis-la, je veux que ce soit
 * hyper fluide à l'ouverture et à la fermeture ».
 *
 * RALENTIR SANS TOUCHER À LA COURBE AURAIT DONNÉ L'INVERSE DU RÉSULTAT VOULU. L'ancienne,
 * `cubic-bezier(.22, 1, .36, 1)`, monte très vite puis rampe : sur 420 ms on ne voit que le
 * mouvement, mais étirée à 700 elle aurait donné un départ en coup de fouet suivi d'une longue
 * traîne — deux vitesses au lieu d'une, exactement ce qu'on appelle « saccadé » à l'œil même quand
 * aucune image n'est perdue.
 *
 * `cubic-bezier(.32, .72, 0, 1)` répartit la vitesse autrement : elle accélère franchement mais
 * sans à-coup, et décélère sur toute la seconde moitié. C'est la courbe des tiroirs d'iOS, et c'est
 * celle qui supporte les longues durées — elle se lit comme une masse qu'on déplace, pas comme un
 * ressort qu'on relâche. Aucun rebond : un rebond ferait « jouet » sur un écran de travail.
 *
 * LES DEUX SENS PARTAGENT LA MÊME COURBE. Un aller « physique » et un retour « mécanique » se
 * remarquent tout de suite, et c'est le genre de détail qui fait qu'une interface paraît assemblée
 * plutôt que dessinée.
 *
 * ══ LE RETOUR EXISTE, ET IL EST UN PEU PLUS COURT ══
 *
 * Une transition qui s'ouvre avec soin et disparaît d'un coup se sent inachevée — l'œil attend la
 * réciproque. Le cadre se referme donc sur le rectangle de la carte, contenu en fondu d'abord.
 *
 * MAIS EN 560 MS CONTRE 700 : une sortie a moins à raconter qu'une entrée. À l'entrée on découvre
 * un écran ; à la sortie on sait déjà où l'on revient. L'écart reste faible — un cinquième — parce
 * que William veut voir les deux ; le réduire davantage rendrait le retour expédié à côté d'une
 * ouverture posée.
 *
 * ══ QUI NE VEUT PAS D'ANIMATION N'EN A PAS ══
 *
 * `prefers-reduced-motion` coupe les deux. L'éditeur s'affiche alors instantanément, entier — ce
 * qui est la bonne dégradation : on ne remplace pas un mouvement par un fondu, on l'enlève. La
 * fermeture, elle, rend la main aussitôt : sans ça, l'écran resterait figé le temps d'une
 * animation qui ne joue pas.
 */
/**
 * LES TROIS CONSTANTES DU MOUVEMENT, réunies parce qu'elles se règlent ensemble.
 *
 * Elles ont été allongées le 22/09/2026 à la demande de William, qui voulait voir l'animation. Les
 * durées d'origine — 420 et 280 ms — étaient calibrées pour disparaître ; celles-ci sont calibrées
 * pour se regarder, sans jamais faire attendre : 700 ms restent sous le seuil où une transition
 * commence à coûter du temps de travail.
 */
const COURBE = 'cubic-bezier(.32, .72, 0, 1)'
const OUVERTURE = 700
const FERMETURE = 560

export function MorphDepuis({
  origine,
  ferme,
  onFerme,
  children,
}: {
  /** Le rectangle de départ, mesuré au clic. `null` : aucune animation, l'éditeur apparaît. */
  origine: DOMRect | null
  /** Passe à vrai quand le parent veut fermer : la sortie se joue, puis `onFerme` est appelé. */
  ferme?: boolean
  /** Appelé quand la sortie est finie — c'est là que le parent démonte. */
  onFerme?: () => void
  children: React.ReactNode
}) {
  const cadre = useRef<HTMLDivElement>(null)
  const contenu = useRef<HTMLDivElement>(null)

  /* ══ LE RAPPEL PASSE PAR UNE RÉFÉRENCE, ET C'EST UN CORRECTIF ══
   *
   * `onFerme` est écrit en flèche à l'appel : son identité change à CHAQUE rendu du parent. Or le
   * sprint se redessine toutes les secondes — le chronomètre de séance tourne. L'effet de fermeture,
   * qui le listait dans ses dépendances, repartait donc de zéro en pleine animation : le cadre
   * revenait brutalement à sa taille pleine puis recommençait à se refermer.
   *
   * C'est exactement ce que William a vu quand il a dit que la fermeture ne se résorbait pas. La
   * référence rend le rappel stable sans obliger l'appelant à le mémoriser. */
  const rappel = useRef(onFerme)
  rappel.current = onFerme

  useLayoutEffect(() => {
    const el = cadre.current
    const inner = contenu.current
    if (!el || !origine) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return

    /* Les quatre marges du rectangle de départ, exprimées dans le repère de l'éditeur. `max(0, …)`
       parce qu'une carte peut dépasser d'un côté — un `inset` négatif est invalide et annulerait
       toute l'animation, silencieusement. */
    const haut = Math.max(0, origine.top - r.top)
    const droite = Math.max(0, r.right - origine.right)
    const bas = Math.max(0, r.bottom - origine.bottom)
    const gauche = Math.max(0, origine.left - r.left)

    const ouverture = el.animate(
      [
        { clipPath: `inset(${haut}px ${droite}px ${bas}px ${gauche}px round 16px)` },
        { clipPath: 'inset(0px 0px 0px 0px round 16px)' },
      ],
      { duration: OUVERTURE, easing: COURBE, fill: 'both' },
    )

    /* LE CONTENU PART DE PLUS BAS MAINTENANT QUE C'EST PLUS LONG : huit pixels parcourus en 300 ms
       se voyaient ; les mêmes huit pixels en 440 ms donneraient l'impression que rien ne bouge. La
       distance suit la durée, sinon le mouvement paraît mou au lieu de paraître ample. */
    const apparition = inner?.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 500, easing: COURBE, fill: 'both' },
    )

    return () => { ouverture.cancel(); apparition?.cancel() }
  }, [origine])

  /* ── LA SORTIE ── */
  useEffect(() => {
    if (!ferme) return
    const el = cadre.current
    const inner = contenu.current
    const fini = () => rappel.current?.()

    if (!el || !origine || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fini()
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) { fini(); return }

    const haut = Math.max(0, origine.top - r.top)
    const droite = Math.max(0, r.right - origine.right)
    const bas = Math.max(0, r.bottom - origine.bottom)
    const gauche = Math.max(0, origine.left - r.left)
    inner?.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(10px)' },
      ],
      { duration: 240, easing: COURBE, fill: 'both' },
    )
    const fermeture = el.animate(
      [
        { clipPath: 'inset(0px 0px 0px 0px round 16px)' },
        { clipPath: `inset(${haut}px ${droite}px ${bas}px ${gauche}px round 16px)` },
      ],
      { duration: FERMETURE, easing: COURBE, fill: 'both' },
    )
    fermeture.addEventListener('finish', fini)
    /* ON N'ANNULE PAS L'ANIMATION AU NETTOYAGE : l'effet ne se rejoue plus à chaque rendu grâce à
       la référence, et annuler ferait sauter le cadre à sa taille pleine si React démontait un
       frère pendant la sortie. */
    return () => fermeture.removeEventListener('finish', fini)
  }, [ferme, origine])

  return (
    <div ref={cadre} className="h-full min-h-0">
      <div ref={contenu} className="flex h-full min-h-0 flex-col">
        {children}
      </div>
    </div>
  )
}
