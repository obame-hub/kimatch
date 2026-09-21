import { useMemo, useState } from 'react'
import { ChevronDown, GripVertical, Mail, Phone, Zap } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { IconeEnergie } from '@/components/ui/icone-energie'
import { cn } from '@/lib/utils'
import { appelerNumero } from '@/lib/telephonie'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { SprintCockpit } from '@/components/cockpit/SprintCockpit'
import { CockpitEnConstruction } from '@/components/cockpit/OuvertureCockpit'
import { cockpitOuvert } from '@/lib/cockpitOuvert'
import {
  LIBELLE_CRITERE,
  LIBELLE_SOURCE,
  useAjouterAuPipe,
  useCompleterPipe,
  usePipeDuJour,
  useReordonnerPipe,
  useSortirDuPipe,
  useVivier,
  useMesPistes,
  useFichePipe,
  useCompteursEligibles,
  useAjouterPistesAuPipe,
  useCompleterPipeDepuisPistes,
  type LignePipe,
  type LigneVivier,
  type PisteDuCockpit,
  type SourcePipe,
} from '@/lib/data/cockpit'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * COCKPIT — TROIS TEMPS, UNE SEULE PAGE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « toutes ces infos dans une seule page nommée Cockpit dans la barre de
 * navigation », et un design « qui favorise la concentration des équipes […] les équipes doivent
 * avoir l'impression de sortir de l'outil et d'entrer dans une période de prospection ».
 *
 * D'où trois temps, et une escalade délibérée de l'immersion :
 *
 *   LE SEUIL   ce qui attend, avant d'entrer. Le rail de gauche est encore là : on n'a rien
 *              commencé, on décide.
 *   LE PLAN    la surface de travail. Le rail est là aussi — on peut vouloir ouvrir une fiche.
 *   LE SPRINT  plein écran, par-dessus tout. Le rail disparaît. On y entre, on n'y navigue pas.
 *
 * C'EST LA DISPARITION PROGRESSIVE DU MOBILIER qui crée le sentiment de sortir de l'outil, et non
 * une couleur ni une animation. Un écran qui aurait tout caché dès le seuil n'aurait plus rien à
 * retirer au moment où la concentration compte vraiment.
 *
 * ══ AUCUNE RÈGLE MÉTIER ICI ══
 *
 * Les seaux, les filtres, le périmètre, le plafond, l'ordre : tout est en base (migrations
 * 20260915090000 à 20260915093000). Cette page affiche et déclenche.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Zone = 'pipe' | 'vivier' | 'pistes'

/**
 * Les filtres du plan.
 *
 * ILS PORTENT LES MÊMES REGROUPEMENTS QUE LES CARTES DU SEUIL, et c'est ce qui rend le passage de
 * l'un à l'autre lisible : le 19 lu sur la carte est le 19 de la puce, et la table qui s'ouvre en
 * contient 19. Deux découpages différents auraient fait douter du chiffre.
 */
const FILTRES: { cle: SourcePipe; libelle: string; sources: SourcePipe[] }[] = [
  { cle: 'INBOUND', libelle: 'Leads entrants', sources: ['INBOUND', 'INBOUND_LIVE'] },
  { cle: 'RAPPEL_HEURE', libelle: 'Rappels à l’heure', sources: ['RAPPEL_HEURE'] },
  { cle: 'RAPPEL_JOUR', libelle: 'Rappels sans heure', sources: ['RAPPEL_JOUR'] },
  { cle: 'VIVIER', libelle: 'À transformer', sources: ['VIVIER', 'PISTE_FROIDE', 'OPPORTUNITE_DORMANTE', 'AJOUT_MANUEL'] },
]

/* `SEAUX` est parti avec le seuil (21/09/2026) : ses quatre entrées faisaient doublon avec
   `FILTRES` ci-dessus, qui porte les mêmes regroupements et sert désormais seul. */

/**
 * ══════════════════ LES QUATRE FAMILLES DU VIVIER ══════════════════
 *
 * William, 21/09/2026 : « je veux notamment un héro avec échéances dépassées, un avec échéances
 * vides, un sans périmètre, et un avec échéance < 18 mois. Au clic, la liste du dessous s'affichera
 * comme filtrée. »
 *
 * ELLES SONT EXCLUSIVES ET EXHAUSTIVES, et c'est ce qui rend les quatre cartes honnêtes : leurs
 * effectifs s'additionnent au total affiché. Mesuré le 21/09/2026 sur les 1 916 lignes du vivier —
 * 1 070 dépassées, 640 sous dix-huit mois, 127 sans périmètre, 79 sans échéance connue. Quatre
 * cases qui se chevaucheraient feraient un total faux, et le doute porterait sur tout l'écran.
 *
 * L'ORDRE DES TESTS PORTE LA PRIORITÉ : sans périmètre d'abord — on ne sait rien de ce contact, ce
 * n'est pas une question de date ; puis dépassée, qui est une alarme ; puis l'absence d'échéance,
 * qui est une ignorance ; le reste est un calendrier.
 */
type FamilleVivier = 'SANS_PERIMETRE' | 'DEPASSEE' | 'VIDE' | 'SOUS_18'

function familleDe(l: LigneVivier): FamilleVivier {
  if (l.critere === 'SANS_PERIMETRE') return 'SANS_PERIMETRE'
  if (l.echeance_depassee) return 'DEPASSEE'
  if (!l.echeance_min) return 'VIDE'
  return 'SOUS_18'
}

/**
 * ══════════════════ LES QUATRE CARTES DU VIVIER ══════════════════
 *
 * William, 21/09/2026 : « améliore largement les héros de haut de page […] je veux que ce soit
 * design et premium. Au clic, la liste du dessous s'affichera comme filtrée. »
 *
 * ══ CE QU'ELLES REMPLACENT ══
 *
 * Quatre encadrés qui disaient autre chose chacun — un volume, deux effectifs, et « le plus
 * lourd », un nom de compte. Trois unités différentes côte à côte, dont une qui ne se compare à
 * rien, et aucune n'était cliquable : on lisait « 127 sans périmètre » puis on cherchait lesquels
 * à la main dans une liste de 1 916 lignes.
 *
 * ══ POURQUOI CES QUATRE-LÀ, ET PAS D'AUTRES ══
 *
 * Elles partitionnent le vivier : leurs effectifs s'additionnent exactement au total. C'est ce qui
 * les rend cliquables sans mentir — filtrer sur l'une montre précisément son nombre, et les quatre
 * ensemble ne laissent aucun contact de côté.
 *
 * ══ L'ORDRE EST CELUI DE L'URGENCE, PAS DU VOLUME ══
 *
 * Dépassée d'abord — un contrat reconduit sans nous est une perte déjà consommée. Puis le
 * calendrier, puis les deux ignorances : échéance inconnue et périmètre vide. Les deux dernières
 * ne sont pas moins importantes, elles appellent un autre geste — qualifier plutôt que vendre.
 *
 * ══ « PREMIUM » VEUT DIRE QUE LE CHIFFRE RESPIRE ══
 *
 * Un nombre en 26 px, une barre de proportion sous lui, et deux lignes de texte. La barre est ce
 * qui fait la différence avec un encadré ordinaire : elle situe la famille dans l'ensemble sans
 * qu'on ait à diviser de tête, et c'est elle qui donne à la rangée son unité — quatre parts d'un
 * même tout, et non quatre chiffres sans rapport.
 */
interface Carte {
  titre: string
  detail: string
  /* La teinte porte l'urgence, jamais l'information seule : l'effectif est toujours écrit. */
  accent: string
  fond: string
  bord: string
  texte: string
}

/* Les quatre teintes, dans l'ordre d'urgence. Elles servent aux trois zones, si bien qu'une carte
   rouge veut dire la même chose partout — « c'est déjà en retard, ou ça ne peut pas avancer ». */
const TON_ROUGE = { accent: 'bg-km-red', fond: 'bg-km-red-soft', bord: 'border-km-red-line', texte: 'text-km-red' }
const TON_AMBRE = { accent: 'bg-km-amber', fond: 'bg-km-amber-soft', bord: 'border-km-amber/40', texte: 'text-km-amber' }
const TON_BLEU = { accent: 'bg-km-blue', fond: 'bg-km-blue-soft', bord: 'border-km-blue/30', texte: 'text-km-blue' }
const TON_GRIS = { accent: 'bg-km-muted', fond: 'bg-km-soft', bord: 'border-km-line', texte: 'text-km-muted' }

const CARTES_VIVIER: (Carte & { cle: FamilleVivier })[] = [
  {
    cle: 'DEPASSEE',
    titre: 'Échéances dépassées',
    detail: 'Reconduits sans nous',
    ...TON_ROUGE,
  },
  {
    cle: 'SOUS_18',
    titre: 'Échéance sous 18 mois',
    detail: 'À consulter le moment venu',
    ...TON_AMBRE,
  },
  {
    cle: 'VIDE',
    titre: 'Échéance inconnue',
    detail: 'Un parc, aucune date',
    ...TON_BLEU,
  },
  {
    cle: 'SANS_PERIMETRE',
    titre: 'Sans périmètre',
    detail: 'Décisionnaires sans compteur',
    ...TON_GRIS,
  },
]

/**
 * ══ LES QUATRE FAMILLES DU PIPE ══
 *
 * Ce sont les quatre seaux que la base construit, et que les puces rondes portaient déjà : le
 * découpage ne change pas, sa forme oui. « Le nombre lu sur la carte est celui de la liste »
 * reste vrai — c'était la qualité de l'ancien seuil, elle survit ici.
 */
const CARTES_PIPE: (Carte & { cle: SourcePipe; sources: SourcePipe[] })[] = [
  { cle: 'INBOUND', sources: ['INBOUND', 'INBOUND_LIVE'], titre: 'Leads entrants', detail: 'Priorité absolue', ...TON_ROUGE },
  { cle: 'RAPPEL_HEURE', sources: ['RAPPEL_HEURE'], titre: 'Rappels à l’heure', detail: 'Un créneau a été promis', ...TON_AMBRE },
  { cle: 'RAPPEL_JOUR', sources: ['RAPPEL_JOUR'], titre: 'Rappels du jour', detail: 'Sans heure convenue', ...TON_BLEU },
  {
    cle: 'VIVIER',
    sources: ['VIVIER', 'PISTE_FROIDE', 'OPPORTUNITE_DORMANTE', 'AJOUT_MANUEL'],
    titre: 'À transformer',
    detail: 'Tirés du vivier ou dormants',
    ...TON_GRIS,
  },
]

/**
 * ══ LES QUATRE FAMILLES DE MES PISTES ══
 *
 * Exclusives et exhaustives, comme celles du vivier — sans quoi les cartes mentiraient en
 * s'additionnant. L'ordre suit ce qu'il y a à faire : appeler, relancer, compléter, archiver.
 *
 * « SANS NUMÉRO » N'EST PAS UNE VARIANTE DE « JAMAIS APPELÉE », c'est un autre travail : 1 259
 * pistes sur 4 750 n'ont aucun téléphone. Les mêler ferait croire à un gisement d'appels qui
 * n'existe pas, et masquerait le vrai geste — retrouver un numéro.
 */
type FamillePiste = 'JAMAIS' | 'APPELEE' | 'INJOIGNABLE' | 'CLOSE'

function famillePisteDe(p: PisteDuCockpit): FamillePiste {
  if (p.statut_clos) return 'CLOSE'
  if (p.date_premier_appel) return 'APPELEE'
  if (!p.telephone && !p.telephone_mobile) return 'INJOIGNABLE'
  return 'JAMAIS'
}

const CARTES_PISTES: (Carte & { cle: FamillePiste })[] = [
  { cle: 'JAMAIS', titre: 'Jamais appelées', detail: 'Le premier gisement', ...TON_AMBRE },
  { cle: 'APPELEE', titre: 'Déjà appelées', detail: 'À relancer', ...TON_BLEU },
  { cle: 'INJOIGNABLE', titre: 'Sans numéro', detail: 'À compléter avant d’appeler', ...TON_ROUGE },
  { cle: 'CLOSE', titre: 'Closes', detail: 'Converties ou disqualifiées', ...TON_GRIS },
]

/**
 * Une carte de filtre, la même dans les trois zones.
 *
 * William, 21/09/2026 : « j'aimerais que le header soit exactement le même peu importe Pipe du
 * jour, Vivier ou Mes pistes. Tous les éléments doivent être placés exactement à la même place.
 * C'est le reste de la page qui évolue, pas le haut. »
 *
 * D'OÙ UNE SEULE CARTE ET UNE SEULE RANGÉE. Chaque zone donne ses quatre familles ; la forme, la
 * hauteur et la position ne changent jamais. Ce qui bougeait avant : le pipe montrait des puces
 * rondes, le vivier quatre encadrés, les pistes une phrase et une case à cocher — trois hauteurs
 * différentes, donc un tableau dont le bord supérieur sautait à chaque changement d'onglet.
 */
function CarteFiltre({
  carte,
  n,
  mesure,
  total,
  actif,
  onCliquer,
}: {
  carte: Carte
  n: number
  /** Le second chiffre, quand la zone en a un : le volume pour le vivier, rien ailleurs. */
  mesure?: string | null
  /** L'effectif de la zone entière : la barre mesure une PART, pas une valeur. */
  total: number
  actif: boolean
  onCliquer: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCliquer}
      aria-pressed={actif}
      disabled={n === 0}
      title={n === 0 ? 'Aucun contact dans cette famille' : actif ? 'Retirer le filtre' : 'Filtrer la liste'}
      className={cn(
        'group/carte relative overflow-hidden rounded-km-lg border px-3.5 py-3 text-left transition-all',
        actif ? `${carte.fond} ${carte.bord} shadow-km-card` : 'border-km-line bg-km-surface',
        n > 0 && !actif && 'hover:border-km-line hover:shadow-km-card',
        n === 0 && 'cursor-default opacity-55',
      )}
    >
      {/* Le filet d'accent : discret au repos, plein quand la carte commande la liste. */}
      <span
        className={cn('absolute inset-y-0 left-0 w-[3px] transition-opacity', carte.accent, actif ? 'opacity-100' : 'opacity-40')}
        aria-hidden="true"
      />

      <span className={cn('block font-mono text-km-micro uppercase tracking-[0.13em]', actif ? carte.texte : 'text-km-muted')}>
        {carte.titre}
      </span>

      <span className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('font-mono text-km-metric-lg font-semibold leading-none tabular-nums', actif ? carte.texte : 'text-km-text')}>
          {n}
        </span>
        {mesure ? (
          <span className="font-mono text-km-label tabular-nums text-km-muted">· {mesure}</span>
        ) : null}
      </span>

      <span className="mt-1.5 block text-km-micro text-km-muted">{carte.detail}</span>

      {/* LA PART DU TOUT, sans qu'on ait à diviser de tête : c'est ce qui fait de quatre chiffres
          une seule lecture. Elle est absente quand la famille est vide — une barre à zéro se lit
          comme une barre non chargée. */}
      {n > 0 ? (
        <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-km-line" aria-hidden="true">
          <span
            className={cn('block h-full rounded-full', carte.accent)}
            /* Trois pour cent au minimum : une famille de sept contacts sur mille neuf cents
               donnerait un trait invisible, et on la croirait vide. */
            style={{ width: `${Math.max(3, Math.round((n / Math.max(1, total)) * 100))}%` }}
          />
        </span>
      ) : null}
    </button>
  )
}

export default function Cockpit() {
  /**
   * LE VERROU EST LA PREMIÈRE LIGNE DE LA PAGE, avant tout crochet.
   *
   * Un retour anticipé placé après `usePipeDuJour` appellerait quand même
   * `construire_pipe_du_jour` — donc écrirait un snapshot en production pour un écran que
   * personne ne verra. Ici, rien n'est demandé à la base tant que le Cockpit est fermé.
   *
   * `cockpitOuvert` est une constante de module, pas un état : sa valeur ne change jamais pendant
   * la vie du composant, et les règles des crochets sont donc respectées.
   */
  if (!cockpitOuvert) return <CockpitEnConstruction />

  return <CockpitOuvert />
}

function CockpitOuvert() {
  const [zone, setZone] = useState<Zone>('pipe')
  /* TOUT EST CHARGÉ, LE TRI SE FAIT AUX CARTES. La case « inclure les closes » a disparu avec la
     barre qu'elle occupait : les closes sont devenues la quatrième carte, ce qui les rend visibles
     sans les imposer. Six cents lignes au plus se filtrent sans qu'on le sente. */
  const { data: mesPistes } = useMesPistes(true)
  const [enSprint, setEnSprint] = useState(false)
  const [choisie, setChoisie] = useState<string | null>(null)
  const [cochees, setCochees] = useState<Set<string>>(new Set())
  /* LE CLIC SUR LA LIGNE CHOISIT, LA CASE COCHE (William, 21/09/2026 : « quand je clique sur une
     ligne, dans le volet de droite, tu dois afficher le ou les compteurs »). C'étaient le même
     geste : cliquer n'importe où cochait, et le volet ne montrait qu'un décompte. Les deux se
     séparent — on lit une fiche bien plus souvent qu'on n'en sélectionne un lot. */
  const [contactChoisi, setContactChoisi] = useState<string | null>(null)
  const [familleVivier, setFamilleVivier] = useState<FamilleVivier | null>(null)
  const [famillePiste, setFamillePiste] = useState<FamillePiste | null>(null)
  /* Les pistes se cochent comme les contacts du vivier, avec leur propre panier : les deux zones
     ne se mélangent pas, et passer de l'une à l'autre ne perd pas la sélection en cours. */
  const [pistesCochees, setPistesCochees] = useState<Set<string>>(new Set())
  const ajouterPistes = useAjouterPistesAuPipe()
  const completerPistes = useCompleterPipeDepuisPistes()
  const [tire, setTire] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /** `null` veut dire « tout le pipe ». La valeur est la première source du seau choisi. */
  const [filtre, setFiltre] = useState<SourcePipe | null>(null)

  const { data: pipe, isLoading } = usePipeDuJour()
  const { data: vivier } = useVivier()
  const completer = useCompleterPipe()
  const ajouter = useAjouterAuPipe()
  const sortir = useSortirDuPipe()
  const reordonner = useReordonnerPipe()

  const lignes = pipe?.lignes ?? []
  /**
   * Ce que la table montre, et ce que le sprint parcourra.
   *
   * LE SPRINT SUIT LE FILTRE, et le bouton annonce son effectif. Sinon un conseiller qui a filtré
   * sur ses quatre leads entrants lancerait un sprint de soixante sans comprendre pourquoi.
   */
  const affichees = filtre ? lignes.filter((l) => FILTRES.find((f) => f.cle === filtre)?.sources.includes(l.source)) : lignes
  /* `?? []` produirait un tableau neuf à chaque rendu, donc un `useMemo` qui recalcule toujours. */
  const lignesVivier = useMemo(() => vivier?.lignes ?? [], [vivier])

  /* UNE SEULE DES DEUX SOURCES SUFFIT À LE DIRE. Les fonctions du pipe et la vue du vivier
     arrivent par des migrations distinctes : n'annoncer que l'absence du pipe laisserait un vivier
     vide sans explication, ce qui est exactement la question qu'on s'est posée le 15/09. */
  const enAttenteDeMigration = pipe?.pretMigration === false || vivier?.pretMigration === false
  const laFiche = affichees.find((l) => l.ligne_id === choisie) ?? affichees[0]

  /* Les héros du vivier : de l'argent et des alarmes, pas des effectifs de lignes. */
  /**
   * Les quatre effectifs et le volume qu'ils représentent, en UNE passe.
   *
   * LE VOLUME PAR FAMILLE, et pas seulement le compte : « 1 070 échéances dépassées » dit l'ampleur
   * du retard, « 34 000 MWh » dit ce qu'il coûte. C'est le second chiffre qui fait choisir par
   * laquelle des quatre commencer.
   */
  const heros = useMemo(() => {
    const vide = { n: 0, mwh: 0 }
    const par: Record<FamilleVivier, { n: number; mwh: number }> = {
      SANS_PERIMETRE: { ...vide }, DEPASSEE: { ...vide }, VIDE: { ...vide }, SOUS_18: { ...vide },
    }
    let mwh = 0
    for (const l of lignesVivier) {
      const f = familleDe(l)
      par[f].n += 1
      par[f].mwh += l.mwh_annuels ?? 0
      mwh += l.mwh_annuels ?? 0
    }
    return { par, mwh, total: lignesVivier.length }
  }, [lignesVivier])

  /* La liste suit la carte choisie. Aucun tri n'est refait : la vue les rend déjà par urgence puis
     par volume, et réordonner à l'arrivée contredirait ce que la première ligne promet. */
  const vivierAffiche = useMemo(
    () => (familleVivier ? lignesVivier.filter((l) => familleDe(l) === familleVivier) : lignesVivier),
    [lignesVivier, familleVivier],
  )

  const pistesAffichees = useMemo(() => {
    const toutes = mesPistes ?? []
    /* SANS CARTE CHOISIE, LES CLOSES RESTENT HORS DE L'ÉCRAN : le Cockpit est un plan de travail,
       pas un historique. Leur carte les rappelle quand on la clique. */
    return famillePiste
      ? toutes.filter((p) => famillePisteDe(p) === famillePiste)
      : toutes.filter((p) => !p.statut_clos)
  }, [mesPistes, famillePiste])

  /**
   * LES QUATRE CARTES DE LA ZONE COURANTE, calculées au même endroit pour les trois.
   *
   * C'est ce qui garantit ce que William demande : une seule rangée, une seule forme, une seule
   * position. Changer d'onglet change ce que les cartes comptent, jamais où elles sont.
   */
  const cartes = useMemo(() => {
    if (zone === 'pipe') {
      return CARTES_PIPE.map((c) => ({
        cle: c.cle as string,
        carte: c as Carte,
        n: lignes.filter((l) => c.sources.includes(l.source)).length,
        mesure: null as string | null,
      }))
    }
    if (zone === 'vivier') {
      return CARTES_VIVIER.map((c) => ({
        cle: c.cle as string,
        carte: c as Carte,
        n: heros.par[c.cle].n,
        mesure: heros.par[c.cle].mwh > 0 ? `${Math.round(heros.par[c.cle].mwh).toLocaleString('fr-FR')} MWh` : null,
      }))
    }
    const toutes = mesPistes ?? []
    return CARTES_PISTES.map((c) => ({
      cle: c.cle as string,
      carte: c as Carte,
      n: toutes.filter((p) => famillePisteDe(p) === c.cle).length,
      mesure: null as string | null,
    }))
  }, [zone, lignes, heros, mesPistes])

  const familleCourante = zone === 'pipe' ? filtre : zone === 'vivier' ? familleVivier : famillePiste
  const totalZone = zone === 'pipe' ? lignes.length : zone === 'vivier' ? heros.total : (mesPistes ?? []).length

  function choisirCarte(cle: string) {
    setContactChoisi(null)
    setChoisie(null)
    if (zone === 'pipe') setFiltre(filtre === cle ? null : (cle as SourcePipe))
    else if (zone === 'vivier') setFamilleVivier(familleVivier === cle ? null : (cle as FamilleVivier))
    else setFamillePiste(famillePiste === cle ? null : (cle as FamillePiste))
  }

/* `horizons` est parti avec le graphique des échéances (21/09/2026) : il répartissait le vivier
     en quatre tranches de calendrier pour dessiner quatre barres. Le vivier étant déjà trié par
     urgence, sa première ligne dit ce que la première barre disait. */


  function signaler(m: string) {
    setMessage(m)
    window.setTimeout(() => setMessage(null), 4000)
  }

  /* `compte` et `detailDuSeau` sont partis avec les puces rondes du pipe (21/09/2026). Le premier
     comptait les lignes d'un seau — `cartes` le fait désormais pour les trois zones d'un même
     calcul ; le second écrivait « dont 6 en retard depuis hier » en infobulle, que le détail de
     chaque carte porte maintenant en clair. */


  /* LES DEUX BOUTONS FONT LE MÊME GESTE SUR DEUX GISEMENTS (William, 21/09/2026) : Kimatch
     calcule la place qui reste jusqu'au plafond et la remplit lui-même. Le calcul et le choix
     vivent dans la même requête, en base — c'est ce qui garantit qu'on n'ajoute jamais plus que
     la place disponible, même si deux onglets cliquent en même temps.

     CE QUI DIFFÈRE, C'EST LA PRIORITÉ : le vivier sert d'abord le plus de périmètre, les pistes
     d'abord celles qui portent une liste de copropriétés. Ni l'une ni l'autre n'est un tri au
     hasard — le hasard ne départage plus que les strictement égaux. */
  async function surCompleter() {
    const n = await completer.mutateAsync(undefined)
    signaler(
      n > 0
        ? `${n} opportunité${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''} depuis le vivier — les plus gros périmètres d'abord.`
        : 'Rien à ajouter : le pipe est déjà plein, ou votre vivier est vide.',
    )
  }

  async function surCompleterPistes() {
    const n = await completerPistes.mutateAsync(undefined)
    signaler(
      n > 0
        ? `${n} piste${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au pipe — celles qui portent une liste de copropriétés d'abord.`
        : 'Rien à ajouter : le pipe est déjà plein, ou toutes vos pistes y sont déjà.',
    )
  }

  async function surAjouter() {
    const n = await ajouter.mutateAsync([...cochees])
    setCochees(new Set())
    signaler(`${n} opportunité${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''} et ajoutée${n > 1 ? 's' : ''} au pipe.`)
    setZone('pipe')
  }

  /* Une piste rejoint le pipe SANS RIEN CRÉER : ni contact, ni opportunité. C'est ce qui la
     distingue du vivier, où le bouton crée d'abord des opportunités. Le plafond du pipe ne la
     bloque pas non plus — on peut en avoir moins que demandé, jamais plus. */
  async function surAjouterPistes() {
    const n = await ajouterPistes.mutateAsync([...pistesCochees])
    setPistesCochees(new Set())
    signaler(
      n > 0
        ? `${n} piste${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au pipe du jour.`
        : 'Rien à ajouter : ces pistes y sont déjà, ou le pipe est plein.',
    )
    if (n > 0) setZone('pipe')
  }

  /* ── LE GLISSER-DÉPOSER : l'ordre est persisté, sinon il ne survivrait pas au rechargement et
        le conseiller le referait chaque matin. ── */
  function surDepot(surId: string) {
    if (!tire || tire === surId) return
    const ordre = lignes.map((l) => l.ligne_id)
    const de = ordre.indexOf(tire)
    const vers = ordre.indexOf(surId)
    if (de < 0 || vers < 0) return
    ordre.splice(de, 1)
    ordre.splice(vers, 0, tire)
    void reordonner.mutateAsync(ordre)
    setTire(null)
  }

  if (enSprint) {
    return (
      <SprintCockpit
        lignes={affichees}
        onSortir={(ligne, motif) => void sortir.mutateAsync({ ligne, motif })}
        onFermer={() => setEnSprint(false)}
      />
    )
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════
     LE SEUIL EST SUPPRIMÉ — ON ARRIVE DIRECTEMENT SUR LE PLAN DU JOUR

     William, 21/09/2026 : « oublie la première page, c'est un clic en trop et inutile. Je dois
     directement arriver sur le pool du jour. »

     ══ CE QU'IL ÉTAIT, ET POURQUOI IL NE TIENT PAS ══

     Un écran d'entrée plein cadre : la date, quatre cartes de comptage, un bouton « Démarrer la
     séance ». Son intention était l'immersion — trois temps, « le seuil, le plan, le sprint », une
     disparition progressive du mobilier pour donner le sentiment de sortir de l'outil.

     L'INTENTION SE TENAIT, L'ÉCONOMIE NON. Le seuil ne portait AUCUNE information que le plan
     n'affiche déjà : ses quatre cartes sont les quatre puces de filtre, avec les mêmes nombres —
     c'était même sa qualité revendiquée, « le 19 lu sur la carte est le 19 de la puce ». Il coûtait
     donc un clic par séance pour relire ce qu'on allait voir juste après.

     Et l'immersion ne perd rien : elle reposait sur la disparition du rail au moment du SPRINT,
     qui reste plein écran. C'est ce contraste-là qui fait le changement de lieu, pas une page
     d'accueil.

     CE QUI EST REPRIS DU SEUIL : la date et la mention « figé ce matin », qui disent qu'on
     travaille sur une liste arrêtée ; et le détail de chaque seau, passé en infobulle des puces
     — « dont 6 en retard depuis hier » aide à décider par où commencer, mais n'a pas besoin d'une
     ligne à lui.
     ══════════════════════════════════════════════════════════════════════════════════════ */

  /* ══════════════ LE PLAN DU JOUR ══════════════ */
  return (
    /* ══ LA PAGE NE DÉFILE PAS, SES ZONES DÉFILENT ══
       William, 21/09/2026 : « je veux que dans le volet de droite je puisse voir en permanence le
       bouton Créer opportunité et ajouter au pipe… ce n'est pas le cas du tout ».

       IL AVAIT RAISON, ET MON CORRECTIF PRÉCÉDENT NE POUVAIT PAS MARCHER. Le volet était collé à
       `top-[53px]` et haut de `100vh - 53px` — deux nombres qui supposent une barre d'outils de
       53 px exactement. Elle en fait davantage dès qu'elle passe à la ligne, ce qui arrive depuis
       qu'elle porte la date et trois onglets : le volet débordait alors sous le bas de la fenêtre,
       et son pied avec.

       `data-pleine-hauteur` supprime la question. La page prend la hauteur disponible, la barre et
       les héros ne bougent pas, et chaque zone gère son propre défilement — sans qu'aucun pixel ne
       soit écrit nulle part. C'est la convention des fiches depuis le 15/09/2026. */
    <div data-pleine-hauteur className="flex h-full flex-col overflow-hidden">
      <TitreOnglet title="Cockpit" crumb="Plan du jour" />

      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-b border-km-line bg-km-surface px-4 py-2.5 sm:px-6">
        {/* ══ LE TITRE NE CHANGE PLUS, ET C'EST LUI QUI DÉPLAÇAIT TOUT ══
            William, 21/09/2026, captures à l'appui : « pourtant les captures montrent bien que les
            contenus bougent ». Il avait raison et je regardais au mauvais endroit — la rangée de
            cartes était bien fixe, mais ce titre passait de « PLAN DU JOUR » à « VIVIER » puis à
            « MES PISTES », trois largeurs différentes qui poussaient la date et les onglets de
            plusieurs dizaines de pixels à chaque changement.

            « COCKPIT » NE BOUGE JAMAIS, et ne perd rien : l'onglet actif dit déjà dans quelle zone
            on est, en plus gros et en surbrillance. Le titre le répétait — c'est même pour ça
            qu'il pouvait partir. */}
        <h2 className="font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-text">
          Cockpit
        </h2>
        {/* CE QUE LE SEUIL DISAIT ET QUI COMPTE ENCORE : on travaille sur une liste ARRÊTÉE ce
            matin. Sans cette mention, un pipe qui ne bouge pas de la journée passe pour un écran
            qui ne se rafraîchit pas. */}
        <span className="hidden font-mono text-km-micro uppercase tracking-[0.14em] text-km-faint lg:inline">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          {enAttenteDeMigration ? '' : ' · figé ce matin'}
        </span>

        <div className="flex overflow-hidden rounded-km border border-km-line">
          {/* TROISIÈME ZONE : mes pistes (William, 21/09/2026). Le pipe dit ce qu'il faut faire
              aujourd'hui, le vivier ce qui dort chez mes clients, les pistes ce qui n'est pas
              encore client. Trois gisements, trois onglets — et le même écran. */}
          {([
            ['pipe', 'Pipe du jour', lignes.length],
            ['vivier', 'Vivier', heros.total],
            ['pistes', 'Mes pistes', mesPistes?.length ?? 0],
          ] as const).map(([cle, libelle, n]) => (
            <button
              key={cle}
              aria-pressed={zone === cle}
              onClick={() => setZone(cle)}
              className={cn(
                'px-3.5 py-1.5 text-km-body',
                zone === cle ? 'bg-km-text text-white' : 'text-km-muted hover:bg-km-soft',
                cle !== 'pipe' ? 'border-l border-km-line' : '',
              )}
            >
              {libelle} <span className="font-mono text-km-label opacity-75">{n}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setEnSprint(true)}
          disabled={affichees.length === 0}
          className="ml-auto inline-flex items-center gap-2.5 rounded-km bg-km-text px-4 py-2.5 text-km-body font-semibold text-white hover:bg-[#2A3340] disabled:opacity-45"
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
          Lancer un sprint
          {affichees.length !== lignes.length ? (
            <span className="font-mono opacity-80">{affichees.length}</span>
          ) : null}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════════════════
          LE HAUT NE BOUGE JAMAIS

          William, 21/09/2026 : « j'aimerais que le header soit exactement le même peu importe Pipe
          du jour, Vivier ou Mes pistes. Tous les éléments doivent être placés exactement à la même
          place. C'est le reste de la page qui évolue, pas le haut. »

          IL AVAIT TROIS BARRES DIFFÉRENTES sous les onglets : des puces rondes pour le pipe, quatre
          encadrés pour le vivier, une phrase et une case à cocher pour les pistes. Trois hauteurs,
          donc un tableau dont le bord supérieur sautait à chaque changement d'onglet — et l'œil
          devait retrouver où il en était.

          UNE SEULE RANGÉE DE QUATRE CARTES, toujours au même endroit. Ce que les cartes COMPTENT
          change avec la zone ; leur forme, leur hauteur et leur position, jamais.
          ══════════════════════════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 border-b-[3px] border-km-line bg-km-bg px-4 py-4 sm:px-6">
        {/* UNE SEULE LIGNE, TOUJOURS : `truncate` garantit qu'un libellé long ne la fera pas
            passer sur deux hauteurs et ne descendra pas les cartes d'un cran. */}
        <div className="mb-2.5 flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-km-label uppercase tracking-[0.16em] text-km-muted">
            {zone === 'pipe' ? 'Le plan du jour' : zone === 'vivier' ? 'Mon vivier' : 'Mes pistes'}
          </span>
          <span className="min-w-0 flex-1 truncate text-km-body text-km-muted">
            {zone === 'pipe'
              ? `${lignes.length} action${lignes.length > 1 ? 's' : ''}, figées ce matin`
              : zone === 'vivier'
                ? `${heros.total} contact${heros.total > 1 ? 's' : ''} · ${Math.round(heros.mwh).toLocaleString('fr-FR')} MWh/an à renégocier`
                : `${(mesPistes ?? []).length} piste${(mesPistes ?? []).length > 1 ? 's' : ''}, jamais appelées en tête`}
          </span>
          {/* LE RETRAIT DU FILTRE EST TOUJOURS AU MÊME ENDROIT, et n'apparaît que s'il y a
              quelque chose à retirer : une place réservée en permanence à un bouton absent
              déplacerait le texte à gauche dès qu'il surgit. */}
          {familleCourante ? (
            <button
              type="button"
              onClick={() => choisirCarte(familleCourante)}
              className="shrink-0 rounded-km-pill border border-km-line bg-km-surface px-2.5 py-0.5 text-km-label font-medium text-km-muted hover:border-km-green-line hover:text-km-green"
            >
              Retirer le filtre
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
          {cartes.map((c) => (
            <CarteFiltre
              key={c.cle}
              carte={c.carte}
              n={c.n}
              mesure={c.mesure}
              total={totalZone}
              actif={familleCourante === c.cle}
              onCliquer={() => choisirCarte(c.cle)}
            />
          ))}
        </div>
      </div>

      {message ? (
        <p className="border-b border-km-green-line bg-km-green-soft px-4 py-2 text-km-body text-km-green sm:px-6">{message}</p>
      ) : null}

      {enAttenteDeMigration ? (
        <p className="border-b border-km-amber-line bg-km-amber-soft px-4 py-2.5 text-km-body text-km-amber sm:px-6">
          <b className="font-semibold">Le Cockpit n’est pas encore en base.</b> Le pipe et le vivier
          resteront vides jusqu’à l’application des quatre migrations du 15/09/2026 — rien ici ne
          peut être lu avant. Ce n’est pas une erreur de l’écran.
        </p>
      ) : null}

      {/* ══ LE GRAPHIQUE DES ÉCHÉANCES EST SUPPRIMÉ (William, 21/09/2026) ══

          « On va supprimer le graphique avec les échéances, ça prend de la place pour pas
          grand-chose. »

          Six barres horizontales réparties par horizon — moins de 3 mois, 3 à 6, 6 à 12… Il
          occupait un tiers de la hauteur au-dessus de la liste, et ne servait à AUCUNE décision :
          le vivier est déjà trié par urgence, donc la première ligne de la table dit ce que la
          première barre disait, en plus précis. Les quatre chiffres du bandeau restent, eux — dont
          « échéances dépassées », le seul que le graphique apportait vraiment. */}

      {/* ══ LE VOLET FAIT UN QUART DE LA LARGEUR, ET TOUTE LA HAUTEUR ══
          William, 21/09/2026 : « le volet de droite s'affiche sur toute la hauteur de l'écran sur
          25 % de la largeur ».

          `25%` ET NON UNE LARGEUR FIXE : il faisait 372 px figés, aussi étroits sur un 27 pouces
          que sur un portable, alors que la liste du pipe n'a pas besoin de toute la place. Un
          pourcentage suit l'écran — c'est le même raisonnement que le volet d'activité des fiches,
          fixé au quart de la zone de travail le 07/09/2026. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_25%]">
        {/* MÊME DÉCOUPE QUE LE VOLET DE DROITE : un cadre qui tient la hauteur, un corps qui
            défile, un pied qui ne bouge pas. La liste est la seule chose qui bouge à l'écran. */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto">
            {zone === 'pipe' ? (
              <table className="w-full min-w-[760px] border-collapse text-km-body">
                <thead>
                  <tr>
                    {['', '#', 'Nom complet', 'Fonction', 'Compte', 'Tag', 'Segment', 'Heure'].map((t, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="sticky top-0 border-b border-km-line bg-km-bg px-3 py-2 text-left font-mono text-km-label font-medium uppercase tracking-[0.1em] text-km-muted"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {affichees.map((l, i) => (
                    <tr
                      key={l.ligne_id}
                      draggable
                      onDragStart={() => setTire(l.ligne_id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => surDepot(l.ligne_id)}
                      onClick={() => setChoisie(l.ligne_id)}
                      aria-selected={l.ligne_id === (choisie ?? affichees[0]?.ligne_id)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setChoisie(l.ligne_id) }}
                      className={cn(
                        'cursor-pointer bg-km-surface hover:bg-km-green-tint',
                        l.ligne_id === (choisie ?? affichees[0]?.ligne_id) ? 'bg-km-green-tint' : '',
                      )}
                    >
                      <td className="w-8 border-b border-km-line-soft px-2 py-2 text-km-faint">
                        <GripVertical className="h-4 w-4 cursor-grab" aria-hidden="true" />
                      </td>
                      <td className="w-10 border-b border-km-line-soft px-3 py-2 font-mono text-km-label text-km-muted">{i + 1}</td>
                      <td className="border-b border-km-line-soft px-3 py-2">
                        <span className="block font-medium">{l.nom_complet ?? 'Sans nom'}</span>
                        <span className="block font-mono text-km-label tracking-wide text-km-muted">{l.telephone ?? 'Aucun numéro'}</span>
                        <span className="block text-km-micro text-km-muted">{LIBELLE_SOURCE[l.source]}</span>
                      </td>
                      <td className="border-b border-km-line-soft px-3 py-2">{l.fonction ?? '—'}</td>
                      <td className="border-b border-km-line-soft px-3 py-2">{l.compte_nom ?? '—'}</td>
                      <td className="border-b border-km-line-soft px-3 py-2">
                        <Badge tone={l.cible_type === 'PISTE' ? 'blue' : 'green'}>
                          {l.cible_type === 'PISTE' ? 'Piste' : 'Opportunité'}
                        </Badge>
                      </td>
                      <td className="border-b border-km-line-soft px-3 py-2">{l.segment ?? '—'}</td>
                      <td
                        className={cn(
                          'border-b border-km-line-soft px-3 py-2 font-mono text-km-label tabular-nums',
                          l.en_retard ? 'font-medium text-km-amber' : l.heure ? '' : 'text-km-faint',
                        )}
                      >
                        {l.heure ?? (l.en_retard ? 'en retard' : '—')}
                      </td>
                    </tr>
                  ))}
                  {affichees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="bg-km-surface px-4 py-10 text-center text-km-muted">
                        {isLoading
                          ? 'Chargement…'
                          : filtre
                            ? 'Aucune fiche à ce titre. Retirez le filtre pour voir tout le pipe.'
                            : 'Le pipe est vide. Complétez-le depuis le vivier.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : zone === 'pistes' ? (
              /* ══════════ MES PISTES ══════════
                 William, 21/09/2026 : « j'aimerais aussi y retrouver la liste de toutes mes pistes
                 (uniquement MES pistes) ».

                 DES CASES À COCHER COMME SUR LE VIVIER, mais elles ne mènent pas au même geste.
                 `ajouter_au_pipe_depuis_vivier` prend des CONTACTS et crée une opportunité pour
                 chacun ; une piste n'a pas de contact — elle vit AVANT lui, c'est sa définition —
                 donc `ajouter_au_pipe_depuis_pistes` l'inscrit telle quelle, en `cible_type =
                 'PISTE'`, que `lister_pipe_du_jour` sait déjà rendre. Rien n'est créé : c'est
                 l'appel qui décidera de qualifier. 3 231 pistes sur 4 750 ont un numéro. */
              <table className="w-full min-w-[760px] border-collapse text-km-body">
                <thead>
                  <tr>
                    {['', 'Société', 'Contact', 'Fonction', 'Ville', 'Statut', 'Dernier appel'].map((t, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="sticky top-0 border-b border-km-line bg-km-bg px-3 py-2 text-left font-mono text-km-label font-medium uppercase tracking-[0.1em] text-km-muted"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pistesAffichees.map((p) => {
                    const numero = p.telephone ?? p.telephone_mobile
                    return (
                      <tr
                        key={p.id}
                        className={cn('bg-km-surface hover:bg-km-green-tint', pistesCochees.has(p.id) && 'bg-km-green-tint')}
                      >
                        <td className="w-9 border-b border-km-line-soft px-3 py-2">
                          <input
                            type="checkbox"
                            checked={pistesCochees.has(p.id)}
                            onChange={() => {
                              const n = new Set(pistesCochees)
                              if (n.has(p.id)) n.delete(p.id)
                              else n.add(p.id)
                              setPistesCochees(n)
                            }}
                            aria-label={`Ajouter ${p.societe ?? 'cette piste'} au pipe du jour`}
                            className="h-4 w-4 accent-km-green"
                          />
                        </td>
                        <td className="truncate border-b border-km-line-soft px-3 py-2" title={p.societe ?? undefined}>
                          <EntityLink to={`/pistes/${p.id}`} className="font-medium">
                            {p.societe ?? 'Sans société'}
                          </EntityLink>
                        </td>
                        <td className="border-b border-km-line-soft px-3 py-2">
                          <span className="block">{p.contact_nom ?? '—'}</span>
                          {numero ? (
                            <span className="block font-mono text-km-label text-km-muted">{numero}</span>
                          ) : null}
                        </td>
                        <td className="border-b border-km-line-soft px-3 py-2">{p.fonction ?? '—'}</td>
                        <td className="border-b border-km-line-soft px-3 py-2">{p.ville ?? '—'}</td>
                        <td className="border-b border-km-line-soft px-3 py-2">
                          <Badge tone={p.statut_clos ? 'neutral' : p.statut_code === 'NOUVELLE' ? 'amber' : 'kiwi'}>
                            {p.statut_libelle ?? 'Sans statut'}
                          </Badge>
                        </td>
                        <td className="border-b border-km-line-soft px-3 py-2 font-mono text-km-label tabular-nums">
                          {/* JAMAIS APPELÉE est l'information la plus utile de la ligne : c'est ce
                              qui trie la liste, et ce qui décide de commencer par elle. */}
                          {p.date_premier_appel
                            ? new Date(p.date_premier_appel).toLocaleDateString('fr-FR')
                            : <span className="text-km-amber">jamais appelée</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {pistesAffichees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="bg-km-surface px-4 py-10 text-center text-km-muted">
                        {famillePiste
                          ? 'Aucune piste dans cette famille.'
                          : 'Aucune piste ouverte ne vous est attribuée.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : (
              /* ══ CHAQUE COLONNE À SA JUSTE LARGEUR ══
                 William, 21/09/2026 : « optimise la largeur du tableau pour faire en sorte que tout
                 le contenu s'affiche ».

                 Le tableau laissait le navigateur répartir sept colonnes au jugé, avec un plancher de
                 760 px hérité de l'époque où il occupait la page entière. Depuis que le volet en
                 prend le quart, les noms de compte se coupaient au tiers pendant que « Volume »
                 gardait de quoi écrire six chiffres.

                 `table-fixed` ET DES LARGEURS DÉCLARÉES : les trois colonnes courtes — segment,
                 critère, volume — sont fixées à ce que leur contenu demande, et les trois longues se
                 partagent le reste au prorata de ce qu'elles ont à dire. Le plancher descend à
                 620 px, la largeur en dessous de laquelle plus rien ne tient. */
              <table className="w-full min-w-[620px] table-fixed border-collapse text-km-body">
                <colgroup>
                  <col className="w-9" />
                  <col className="w-[22%]" />
                  <col className="w-[17%]" />
                  <col className="w-[25%]" />
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                  <col className="w-[86px]" />
                </colgroup>
                <thead>
                  <tr>
                    {['', 'Nom complet', 'Fonction', 'Compte principal', 'Segment', 'Critère', 'Volume'].map((t, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="sticky top-0 border-b border-km-line bg-km-bg px-3 py-2 text-left font-mono text-km-label font-medium uppercase tracking-[0.1em] text-km-muted"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vivierAffiche.map((c) => (
                    <tr
                      key={c.contact_id}
                      onClick={() => setContactChoisi(c.contact_id)}
                      aria-selected={c.contact_id === contactChoisi}
                      className={cn(
                        'cursor-pointer bg-km-surface hover:bg-km-green-tint',
                        c.contact_id === contactChoisi ? 'bg-km-green-tint' : '',
                      )}
                    >
                      <td className="w-9 border-b border-km-line-soft px-3 py-2">
                        <input
                          type="checkbox"
                          id={`vivier-${c.contact_id}`}
                          checked={cochees.has(c.contact_id)}
                          /* `stopPropagation` : sans lui, cocher choisirait aussi la ligne — ce qui
                             serait juste, mais empêcherait de décocher sans changer de fiche. */
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => {
                            const n = new Set(cochees)
                            if (n.has(c.contact_id)) n.delete(c.contact_id)
                            else n.add(c.contact_id)
                            setCochees(n)
                          }}
                          aria-label={`Ajouter ${c.nom_complet ?? 'ce contact'} au pipe`}
                          className="h-4 w-4 accent-km-green"
                        />
                      </td>
                      <td className="border-b border-km-line-soft px-3 py-2">
                        <span className="block truncate font-medium" title={c.nom_complet ?? undefined}>
                          {c.nom_complet ?? 'Sans nom'}
                        </span>
                        <span className="block truncate font-mono text-km-label text-km-muted">{c.telephone ?? '—'}</span>
                      </td>
                      <td className="truncate border-b border-km-line-soft px-3 py-2" title={c.fonction ?? undefined}>
                        {c.fonction ?? '—'}
                      </td>
                      <td className="truncate border-b border-km-line-soft px-3 py-2" title={c.compte_nom ?? undefined}>
                        {c.compte_nom ?? '—'}
                      </td>
                      <td className="truncate border-b border-km-line-soft px-3 py-2" title={c.compte_segment ?? undefined}>
                        {c.compte_segment ?? '—'}
                      </td>
                      <td className="border-b border-km-line-soft px-3 py-2">
                        {/* LE LIBELLÉ SE RACCOURCIT DANS LA COLONNE, pas l'information : « dépassée »
                            suffit ici puisque la carte du haut porte le mot entier, et la ligne garde
                            sa largeur pour le nom du compte. */}
                        <Badge tone={c.echeance_depassee ? 'red' : c.critere === 'SANS_PERIMETRE' ? 'neutral' : 'amber'}>
                          {c.echeance_depassee
                            ? 'Dépassée'
                            : c.critere === 'SANS_PERIMETRE' ? 'Sans périmètre' : c.echeance_min ? '< 18 mois' : 'Inconnue'}
                        </Badge>
                      </td>
                      <td className="border-b border-km-line-soft px-3 py-2 text-right font-mono tabular-nums">
                        {c.mwh_annuels ? `${Math.round(c.mwh_annuels).toLocaleString('fr-FR')}` : '—'}
                      </td>
                    </tr>
                  ))}
                  {vivierAffiche.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="bg-km-surface px-4 py-10 text-center text-km-muted">
                        {familleVivier
                          ? 'Aucun contact dans cette famille. Cliquez la carte à nouveau pour tout revoir.'
                          : 'Votre vivier est vide : tout le portefeuille dont vous répondez est travaillé.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
          {/* ══════════ LES DEUX GESTES QUI REMPLISSENT LA JOURNÉE ══════════

              William, 21/09/2026 : « sur pipe du jour, deux fonctionnalités doivent être phares :
              compléter mon pipe avec des pistes, compléter mon pipe avec mon vivier. Ainsi, Cockpit
              viendra récupérer principalement des pistes (ou créer des opportunités) afin de les
              remonter dans le pipe du jour. »

              ILS SONT FIXES AU PIED DE LA PAGE, ET LA LISTE DÉFILE SOUS EUX — William, le même
              jour, en trois temps : d'abord en tête de zone, puis « en bas de la liste », enfin
              « tout en bas de la page, fixe, et la liste scrollable ». C'est la même découpe que
              le volet de droite, et pour la même raison : le geste qu'on vient chercher ne doit
              jamais sortir de l'écran, quelle que soit la longueur de la liste au-dessus.

              CE N'EST PAS LE RETOUR DE LA BANDE SUPPRIMÉE : celle-là traversait toute la largeur,
              sous le volet compris, et portait une phrase d'explication avec un bouton gris. Ici,
              le pied appartient à la COLONNE DE LA LISTE et s'aligne sur celui du volet.

              LES DEUX SONT CÔTE À CÔTE parce qu'ils puisent dans deux gisements différents : le
              vivier, ce sont des clients dont l'échéance approche — on crée une opportunité ; les
              pistes, ce sont des inconnus — on les appelle tels quels. Le premier se tire au hasard
              dans ce qui reste, le second se choisit à la main dans l'onglet voisin.

              ILS NE S'AFFICHENT QUE SUR LE PIPE : sur le vivier et les pistes, le geste d'ajout
              est déjà dans le volet de droite, là où l'on vient de cocher les lignes — deux pieds
              portant deux boutons différents se disputeraient le même regard. */}
          {zone === 'pipe' ? (
            <div className="grid shrink-0 grid-cols-1 gap-2.5 border-t border-km-line bg-km-surface p-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={completer.isPending}
                onClick={() => void surCompleter()}
                className="group/geste flex items-center gap-3 rounded-km-lg border border-km-green-line bg-km-green-tint px-3.5 py-3 text-left transition-shadow hover:shadow-km-card disabled:opacity-60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-km bg-km-green text-white">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-km-body font-semibold text-km-green">
                    Compléter avec mon vivier
                  </span>
                  <span className="block truncate text-km-micro text-km-muted">
                    {heros.total > 0
                      ? 'Remplit jusqu’au plafond — les plus gros périmètres d’abord'
                      : 'Aucun contact éligible pour l’instant'}
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={completerPistes.isPending}
                onClick={() => void surCompleterPistes()}
                className="group/geste flex items-center gap-3 rounded-km-lg border border-km-line bg-km-surface px-3.5 py-3 text-left transition-shadow hover:shadow-km-card disabled:opacity-60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-km bg-km-text text-white">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-km-body font-semibold text-km-text">
                    Compléter avec mes pistes
                  </span>
                  <span className="block truncate text-km-micro text-km-muted">
                    {(mesPistes ?? []).length > 0
                      ? 'Remplit jusqu’au plafond — listes de copropriétés d’abord'
                      : 'Vous n’avez aucune piste ouverte'}
                  </span>
                </span>
              </button>
            </div>
          ) : null}
        </div>

        {/* ── LE VOLET DE DÉTAIL ── */}
        {/* PLEINE HAUTEUR ET SON PROPRE DÉFILEMENT : la barre d'outils fait 53 px et reste collée
            en haut, le volet occupe tout le reste de la fenêtre. Sans `overflow-y-auto`, une fiche
            à quarante compteurs allongerait la page entière et ferait défiler la liste du pipe avec
            elle — on perdrait la ligne qu'on est en train de traiter. */}
        {/* ══ LE CORPS DÉFILE, LE PIED RESTE ══
            William, 21/09/2026 : « le bouton pour créer des opportunités doit être fixe en bas de
            page et donc la zone des compteurs scrollable, pour éviter d'étirer la fenêtre
            verticalement ».

            LE VOLET NE DÉFILE PLUS D'UN BLOC : il devient un cadre `overflow-hidden` qui tient la
            hauteur de la fenêtre, et chaque vue y range son contenu dans un corps qui défile plus
            un pied qui ne bouge pas. Un contact à douze compteurs poussait sinon le bouton hors de
            l'écran — et c'est le bouton qu'on vient chercher. */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-t border-km-line bg-km-surface lg:border-l lg:border-t-0">
          {zone === 'pipe' && laFiche ? (
            <VoletFiche
              fiche={laFiche}
              onSortir={(motif) => void sortir.mutateAsync({ ligne: laFiche.ligne_id, motif })}
            />
          ) : zone === 'pipe' ? (
            <p className="p-4 text-km-body text-km-muted">Choisissez une ligne pour voir son détail.</p>
          ) : zone === 'pistes' ? (
            /* LE VOLET DES PISTES PORTE LE SECOND GESTE PHARE (William, 21/09/2026) : « Cockpit
               viendra récupérer principalement des pistes afin de les remonter dans le pipe du
               jour ». Il dit d'abord ce que la liste ne peut pas dire — combien dorment sans
               avoir jamais été appelées, combien n'ont aucun numéro dans le lot coché — puis
               pousse le lot dans le plan du jour. */
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <div>
                  <h3 className="text-km-lg font-medium">Mes pistes</h3>
                  <p className="mt-1.5 text-km-body text-km-muted">
                    Les pistes dont vous êtes propriétaire, les <b className="font-medium text-km-text">jamais
                    appelées d’abord</b>, puis les plus anciennes.
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-2">
                  <div className="rounded-km border border-km-line bg-km-bg px-3 py-2.5">
                    <dt className="font-mono text-km-micro uppercase tracking-[0.12em] text-km-muted">Jamais appelées</dt>
                    <dd className="mt-1 font-mono text-km-metric tabular-nums text-km-amber">
                      {(mesPistes ?? []).filter((p) => !p.date_premier_appel).length}
                    </dd>
                  </div>
                  <div className="rounded-km border border-km-line bg-km-bg px-3 py-2.5">
                    <dt className="font-mono text-km-micro uppercase tracking-[0.12em] text-km-muted">Avec un numéro</dt>
                    <dd className="mt-1 font-mono text-km-metric tabular-nums text-km-text">
                      {(mesPistes ?? []).filter((p) => p.telephone || p.telephone_mobile).length}
                    </dd>
                  </div>
                </dl>

                <p className="text-km-body text-km-muted">
                  Une piste entre dans le pipe <b className="font-medium text-km-text">telle quelle</b> :
                  sans contact ni opportunité créés d’avance. C’est l’appel qui décidera de la
                  qualifier.
                </p>

                {pistesCochees.size > 0 ? (
                  <dl className="overflow-hidden rounded-km border border-km-line">
                    <Fait libelle="Pistes cochées" valeur={String(pistesCochees.size)} />
                    <Fait
                      libelle="Jamais appelées"
                      valeur={String(
                        (mesPistes ?? []).filter((p) => pistesCochees.has(p.id) && !p.date_premier_appel).length,
                      )}
                    />
                    <Fait
                      libelle="Sans numéro"
                      valeur={String(
                        (mesPistes ?? []).filter(
                          (p) => pistesCochees.has(p.id) && !p.telephone && !p.telephone_mobile,
                        ).length,
                      )}
                      alerte={(mesPistes ?? []).some(
                        (p) => pistesCochees.has(p.id) && !p.telephone && !p.telephone_mobile,
                      )}
                    />
                  </dl>
                ) : null}
              </div>

              {/* LE MÊME PIED QUE SUR LE VIVIER, AU MÊME ENDROIT : c'est le geste phare de la zone,
                  il ne doit jamais sortir de l'écran quelle que soit la longueur de la liste. */}
              <div className="shrink-0 border-t border-km-line bg-km-surface p-4">
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={pistesCochees.size === 0 || ajouterPistes.isPending}
                  onClick={() => void surAjouterPistes()}
                >
                  Ajouter {pistesCochees.size > 0 ? pistesCochees.size : ''} piste
                  {pistesCochees.size > 1 ? 's' : ''} au pipe du jour
                </Button>
                <p className="mt-1.5 text-center text-km-label text-km-faint">
                  {pistesCochees.size === 0
                    ? 'Cochez des pistes pour les appeler aujourd’hui.'
                    : 'Elles rejoignent le plan du jour telles quelles, sans rien créer.'}
                </p>
              </div>
            </>
          ) : (
            <>
              {/* ══ LE CONTACT CHOISI ET SES COMPTEURS, AVANT LE LOT ══
                  William, 21/09/2026. Le volet ne montrait qu'un décompte de cases cochées : il
                  disait ce qu'on allait créer, jamais POURQUOI ce contact est là. Or c'est la
                  question qu'on se pose avant de décrocher. Le lot reste, dessous. */}
              {/* ══ TROIS BANDES : la tête ne bouge pas, les compteurs défilent, le pied reste ══
                  William, 21/09/2026, au mot près : « le haut, de la cartouche du critère
                  d'éligibilité jusqu'au téléphone, doit être fixe ; c'est la zone "Ce qui le rend
                  éligible" qui doit être scrollable ». */}
              {contactChoisi && lignesVivier.some((l) => l.contact_id === contactChoisi) ? (
                <>
                  <div className="shrink-0 border-b border-km-line p-4">
                    <TeteContactVivier contact={lignesVivier.find((l) => l.contact_id === contactChoisi)!} />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <CompteursEligibles contact={lignesVivier.find((l) => l.contact_id === contactChoisi)!} />
                    {cochees.size > 0 ? (
                      <dl className="mt-4 overflow-hidden rounded-km border border-km-line">
                        <Fait libelle="Opportunités à créer" valeur={String(cochees.size)} />
                        <Fait
                          libelle="Volume représenté"
                          valeur={`${Math.round(
                            lignesVivier.filter((l) => cochees.has(l.contact_id)).reduce((s, l) => s + (l.mwh_annuels ?? 0), 0),
                          ).toLocaleString('fr-FR')} MWh/an`}
                        />
                      </dl>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <p className="text-km-body text-km-muted">
                    Choisissez une ligne pour voir ce qui rend ce contact éligible.
                  </p>
                </div>
              )}

              {/* LE PIED NE BOUGE JAMAIS. Il porte le seul geste de masse de l'écran, et c'est lui
                  qu'on vient chercher : il doit rester sous les yeux quel que soit le nombre de
                  compteurs lus au-dessus. */}
              <div className="shrink-0 border-t border-km-line bg-km-surface p-4">
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={cochees.size === 0 || ajouter.isPending}
                  onClick={() => void surAjouter()}
                >
                  Créer {cochees.size > 0 ? cochees.size : ''} opportunité{cochees.size > 1 ? 's' : ''} et ajouter au pipe
                </Button>
                <p className="mt-1.5 text-center text-km-label text-km-faint">
                  {cochees.size === 0
                    ? 'Cochez des lignes pour les créer en une fois.'
                    : 'Elles entreront dans le pipe du jour, même au-delà du plafond.'}
                </p>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* ══ LA BANDE DU BAS EST SUPPRIMÉE (William, 21/09/2026) ══
          Elle portait une phrase d'explication et un bouton « Compléter depuis le vivier » relégué
          tout en bas, hors du regard. Le bouton remonte en tête de la zone, où il devient l'un des
          deux gestes phares ; la phrase disparaît — « le pipe est arrêté pour la journée » est déjà
          écrit dans la barre du haut, à côté de la date. */}
    </div>
  )
}

/* `Hero` est parti avec les quatre encadrés qu'il dessinait (21/09/2026) : ils mêlaient trois
   unités, dont une — « le plus lourd » — qui ne se comparait à rien, et aucun n'était cliquable.
   `CarteVivier` les remplace : quatre parts d'un même tout, filtrantes. */


function Fait({ libelle, valeur, alerte }: { libelle: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-km-line px-3 py-2 text-km-body last:border-b-0">
      <dt className="text-km-muted">{libelle}</dt>
      <dd className={cn('text-right font-medium', alerte ? 'text-km-amber' : '')}>{valeur}</dd>
    </div>
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE VOLET D'UNE LIGNE DU PIPE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 21/09/2026, a donné l'ordre des champs, ligne à ligne, pour la piste comme pour
 * l'opportunité. Les deux listes sont presque identiques — et c'est le point : depuis le pipe, on
 * appelle QUELQU'UN, et ce qu'on a besoin de savoir ne dépend pas de la nature de l'objet.
 *
 * TROIS BLOCS SÉPARÉS PAR UN FILET FRANC, dans l'ordre où l'on en a besoin pendant l'appel :
 *
 *   QUI — statut, identité, fonction, les deux cartouches, puis le téléphone et le mail.
 *   OÙ  — le compte : nom, SIREN, adresse, NAF et APE. On le lit quand l'interlocuteur demande
 *         « c'est à quel titre que vous m'appelez ».
 *   QUOI — le commentaire et l'échéance, puis le parc : copropriétés pour un syndic, compteurs
 *         pour une opportunité.
 *
 * ══ CE QUI DIFFÈRE ENTRE LES DEUX, ET POURQUOI ══
 *
 * Une piste porte son identité en propre — elle vit avant le contact — et son parc est un NOMBRE
 * DÉCLARÉ : « 42 copropriétés, 78 lots en moyenne », ce que le syndic a dit de lui-même. Une
 * opportunité tient son identité de son contact rattaché, et son parc est une LISTE DE POINTS DE
 * LIVRAISON réels. Le volet montre l'un ou l'autre, jamais un cadre vide.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le filet entre deux blocs. Franc et non discret : il sépare trois sujets, pas trois lignes. */
function Filet() {
  return <div className="-mx-4 my-1 h-px bg-km-line" />
}

/** Une ligne « libellé → valeur » du bloc compte. */
function Ligne({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="shrink-0 font-mono text-km-micro uppercase tracking-[0.1em] text-km-muted">{libelle}</span>
      <span className="min-w-0 text-right text-km-body">{valeur}</span>
    </div>
  )
}

/**
 * La carte d'un moyen de contact : la valeur en clair, le geste à droite.
 *
 * LE DÉFILEMENT ENTRE FIXE ET MOBILE (William, 21/09/2026 : « si j'ai un mobile, ajouter un
 * défilement possible pour changer le numéro »). Deux numéros, une seule carte : on fait défiler
 * plutôt que d'empiler deux lignes dont une ne servira pas. Le nom de la ligne courante est écrit
 * sous le numéro — sans lui, on ne saurait pas lequel des deux on s'apprête à composer.
 */
function CarteContact({
  valeurs,
  libelles,
  mono,
  bouton,
  icone: Icone,
  onAgir,
  vide,
}: {
  valeurs: string[]
  libelles: string[]
  mono?: boolean
  bouton: string
  icone: typeof Phone
  onAgir: (valeur: string) => void
  vide: string
}) {
  const [i, setI] = useState(0)
  if (valeurs.length === 0) {
    return (
      <div className="rounded-km border border-dashed border-km-line px-3 py-2.5 text-km-body text-km-muted">
        {vide}
      </div>
    )
  }
  const courant = valeurs[Math.min(i, valeurs.length - 1)]
  return (
    <div className="flex items-center gap-2 rounded-km border border-km-line border-l-[3px] border-l-km-green px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-km-lead font-medium', mono && 'font-mono tracking-wide')}>
          {courant}
        </span>
        <span className="block font-mono text-km-label uppercase tracking-[0.1em] text-km-muted">
          {libelles[Math.min(i, libelles.length - 1)]}
        </span>
      </span>
      {valeurs.length > 1 ? (
        <button
          type="button"
          onClick={() => setI((n) => (n + 1) % valeurs.length)}
          title="Changer de numéro"
          aria-label="Changer de numéro"
          className="shrink-0 rounded-km-sm border border-km-line p-1.5 text-km-muted hover:border-km-green-line hover:text-km-green"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
      <Button variant="primary" onClick={() => onAgir(courant)} className="shrink-0">
        <Icone className="h-4 w-4" aria-hidden="true" />
        {bouton}
      </Button>
    </div>
  )
}

/**
 * ══════════ POURQUOI CE CONTACT EST DANS LE VIVIER ══════════
 *
 * William, 21/09/2026 : « affiche le ou les compteurs qui rendent ce contact éligible. Sur la card
 * de ces compteurs doivent être présents le libellé, le numéro, l'énergie, le statut client ou
 * prospect, l'échéance, le fournisseur en place, la consommation annuelle. »
 *
 * Puis, sur la mise en page : « le haut, de la cartouche du critère d'éligibilité jusqu'au
 * téléphone, doit être fixe ; c'est la zone "Ce qui le rend éligible" qui doit être scrollable. »
 *
 * D'OÙ DEUX COMPOSANTS ET NON UN SEUL. Le volet se découpe en trois bandes — qui l'on appelle, ce
 * qui le rend éligible, ce qu'on décide — dont seule celle du milieu défile. Un composant unique
 * aurait obligé son parent à le placer tout entier dans la bande qui défile, et le téléphone
 * serait parti avec les compteurs.
 *
 * LES DEUX APPELLENT LE MÊME CROCHET : React Query ne lance qu'une requête pour les deux, la
 * seconde lit le cache. C'est ce qui permet de les séparer sans rien recharger.
 */
function TeteContactVivier({ contact }: { contact: LigneVivier }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Badge tone={contact.echeance_depassee ? 'red' : contact.critere === 'SANS_PERIMETRE' ? 'neutral' : 'amber'}>
          {contact.echeance_depassee ? 'Échéance dépassée' : LIBELLE_CRITERE[contact.critere]}
        </Badge>
        <h3 className="mt-2 text-km-lg font-medium leading-tight">{contact.nom_complet ?? 'Sans nom'}</h3>
        <p className="mt-0.5 text-km-body text-km-muted">
          {contact.fonction ?? '—'} · {contact.compte_nom ?? '—'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-km border border-km-line border-l-[3px] border-l-km-green px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-km-lead font-medium tracking-wide">
          {contact.telephone ?? 'Aucun numéro'}
        </span>
        <Button
          variant="primary"
          disabled={!contact.telephone}
          onClick={() => contact.telephone && void appelerNumero(contact.telephone, {
            nom: contact.nom_complet, societe: contact.compte_nom, fonction: contact.fonction,
          })}
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          Appeler
        </Button>
      </div>
    </div>
  )
}

/**
 * Les compteurs qui l'ont fait entrer — la seule bande qui défile.
 *
 * CE SONT EXACTEMENT LES LIGNES QUI L'ONT FAIT ENTRER : mêmes filtres que `v_vivier_cockpit` — sans
 * opportunité vivante, sans recommandation ouverte, échéance dans les dix-huit mois ou inconnue.
 * Montrer « tous les compteurs du contact » aurait fait douter du chiffre de la colonne.
 *
 * UNE CARTE PAR COMPTEUR, ET NON UN TABLEAU : sept informations sur une ligne dans un volet au
 * quart de l'écran donneraient sept colonnes de trois caractères. La carte les range sur deux
 * niveaux — qui c'est, puis quand et combien.
 */
function CompteursEligibles({ contact }: { contact: LigneVivier }) {
  const { data: compteurs, isLoading } = useCompteursEligibles(contact.contact_id)

  if (contact.critere === 'SANS_PERIMETRE') {
    return (
      <>
        <h4 className="mb-1.5 font-mono text-km-micro uppercase tracking-[0.14em] text-km-muted">
          Aucun compteur connu
        </h4>
        <p className="text-km-body text-km-muted">
          Décisionnaire sans aucun point de livraison rattaché : c’est ce vide qui le fait entrer au
          vivier, et le premier objet de l’appel.
        </p>
      </>
    )
  }

  return (
    <>
      <h4 className="mb-1.5 font-mono text-km-micro uppercase tracking-[0.14em] text-km-muted">
        Ce qui le rend éligible <span className="text-km-faint">({compteurs?.length ?? 0})</span>
      </h4>

      {isLoading ? (
        <p className="text-km-body text-km-faint">Chargement…</p>
      ) : (compteurs ?? []).length === 0 ? (
        <p className="text-km-body text-km-faint">Aucun compteur ne correspond plus aux critères.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(compteurs ?? []).map((c) => (
            <li key={c.compteur_id} className="rounded-km border border-km-line bg-km-bg px-3 py-2.5">
              <div className="flex items-start gap-2">
                <IconeEnergie type={c.energie === 'GAZ' ? 'gaz' : 'electricite'} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-km-body font-medium leading-tight">
                    {c.libelle ?? 'Sans libellé'}
                  </span>
                  <span className="block truncate font-mono text-km-label text-km-muted">{c.numero_point}</span>
                </span>
                {/* CLIENT OU PROSPECT : une échéance PROUVÉE veut dire qu'un contrat Kiwee actif
                    couvre ce point. Même règle que l'onglet Périmètre d'une recommandation. */}
                <Badge tone={c.est_client ? 'green' : 'neutral'}>{c.est_client ? 'Client' : 'Prospect'}</Badge>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-km-label">
                <span className={cn('font-mono tabular-nums', !c.date_echeance && 'text-km-faint')}>
                  {c.date_echeance ? new Date(c.date_echeance).toLocaleDateString('fr-FR') : 'échéance inconnue'}
                  {c.nature_echeance === 'ESTIMEE' ? <span className="text-km-faint"> · estimée</span> : null}
                </span>
                <span className="text-km-muted">{c.fournisseur_nom ?? 'fournisseur inconnu'}</span>
                <span className="ml-auto font-mono tabular-nums text-km-muted">
                  {c.consommation_annuelle_mwh
                    ? `${Math.round(c.consommation_annuelle_mwh).toLocaleString('fr-FR')} MWh`
                    : '—'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function VoletFiche({ fiche, onSortir }: { fiche: LignePipe; onSortir: (m: 'APPELE' | 'REPORTE' | 'ECARTE') => void }) {
  const { data: detail, isLoading } = useFichePipe(fiche)
  const ouvrirEmail = useOuvrirEmail()

  const estPiste = fiche.cible_type === 'PISTE'
  const segment = detail?.segment ?? detail?.compte?.segment ?? fiche.segment
  /* LE TYPE EST UNE LECTURE DU SEGMENT, et pas un champ : la base range les syndics sous
     « Syndic professionnel » depuis la reprise, tout le reste est une entreprise. */
  const estSyndic = /syndic/i.test(segment ?? '')
  const typeLisible = estSyndic ? 'Syndic professionnel' : 'Entreprise'

  const nomComplet = [detail?.civilite, detail?.prenom, detail?.nom]
    .filter(Boolean)
    .join(' ')
    .trim() || fiche.nom_complet || 'Sans nom'

  /* Fixe puis mobile, sans doublon : 3 231 pistes ont un numéro, peu en ont deux différents. */
  const numeros = [detail?.telephone ?? fiche.telephone, detail?.telephone_mobile ?? fiche.telephone_mobile]
    .filter((n): n is string => Boolean(n))
  const numerosUniques = [...new Set(numeros)]
  const libellesNumeros = numerosUniques.map((n) =>
    n === (detail?.telephone_mobile ?? fiche.telephone_mobile) && n !== (detail?.telephone ?? fiche.telephone)
      ? 'Mobile'
      : 'Ligne fixe',
  )

  const adresse = [detail?.compte?.rue, [detail?.compte?.code_postal, detail?.compte?.ville].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

  const coproprietes = (detail?.liste_coproprietes ?? '')
    .split(/[;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean)

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {/* ── QUI ── */}
      <div>
        <Badge tone={estPiste ? 'blue' : 'green'}>{detail?.statut ?? (isLoading ? '…' : 'Sans statut')}</Badge>
        <h3 className="mt-2 text-km-lg font-medium leading-tight">{nomComplet}</h3>
        <p className="mt-0.5 text-km-body text-km-muted">{detail?.fonction ?? fiche.fonction ?? '—'}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone={estPiste ? 'blue' : 'green'}>{estPiste ? 'Piste' : 'Opportunité'}</Badge>
        <Badge tone="neutral">{typeLisible}</Badge>
      </div>

      {/* Le numéro en clair, à côté du bouton : c'est lui que l'extension Allo détecte. */}
      <CarteContact
        valeurs={numerosUniques}
        libelles={libellesNumeros}
        mono
        bouton="Appeler"
        icone={Phone}
        vide="Aucun numéro sur cette fiche"
        onAgir={(n) => void appelerNumero(n, { nom: nomComplet, societe: fiche.compte_nom, fonction: fiche.fonction })}
      />

      <CarteContact
        valeurs={detail?.email ? [detail.email] : []}
        libelles={['Adresse e-mail']}
        bouton="Contacter"
        icone={Mail}
        vide="Aucune adresse e-mail"
        onAgir={(a) => ouvrirEmail?.({
          a,
          nom: nomComplet,
          compteId: detail?.compte?.id || fiche.compte_id || undefined,
          contactId: fiche.contact_id ?? undefined,
          pisteId: estPiste ? fiche.cible_id : undefined,
        })}
      />

      <Filet />

      {/* ── OÙ ── */}
      <div>
        <h4 className="mb-1 font-mono text-km-micro uppercase tracking-[0.14em] text-km-muted">Le compte</h4>
        {detail?.compte ? (
          <>
            <p className="text-km-lead font-medium leading-tight">{detail.compte.nom}</p>
            <div className="mt-1.5">
              <Ligne libelle="SIREN" valeur={detail.compte.siren ?? <span className="text-km-faint">—</span>} />
              <Ligne libelle="Adresse" valeur={adresse || <span className="text-km-faint">—</span>} />
              {detail.compte.code_naf ? (
                <Ligne
                  libelle="NAF"
                  valeur={<>{detail.compte.code_naf}{detail.compte.libelle_ape ? ` · ${detail.compte.libelle_ape}` : ''}</>}
                />
              ) : null}
              {/* LE PARC DÉCLARÉ, pour un syndic seulement : « nb copros + lots moyens » (William).
                  La moyenne se calcule, elle n'est pas stockée — et elle ne s'affiche que si les
                  deux nombres existent, sinon elle vaudrait zéro sans le dire. */}
              {estSyndic && detail.nombre_coproprietes ? (
                <Ligne
                  libelle="Parc"
                  valeur={
                    <>
                      {detail.nombre_coproprietes} copropriété{detail.nombre_coproprietes > 1 ? 's' : ''}
                      {detail.nombre_de_lots
                        ? ` · ${Math.round(detail.nombre_de_lots / detail.nombre_coproprietes)} lots en moyenne`
                        : ''}
                    </>
                  }
                />
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-km-body text-km-muted">
            {isLoading ? 'Chargement…' : 'Aucun compte rattaché — la piste n’a pas encore été qualifiée.'}
          </p>
        )}
      </div>

      <Filet />

      {/* ── QUOI ── */}
      <div>
        <h4 className="mb-1 font-mono text-km-micro uppercase tracking-[0.14em] text-km-muted">Commentaire et échéance</h4>
        <p className="text-km-body">
          {detail?.commentaire || fiche.commentaire || <span className="text-km-faint">Aucun commentaire</span>}
        </p>
        <div className="mt-1.5">
          <Ligne
            libelle="Échéance"
            valeur={
              detail?.echeance || fiche.echeance
                ? <span className={fiche.en_retard ? 'font-medium text-km-amber' : ''}>{detail?.echeance ?? fiche.echeance}</span>
                : <span className="text-km-faint">inconnue</span>
            }
          />
        </div>
      </div>

      {/* Le parc réel, quand il existe. Masqué sinon — un cadre vide n'apprend rien. */}
      {estPiste && coproprietes.length > 0 ? (
        <>
          <Filet />
          <div>
            <h4 className="mb-1.5 font-mono text-km-micro uppercase tracking-[0.14em] text-km-muted">
              Copropriétés <span className="text-km-faint">({coproprietes.length})</span>
            </h4>
            <ul className="flex flex-col gap-1">
              {coproprietes.map((c, i) => (
                <li key={`${c}-${i}`} className="truncate rounded-km-sm bg-km-bg px-2 py-1 text-km-body">{c}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {!estPiste && (detail?.compteurs.length ?? 0) > 0 ? (
        <>
          <Filet />
          <div>
            <h4 className="mb-1.5 font-mono text-km-micro uppercase tracking-[0.14em] text-km-muted">
              Périmètre <span className="text-km-faint">({detail?.compteurs.length})</span>
            </h4>
            <ul className="flex flex-col gap-1">
              {(detail?.compteurs ?? []).map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-2 rounded-km-sm bg-km-bg px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-km-body">{c.libelle ?? c.numero_point}</span>
                  <span className="shrink-0 font-mono text-km-label text-km-muted">
                    {c.consommation ? `${Math.round(c.consommation).toLocaleString('fr-FR')} MWh` : c.numero_point}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      </div>

      {/* LES TROIS GESTES RESTENT AU PIED, hors du défilement : une fiche à quarante compteurs les
          poussait hors de l'écran, et ce sont eux qui closent l'appel. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-km-line bg-km-surface p-4">
        <Button className="flex-1" onClick={() => onSortir('REPORTE')}>Reporter</Button>
        <Button variant="danger" className="flex-1" onClick={() => onSortir('ECARTE')}>Écarter</Button>
        <EntityLink
          to={estPiste ? `/pistes/${fiche.cible_id}` : `/opportunites/${fiche.cible_id}`}
          className="w-full text-center"
        >
          Ouvrir la fiche
        </EntityLink>
      </div>
    </>
  )
}
