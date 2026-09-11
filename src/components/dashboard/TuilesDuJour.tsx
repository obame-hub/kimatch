import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CompteurAnime } from '@/components/dashboard/CompteurAnime'
import type { CartesDuJour as Nombres } from '@/lib/data/cartesDuJour'
import type { TotauxOffres } from '@/lib/data/offresDuJour'
import { cn } from '@/lib/utils'

/**
 * ══ LA RANGÉE DU HAUT, EN TUILES DE TAILLES DIFFÉRENTES ══
 *
 * William, 11/09/2026, après avoir comparé quatre directions graphiques : « j'aime bien le D ».
 * Le D, c'est le bento — une grille où les tuiles n'ont PAS toutes la même taille.
 *
 * ── CE QUE LA TAILLE CORRIGE, ET QUE LA COULEUR NE POUVAIT PAS ──
 *
 * Jusqu'ici, cinq cartes de largeur presque égale annonçaient cinq choses de même importance :
 * douze appels à passer, un mail à envoyer, et… rien sur les 21 430 € signés dans la journée, qui
 * vivaient plus bas dans une petite carte à côté d'un tableau.
 *
 * C'est faux, et aucune couleur ne pouvait le corriger : deux rectangles de même taille se lisent
 * comme deux choses de même poids, quelles que soient leurs teintes. L'ARGENT GAGNÉ PREND DONC
 * QUATRE FOIS LA SURFACE d'un compteur d'appels — deux colonnes sur deux rangées — parce que c'est
 * le rapport réel entre les deux dans le métier de William.
 *
 * ── UNE SEULE TUILE PLEINE SUR TOUTE LA PAGE ──
 *
 * Celle de l'argent. Tout le reste est blanc sur un canevas gris-vert. Une hiérarchie ne se
 * décrète pas avec des tailles de police, elle se gagne en faisant taire le reste : si trois blocs
 * criaient, aucun ne serait entendu.
 *
 * ── LES QUATRE COMPTEURS GARDENT LEUR TEINTE, SUR LE CHIFFRE ──
 *
 * Bleu pour le téléphone, violet pour le mail, ambre pour le livrable, rose pour la prospection.
 * C'est le code qui fait reconnaître une tuile avant d'avoir lu son titre, et il est conservé —
 * mais il vit sur le nombre, pas en aplat. Chaque encre est vérifiée à 4,9:1 au minimum.
 *
 * ── LES PASTILLES D'ICÔNES ONT SAUTÉ ──
 *
 * William, 11/09/2026, en comparant le rendu à la maquette : « meilleur positionnement et
 * harmonie des cards ». La maquette n'avait pas d'icônes ; le rendu en avait mis une par tuile,
 * dans un carré de 26 px posé devant le libellé.
 *
 * Elles coûtaient deux choses. LA PLACE, d'abord : 34 px par tuile, sur des tuiles de 150 px de
 * large, pris à la ligne du titre — « Opportunités à suivre » s'en trouvait comprimé. LE CALME,
 * surtout : cinq carrés teintés alignés en haut de la rangée créaient une SECONDE lecture
 * horizontale, en concurrence avec celle des cinq chiffres juste en dessous. Les chiffres sont
 * l'information ; les icônes redisaient en image ce que le libellé dit en toutes lettres.
 *
 * Chaque tuile est donc trois lignes et rien d'autre : un libellé, un nombre, une précision.
 * L'harmonie vient de ce qu'elles ont toutes exactement la même structure.
 */

/** Une teinte de compteur : l'encre du chiffre, et la pastille de l'icône. */
interface Teinte { encre: string; puce: string }

const BLEU:   Teinte = { encre: '#2F5D87', puce: '#E1EDF8' } // 6,6:1 sur blanc
const VIOLET: Teinte = { encre: '#5E4490', puce: '#EDE6F8' } // 7,2:1
const AMBRE:  Teinte = { encre: '#8C5A1E', puce: '#F8EDDC' } // 5,5:1
const ROSE:   Teinte = { encre: '#99375A', puce: '#F8E7EE' } // 6,6:1
const KIWI:   Teinte = { encre: '#0D7A5F', puce: '#DFF3EA' } // 4,9:1

/** Le rayon et l'ombre communs à toutes les tuiles de la page. Écrits une fois. */
export const TUILE =
  'rounded-[20px] bg-km-surface shadow-[0_1px_2px_rgb(20_40_32_/_.04),0_10px_28px_-20px_rgb(20_40_32_/_.22)]'

/**
 * Le sursaut : une classe d'animation qu'on retire puis remet, pour la rejouer à chaque changement.
 *
 * UNE ANIMATION CSS NE SE REJOUE PAS TOUTE SEULE. Si la classe est déjà posée, le navigateur
 * considère que l'animation a eu lieu. On la retire le temps d'une image — d'où le `setTimeout(0)`
 * — pour forcer le redémarrage.
 */
function useSursaut(valeur: number) {
  const [actif, setActif] = useState(false)
  const precedente = useRef(valeur)

  useEffect(() => {
    if (precedente.current === valeur) return
    precedente.current = valeur
    setActif(false)
    const depart = setTimeout(() => setActif(true), 0)
    const fin = setTimeout(() => setActif(false), 1100)
    return () => { clearTimeout(depart); clearTimeout(fin) }
  }, [valeur])

  return actif
}

/**
 * ══ LA GRANDE TUILE : CE QUI A ÉTÉ GAGNÉ AUJOURD'HUI ══
 *
 * Deux colonnes sur deux rangées, en vert Kiwee plein. C'est le seul aplat saturé de la page.
 *
 * ── POURQUOI LE SIGNÉ EN GRAND ET LE PIPE EN PETIT, DANS LA MÊME TUILE ──
 *
 * Ils étaient deux cartes jumelles, donc deux choses de même poids. Elles ne le sont pas :
 *
 *   LE MONTANT SIGNÉ EST UN FAIT. De l'argent acquis aujourd'hui, vérifiable.
 *   LE PIPE OUVERT EST UNE ESPÉRANCE. Une somme d'études dont une partie ne se signera jamais.
 *
 * Les réunir dans une tuile, séparés par un filet, avec un rapport de taille de 32 à 18 px, dit
 * exactement cela : la même famille — de l'argent — deux statuts différents.
 */
export function TuileArgent({
  totaux,
  nbOffres,
  chargement,
}: {
  totaux: TotauxOffres | undefined
  /** Le nombre d'études ouvertes, qui donne sa mesure au pipe. */
  nbOffres: number
  chargement: boolean
}) {
  const signe = totaux?.montantSigne ?? 0
  const pipe = totaux?.pipeOuvert ?? 0
  const sursaut = useSursaut(signe)

  return (
    <div
      className="animate-km-card-rise relative flex flex-col overflow-hidden rounded-[20px] px-[18px] py-4 text-white shadow-[0_14px_34px_-20px_rgba(13,122,95,.55)] sm:col-span-2 lg:row-span-2"
      style={{ background: 'linear-gradient(152deg,#199b78 0%,#0d7a5f 55%,#0a5F4A 100%)' }}
    >
      <span className="truncate text-km-label font-bold uppercase tracking-[.1em] text-white/75">
        Montant signé
      </span>

      <span
        className={cn('mt-3 flex items-center', sursaut && 'animate-km-compteur-bond')}
        style={{ transformOrigin: 'left center' }}
      >
        {chargement ? (
          <span className="block h-[34px] w-40 animate-pulse rounded-km bg-white/20" />
        ) : (
          <CompteurAnime
            valeur={signe}
            decimales={2}
            suffixe="€"
            className="text-[32px] font-bold tracking-[-.04em]"
            classeSecondaire="text-white/70"
          />
        )}
      </span>
      <span className="mt-1 text-km-body text-white/75">mes affaires acceptées aujourd’hui</span>

      {/* LE FILET SÉPARE DEUX NATURES, PAS DEUX CHIFFRES. Au-dessus le fait, en dessous
          l'espérance — voir l'en-tête. `mt-auto` le pousse au bas de la tuile quelle que soit la
          hauteur que la rangée lui donne. */}
      <span aria-hidden className="mt-auto block h-px bg-white/20" />

      <span className="mt-3 truncate text-km-label font-bold uppercase tracking-[.1em] text-white/65">
        Pipe ouvert
      </span>
      <span className="mt-1.5 flex items-center">
        {chargement ? (
          <span className="block h-[22px] w-28 animate-pulse rounded-km bg-white/20" />
        ) : (
          <CompteurAnime
            valeur={pipe}
            decimales={2}
            suffixe="€"
            className="text-[19px] font-bold tracking-[-.03em] text-white/95"
            classeSecondaire="text-white/60"
          />
        )}
      </span>
      <span className="mt-0.5 truncate text-km-label text-white/60">
        {chargement ? '—' : `${nbOffres} étude${nbOffres > 1 ? 's' : ''} en cours`}
      </span>
    </div>
  )
}

/** Une vignette de compteur : une colonne, une seule mesure. */
function Vignette({
  teinte, rang, valeur, libelle, precision, titre, onClick, chargement,
}: {
  teinte: Teinte
  rang: number
  valeur: number
  libelle: string
  precision: string
  titre: string
  onClick: () => void
  chargement: boolean
}) {
  const sursaut = useSursaut(valeur)

  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      style={{
        animationDelay: `${rang * 60}ms`,
        // `encre` est un hexadécimal à six chiffres ; `33` en suffixe vaut 20 % d'opacité.
        ['--ombre-survol' as string]: `0 12px 28px -12px ${teinte.encre}33`,
      }}
      className={cn(
        TUILE,
        'animate-km-card-rise group flex min-h-[96px] flex-col px-[15px] py-3 text-left',
        /* L'OMBRE DU SURVOL PREND LA TEINTE DE LA TUILE : une ombre grise sous un chiffre coloré
           le fait paraître sale, parce que le gris n'est jamais la couleur d'une ombre réelle. */
        'transition-[transform,box-shadow] duration-200',
        'hover:-translate-y-0.5 hover:shadow-[var(--ombre-survol)]',
        'focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45',
      )}
    >
      <span className="truncate text-km-label font-bold uppercase tracking-[.1em] text-km-muted">{libelle}</span>

      {/* `mt-auto` POSE LE CHIFFRE SUR LE BAS : les quatre vignettes s'étirent à la hauteur de la
          rangée, et sans ancrage leur contenu semblerait flotter — le défaut que William avait
          relevé le 10/09/2026. */}
      <span
        className={cn('mt-auto flex items-center', sursaut && 'animate-km-compteur-bond')}
        style={{ transformOrigin: 'left center' }}
      >
        {chargement ? (
          <span className="block h-[30px] w-12 animate-pulse rounded-km bg-km-soft" />
        ) : (
          <CompteurAnime valeur={valeur} className="text-[32px] font-bold tracking-[-.035em]" style={{ color: teinte.encre }} />
        )}
      </span>
      <span className="truncate text-km-label text-km-muted">{precision}</span>
    </button>
  )
}

/** Une des trois mesures de la tuile « Opportunités à suivre ». */
function Mesure({ valeur, libelle, chargement }: { valeur: number; libelle: string; chargement: boolean }) {
  const sursaut = useSursaut(valeur)

  return (
    /* CENTRÉE, ET LE LIBELLÉ SUR UNE SEULE LIGNE. En deux lignes — « Périmètre » puis « à
       détecter » — les trois mesures formaient un petit paragraphe de six lignes qu'il fallait
       lire ; sur une ligne sous un chiffre centré, elles se balaient. */
    <span className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
      <span className={cn('flex items-center', sursaut && 'animate-km-compteur-bond')}>
        {chargement ? (
          <span className="block h-[28px] w-7 animate-pulse rounded bg-km-soft" />
        ) : (
          <CompteurAnime valeur={valeur} className="text-[28px] font-bold tracking-[-.03em]" style={{ color: KIWI.encre }} />
        )}
      </span>
      <span className="min-w-0 max-w-full truncate text-km-label text-km-muted">{libelle}</span>
    </span>
  )
}

/**
 * Les cinq tuiles de la rangée du haut, rendues à PLAT dans la grille de la page.
 *
 * ── PAS DE GRILLE INTERNE, ET C'EST LE POINT ──
 *
 * Un fragment, pas un conteneur : les tuiles sont des enfants DIRECTS de la grille bento du
 * tableau de bord. Les envelopper dans une grille à elles aurait redonné cinq colonnes égales
 * à l'intérieur d'une boîte — c'est-à-dire exactement la mise en page qu'on vient de quitter.
 */
export function TuilesJournee({
  nombres,
  chargement,
}: {
  nombres: Nombres | undefined
  chargement: boolean
}) {
  const navigate = useNavigate()
  const n = nombres ?? {
    appels: 0, mails: 0, livrables: 0, pistesAProspecter: 0,
    perimetreADetecter: 0, mandatARecuperer: 0, recommandationACreer: 0,
  }

  return (
    <>
      <Vignette
        teinte={BLEU} rang={0}
        valeur={n.appels} libelle="Appels" precision="à passer"
        titre="Mes tâches de type Appel en retard ou dues aujourd’hui."
        onClick={() => navigate('/taches')} chargement={chargement}
      />
      <Vignette
        teinte={VIOLET} rang={1}
        valeur={n.mails} libelle="Mails" precision="à envoyer"
        titre="Mes tâches de type Mail en retard ou dues aujourd’hui."
        onClick={() => navigate('/taches')} chargement={chargement}
      />
      <Vignette
        teinte={AMBRE} rang={2}
        valeur={n.livrables} libelle="Livrables" precision="à produire"
        titre="Mes tâches de type Livrable en retard ou dues aujourd’hui."
        onClick={() => navigate('/taches')} chargement={chargement}
      />
      {/* LA TUILE DES PISTES COMPTE DES DOSSIERS, PAS DES TÂCHES : une piste qui porte trois
          relances ouvertes compte pour une. Et elle est à moi par sa PROPRIÉTÉ, pas par le
          responsable de la tâche. */}
      <Vignette
        teinte={ROSE} rang={3}
        valeur={n.pistesAProspecter} libelle="Pistes" precision="à relancer"
        titre="Mes pistes portant une tâche en retard ou due aujourd’hui."
        onClick={() => navigate('/prospection')} chargement={chargement}
      />

      {/* LA TUILE LARGE : quatre colonnes pour trois mesures, posées à l'horizontale. En pile,
          chacune occupait une ligne entière pour un nombre à un chiffre. */}
      <button
        type="button"
        onClick={() => navigate('/opportunites')}
        title="Mes opportunités portant une tâche en retard ou due aujourd’hui, réparties par statut."
        style={{ animationDelay: '240ms', ['--ombre-survol' as string]: `0 12px 28px -12px ${KIWI.encre}33` }}
        className={cn(
          TUILE,
          'animate-km-card-rise flex min-h-[96px] items-center gap-4 px-[17px] py-3 text-left',
          'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--ombre-survol)]',
          'focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45',
          'sm:col-span-2 lg:col-span-4',
        )}
      >
        <span className="shrink-0 text-km-label font-bold uppercase leading-[1.35] tracking-[.1em] text-km-muted">
          Opportunités<br />à suivre
        </span>

        {/* Les trois mesures séparées par des filets : sans eux, trois nombres et trois libellés
            alignés se liraient comme une seule phrase en désordre. */}
        <span className="ml-auto flex min-w-0 flex-1 items-stretch gap-2">
          <Mesure valeur={n.perimetreADetecter} libelle="Périmètre à détecter" chargement={chargement} />
          <span aria-hidden className="w-px shrink-0 bg-km-line" />
          <Mesure valeur={n.mandatARecuperer} libelle="Mandat à récupérer" chargement={chargement} />
          <span aria-hidden className="w-px shrink-0 bg-km-line" />
          <Mesure valeur={n.recommandationACreer} libelle="Recommandation à créer" chargement={chargement} />
        </span>
      </button>
    </>
  )
}
