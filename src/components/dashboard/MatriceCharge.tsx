import { useEffect, useState } from 'react'
import { depuisIso, JOURS_AFFICHES, PLAFOND_JOURNALIER, type JourDeCharge } from '@/lib/data/tachesDuJour'
import { cn } from '@/lib/utils'

/**
 * ══ LA CHARGE DES DIX PROCHAINS JOURS OUVRÉS ══
 *
 * William, 10/09/2026 : « un indicateur visuel hyper design de la charge de travail qui attend le
 * commercial. Cela lui permettra de planifier sur les jours verts et d'éviter les jours rouges. »
 *
 * Dix jours ouvrés, cinq par ligne : CHAQUE LIGNE EST UNE SEMAINE, lundi à vendredi. C'est ce qui
 * donne un sens à la lecture de gauche à droite — on repère la semaine chargée d'un coup d'œil.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * LA SEULE TUILE SOMBRE DE LA PAGE, ET CE N'EST PAS UN CAPRICE
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 11/09/2026, en comparant la maquette au rendu : « la matrice sur fond sombre avec date
 * dans la card du jour ».
 *
 * LE FOND SOMBRE DIT QU'ON CHANGE DE TEMPS. Tout le reste de la page parle d'aujourd'hui — ce qui
 * est en retard, ce qui est dû ce jour. Cette tuile est la seule à parler des jours D'APRÈS. Sur
 * fond blanc comme ses voisines, elle se lisait comme un troisième tableau du jour ; sombre, on
 * voit avant de lire qu'elle ne raconte pas la même chose.
 *
 * ET LES JAUGES Y GAGNENT. Une jauge pastel sur blanc dispose d'une plage de contraste étroite :
 * entre un vert à 12 % et un vert à 60 %, l'œil distingue mal. Sur un fond sombre, la même jauge
 * part du noir et va jusqu'à une couleur franche — l'écart entre une journée calme et une journée
 * saturée devient immédiat.
 *
 * ── LA DATE RENTRE DANS LA CASE ──
 *
 * Elle était posée AU-DESSUS, sur le fond blanc, pour une raison qui tenait : sur une pastille
 * claire elle prenait la couleur de la charge, et un repère qui change d'aspect selon ce qu'il
 * repère est un mauvais repère.
 *
 * Le fond sombre supprime le problème. La date se pose en haut de la case, en gris constant, et
 * la jauge monte DERRIÈRE elle depuis le bas — elle ne l'atteint que sur les journées saturées,
 * où la date passe alors en rouge clair. Les dix cases y gagnent la hauteur que la ligne de dates
 * occupait dehors : elles passent d'environ 46 à 62 px.
 *
 * ── LA CHARGE SE LIT EN HAUTEUR D'ABORD, EN COULEUR ENSUITE ──
 *
 * C'est la correction du 11/09/2026, après une critique juste : « trop de couleurs, ça complexifie
 * la lecture ». Quinze teintes différentes signifient qu'aucune ne ressort. La hauteur porte donc
 * le COMBIEN, et la couleur ne dit plus que « est-ce que ça devient tendu ».
 *
 * ── DÉPASSER LE PLAFOND EST PRÉVU, ET DOIT SE VOIR ──
 *
 * « Il est tout à fait possible d'excéder la limite. » Au-delà de 70, la jauge est pleine et ne
 * peut plus rien dire : c'est le trait clair en tête de case, doublé de la date qui rougit, qui
 * distingue « au bord » de « au-delà ».
 */

/**
 * ══ QUATRE PALIERS DE COULEUR, ET NON UNE TEINTE CONTINUE ══
 *
 * Première version : la teinte était interpolée en continu du vert au rouge. Deux défauts, tous
 * deux constatés à l'écran le 11/09/2026.
 *
 *   ELLE MENTAIT SUR LES PALIERS. À 52 tâches sur un objectif de 70, la journée est franchement
 *   tendue — et l'interpolation la peignait en VERT VIF, parce que 52/70 = 0,74 ne se trouve qu'au
 *   tiers du trajet entre le seuil vert et le seuil ambre. La couleur disait « tout va bien » là
 *   où le chiffre dit le contraire.
 *
 *   ET DIX TEINTES DIFFÉRENTES NE SE COMPARENT PAS. C'est la critique que William avait déjà faite
 *   d'une première matrice : « trop de couleurs, ça complexifie la lecture ». Un dégradé continu
 *   donne une teinte unique par case ; l'œil ne sait pas les classer, il sait seulement qu'elles
 *   sont toutes différentes.
 *
 * QUATRE PALIERS, DONC, ET UNE QUESTION PAR PALIER :
 *
 *   moins de la moitié    vert    je peux poser du travail ici
 *   la moitié aux 4/5     ambre   ça se remplit, à éviter si possible
 *   les 4/5 au plafond    orange  c'est plein
 *   au-delà du plafond    rouge   c'est trop
 *
 * Quatre couleurs se retiennent et se comparent d'un coup d'œil. La HAUTEUR de la jauge continue
 * de porter le détail — c'est elle qui distingue une journée à 12 d'une journée à 31.
 */
const PALIERS = [
  { seuil: 0.5, haut: '#3E8A6E', bas: '#2F6B57' },
  { seuil: 0.8, haut: '#B08A34', bas: '#8E6D24' },
  { seuil: 1,   haut: '#C07A33', bas: '#9C5F25' },
  { seuil: Infinity, haut: '#B04A3E', bas: '#8E3A30' },
] as const

function niveau(nombre: number) {
  const t = Math.min(1, nombre / PLAFOND_JOURNALIER)
  const depasse = nombre > PLAFOND_JOURNALIER
  const p = PALIERS.find((x) => (depasse ? false : t < x.seuil)) ?? PALIERS[PALIERS.length - 1]

  return {
    // Une hauteur plancher de 8 % : une journée à 2 tâches doit se voir, pas disparaître.
    hauteur: nombre === 0 ? 0 : Math.max(8, t * 100),
    remplissage: `linear-gradient(180deg, ${p.haut} 0%, ${p.bas} 100%)`,
    depasse,
  }
}

const JOURS_COURTS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const JOURS_LONGS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/**
 * ══ LES JAUGES MONTENT, ELLES N'APPARAISSENT PAS ══
 *
 * La transition de hauteur ne se jouait jamais : la case naissait DÉJÀ à sa hauteur finale, et une
 * transition ne se déclenche qu'entre deux valeurs. Une image d'attente suffit — le navigateur
 * peint d'abord à zéro, puis reçoit la vraie hauteur et l'anime.
 *
 * LE DÉCALAGE DE 45 MS PAR CASE fait la différence entre dix barres qui montent ensemble — un
 * rideau — et dix barres qui se remplissent l'une après l'autre, de lundi à vendredi.
 */
function useMontee(rang: number) {
  const [monte, setMonte] = useState(false)
  useEffect(() => {
    const image = requestAnimationFrame(() => setMonte(true))
    return () => cancelAnimationFrame(image)
  }, [])
  return { monte, delai: `${rang * 45}ms` }
}

function Case({ jour, taches, rang }: { jour: string; taches: number; rang: number }) {
  const d = depuisIso(jour)
  const n = niveau(taches)
  const { monte, delai } = useMontee(rang)
  const infobulle = `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]} — ${taches} tâche${taches > 1 ? 's' : ''} prévue${taches > 1 ? 's' : ''}${n.depasse ? `, au-delà de l’objectif de ${PLAFOND_JOURNALIER}` : ''}`

  return (
    <div
      title={infobulle}
      className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#262E29] transition-transform duration-200 hover:-translate-y-px"
    >
      {/* LA JAUGE MONTE DEPUIS LE BAS, DERRIÈRE TOUT LE RESTE. Sa hauteur dit la charge, sa
          couleur dit la tension — voir l'en-tête. */}
      <span
        aria-hidden
        data-mouvement="jauge"
        className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
        style={{ height: monte ? `${n.hauteur}%` : '0%', background: n.remplissage, transitionDelay: delai }}
      />

      {/* LE TRAIT DU PLAFOND. Au-delà, la jauge est pleine et ne peut plus rien dire : c'est ce
          trait qui distingue « au bord » de « au-delà ». */}
      {n.depasse && <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[3px] bg-[#E88C80]" />}

      {/* LA DATE, DANS LA CASE. Gris constant, sauf sur une journée saturée où elle rougit — le
          seul moment où le repère a le droit de changer d'aspect, parce qu'il devient lui-même
          une alerte. */}
      <span className={cn(
        'absolute inset-x-0 top-[7px] z-10 text-center text-[9px] font-bold leading-none tracking-[.06em]',
        n.depasse ? 'text-[#F0A79B]' : 'text-white/45',
      )}>
        {JOURS_COURTS[d.getDay()]}{d.getDate()}
      </span>

      {/* LE NOMBRE. Blanc sur toutes les jauges — elles sont toutes plus sombres que lui, y
          compris la rouge de saturation, d'où un contraste qui ne varie pas d'une case à l'autre.
          Un zéro s'écrit en demi-teinte : c'est une absence, pas une mesure. */}
      <span className={cn(
        'relative z-10 mt-3 text-[19px] font-bold leading-none tracking-[-.03em] tabular-nums',
        taches === 0 ? 'text-white/25' : 'text-white',
      )}>
        {taches}
      </span>
    </div>
  )
}

export function MatriceCharge({
  jours,
  chargement,
  hauteur,
}: {
  jours: JourDeCharge[] | undefined
  chargement: boolean
  /** La hauteur du tableau voisin — la matrice s'y cale exactement. */
  hauteur: number
}) {
  const cases = jours ?? []

  return (
    <div
      style={{ height: hauteur }}
      className="flex min-w-0 flex-col overflow-hidden rounded-[20px] bg-[#1B211D] px-3.5 pb-3.5 pt-3 shadow-[0_14px_34px_-22px_rgba(10,20,16,.8)]"
    >
      <div className="flex shrink-0 items-baseline gap-2.5">
        <h3 className="truncate text-km-name font-semibold text-white">Charge à venir</h3>
        {/* LA LÉGENDE TIENT EN QUATRE MOTS. Une barre de dégradé était nécessaire tant que la
            couleur portait l'échelle ; depuis que c'est la HAUTEUR qui la porte, « plein =
            chargé » se comprend sans mode d'emploi. */}
        <span
          className="ml-auto shrink-0 text-km-label text-white/40"
          title={`${JOURS_AFFICHES} jours ouvrés, fériés exclus — objectif ${PLAFOND_JOURNALIER} tâches par jour`}
        >
          {JOURS_AFFICHES} j · obj. {PLAFOND_JOURNALIER}
        </span>
      </div>

      {/* LES DEUX LIGNES SE PARTAGENT LA HAUTEUR RESTANTE PAR `flex-1`, et les cinq colonnes la
          largeur par la grille. Aucune hauteur de case n'est calculée à la main : la matrice se
          cale sur le tableau voisin quoi qu'il arrive, ce qui est la seule façon de garantir
          l'alignement au pixel des deux tuiles. */}
      <div className="mt-3 grid min-h-0 flex-1 grid-rows-2 gap-2">
        {[0, 1].map((ligne) => (
          <div key={ligne} className="grid min-h-0 grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, colonne) => {
              const i = ligne * 5 + colonne
              const c = cases[i]
              if (chargement || !c) {
                return <div key={i} className="animate-pulse rounded-[10px] bg-white/5" />
              }
              return <Case key={c.jour} jour={c.jour} taches={c.taches} rang={i} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
