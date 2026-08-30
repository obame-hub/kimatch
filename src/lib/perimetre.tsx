import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { fetchMonPortefeuille, filtrerMesElements } from '@/lib/data/visibility'
import { useMonProfil } from '@/lib/data/roles'

/**
 * « MES OBJETS » OU « TOUS LES OBJETS », sur chaque liste de l'application.
 *
 * LA DEMANDE, mot pour mot (Naoëlle, 28/08/2026) : « tout le monde peut tout voir mais l'affichage
 * serait que chacun voit seulement ses propres recommandations, et on laisse le choix de filtrer
 * quelque part dans l'écran avec "toutes les recommandations" — car des fois des commerciaux
 * partent en vacances et les autres s'occupent de leurs dossiers quand ils partent ».
 *
 * Les deux moitiés comptent autant l'une que l'autre :
 *
 * · CE N'EST PAS UNE RESTRICTION. La base laisse tout passer et continue de le faire — c'est la
 *   décision du 14/08, qualifiée de non négociable. Ce réglage ne change QUE ce qu'on affiche par
 *   défaut. Un conseiller qui reprend le portefeuille d'un collègue absent bascule sur « tous » et
 *   voit tout, sans demander l'autorisation à personne.
 *
 * · LE DÉFAUT EST « LES MIENS », POUR TOUT LE MONDE, administrateurs compris. Avant, la page
 *   Recommandations filtrait déjà sur le propriétaire — mais en dur, selon le rôle, et sans aucun
 *   moyen d'en sortir : un conseiller ne pouvait PAS voir les dossiers d'un collègue, et un
 *   administrateur ne pouvait PAS ne voir que les siens. Les deux manques disparaissent ici.
 *
 * LE CHOIX SURVIT AU RECHARGEMENT, et il est propre à chaque écran : on ne travaille pas ses
 * compteurs et ses dossiers avec la même lunette, et retrouver la page telle qu'on l'a laissée
 * evite de la re-régler dix fois par jour.
 */
export type Perimetre = 'moi' | 'tous'

const PREFIXE = 'kimatch-perimetre-'

/**
 * @param cle Identifie l'écran — « recommandations », « comptes »… Le choix est mémorisé sous
 *            cette clé, donc chaque liste garde le sien.
 */
export function usePerimetre(cle: string) {
  const cleStockage = PREFIXE + cle

  const [perimetre, setPerimetreEtat] = useState<Perimetre>(() => {
    // Le stockage peut lever (navigation privée, cookies bloqués) : un écran ne doit pas rester
    // blanc pour un réglage d'affichage.
    try {
      return localStorage.getItem(cleStockage) === 'tous' ? 'tous' : 'moi'
    } catch {
      return 'moi'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(cleStockage, perimetre)
    } catch {
      /* tant pis : le choix vaudra pour la session */
    }
  }, [cleStockage, perimetre])

  const setPerimetre = useCallback((valeur: Perimetre) => setPerimetreEtat(valeur), [])

  return { perimetre, setPerimetre, seulementLesMiens: perimetre === 'moi' }
}

/** Mon portefeuille : les comptes dont je suis propriétaire, et leurs sites. */
export function useMonPortefeuille() {
  return useQuery({
    queryKey: ['mon-portefeuille'],
    queryFn: fetchMonPortefeuille,
    // Le portefeuille d'un conseiller ne bouge pas d'une minute à l'autre, et il est interrogé par
    // chacune des quinze listes : le recalculer à chaque navigation coûterait une requête pour rien.
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * LA BASCULE POSÉE SUR UNE LISTE DÉJÀ CHARGÉE, filtre compris.
 *
 * POURQUOI UN SEUL PROPRIÉTAIRE NE SUFFIT PAS. Filtrer bêtement sur `proprietaire_id` aurait vidé
 * trois écrans sur quinze — relevé le 30/08/2026 : les signaux ne portent AUCUN propriétaire
 * (0 sur 1 456), les versions non plus (1 sur 2 030), et les échanges presque pas (3 sur 66 645).
 * Un « Mes signaux » qui affiche zéro est pire que pas de bascule du tout : on croit n'avoir rien
 * à faire.
 *
 * La règle est donc en cascade, et c'est déjà celle du tableau de bord (`filtrerMesElements`) :
 * le propriétaire s'il est renseigné, sinon le compte auquel l'objet est rattaché, sinon son site.
 * Un signal sans propriétaire suit ainsi le site sur lequel il est apparu, et un échange suit son
 * compte — ce qui est exactement la question que se pose un conseiller.
 *
 * Chaque écran dit quels champs lire : le nom des colonnes n'est pas devinable, et un objet peut
 * porter son propriétaire sous un autre nom (l'auteur, pour un échange).
 */
export function usePerimetreListe<T>(
  cle: string,
  elements: T[] | undefined,
  scope: {
    proprietaireId?: (item: T) => string | null | undefined
    compteId?: (item: T) => string | null | undefined
    siteId?: (item: T) => string | null | undefined
  },
) {
  const { perimetre, setPerimetre } = usePerimetre(cle)
  const { data: monProfil } = useMonProfil()
  const { data: portefeuille } = useMonPortefeuille()

  const miens = useMemo(
    () => (elements ? filtrerMesElements(elements, portefeuille, monProfil?.id, scope) : undefined),
    // `scope` est reconstruit à chaque rendu (ce sont des fonctions écrites sur place) : l'inclure
    // dans les dépendances annulerait la mémoïsation. Les extracteurs d'un écran ne changent
    // jamais en cours de route — seule la liste change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elements, portefeuille, monProfil?.id],
  )

  return {
    perimetre,
    setPerimetre,
    /** La liste à afficher, selon la position de la bascule. */
    visibles: perimetre === 'moi' ? miens : elements,
    nbMiens: miens?.length,
    nbTous: elements?.length,
  }
}

/**
 * La bascule elle-même. Deux segments, jamais un interrupteur : un interrupteur ne dit pas ce
 * qu'il montre quand il est éteint, alors que deux libellés côte à côte annoncent les deux états.
 *
 * Les libellés sont fournis par l'écran plutôt que dérivés d'un nom d'objet : « Mes dossiers » et
 * « Tous les dossiers », « Mes échanges » et « Tous les échanges ». Le français ne se devine pas
 * depuis un pluriel — genre, élision, accord — et une mécanique qui essaierait produirait
 * « Tous les recommandations ».
 */
export function BasculePerimetre({
  valeur,
  onChange,
  libelleMien,
  libelleTous,
  compteMien,
  compteTous,
}: {
  valeur: Perimetre
  onChange: (v: Perimetre) => void
  libelleMien: string
  libelleTous: string
  /** Facultatif : le nombre derrière chaque choix, quand l'écran sait le compter sans coût. */
  compteMien?: number
  compteTous?: number
}) {
  const segment = (v: Perimetre, libelle: string, compte?: number) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={valeur === v}
      className={cn(
        'flex items-center gap-1.5 rounded-kw-sm px-2.5 py-1 text-kw-lg font-semibold transition-colors',
        valeur === v ? 'bg-kw-surface text-kw-ink shadow-kw-card' : 'text-kw-label hover:text-kw-ink',
      )}
    >
      {libelle}
      {compte != null && (
        <span className={cn('font-mono text-kw-xs tabular-nums', valeur === v ? 'text-kw-meta' : 'text-kw-faint')}>
          {compte}
        </span>
      )}
    </button>
  )

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-kw-md bg-kw-muted p-0.5">
      {segment('moi', libelleMien, compteMien)}
      {segment('tous', libelleTous, compteTous)}
    </div>
  )
}
