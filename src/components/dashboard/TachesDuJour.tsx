import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown, ArrowUp, Check, ChevronsUpDown, CalendarClock, Pencil, Undo2,
  Phone, Mail, FileCheck2, Radar, Target, Sparkles, FileSignature, LifeBuoy, Circle,
  type LucideIcon,
} from 'lucide-react'
import { TUILE } from '@/components/dashboard/TuilesDuJour'
import { MatriceCharge } from '@/components/dashboard/MatriceCharge'
import { MenuFiltres } from '@/components/ui/menu-filtres'
import { BarreZone, HAUTEUR_BARRE, HAUTEUR_ENTETE, HAUTEUR_LIGNE } from '@/components/dashboard/ZoneTableau'
import { PopoverAncre } from '@/components/ui/popover-ancre'
import { Dialog } from '@/components/ui/dialog'
import { MenuReport } from '@/components/tache/MenuReport'
import { PanneauEditionTache } from '@/components/tache/PanneauEditionTache'
import { useGestesTache } from '@/lib/data/gestesTache'
import type { JourDeCharge, LigneTache, PorteurTache, StatutTache } from '@/lib/data/tachesDuJour'
import { cn } from '@/lib/utils'

/**
 * ══ LES TÂCHES DU JOUR ══
 *
 * William, 10/09/2026 : une seconde zone sous « Offres du jour », même logique de zonage — un
 * tableau à gauche, des cartes à droite. Six colonnes, tri sur chacune, et un filtre à trois
 * familles : statut, objet porteur, type de tâche.
 *
 * ── LES TROIS ZONES DE LA PAGE PARTAGENT LA MÊME GRILLE ──
 *
 * William, 10/09/2026 : « le tableau des tâches doit être de la même largeur que le tableau des
 * offres du jour ». Les bords des trois blocs tombent donc au pixel les uns sous les autres, sur
 * toute la hauteur de la page.
 *
 * LE PRIX EST PAYÉ PAR LA MATRICE, et il est assumé — « je sais que ce sera beaucoup plus
 * compact ». Cinq cases de jour dans un cinquième de page, cela fait environ 65 px chacune : elle
 * est redessinée en conséquence, la date posée AU-DESSUS de la pastille pour que celle-ci ne porte
 * plus que la charge. Une colonne de droite plus large aurait rendu les cases confortables et cassé
 * l'alignement des trois zones — entre les deux, c'est l'alignement qui porte la page.
 *
 * ── ONZE PASTILLES SONT DEVENUES TROIS ──
 *
 * La première version portait une barre dédiée à trois familles : statut, porteur, type. William,
 * 11/09/2026 : « il y a trop de filtres, l'utilisation doit être rendue hyper simple. Déjà pour le
 * statut, tu peux reprendre la même logique que pour le tableau des offres. »
 *
 * Il ne reste donc que LE STATUT, et il est remonté dans la barre de titre, au même endroit et
 * avec la même mécanique que sur « Offres du jour ». Les deux tableaux de la page se pilotent
 * désormais de la même façon — ce qui vaut mieux que deux grammaires à apprendre.
 *
 * ── LE PORTEUR ET LE TYPE TIENNENT DERRIÈRE UN SEUL BOUTON ──
 *
 * William, 11/09/2026, en trois temps : « il y a trop de filtres », puis « une liste déroulante au
 * clic avec multiples choix, cela permettrait de tout afficher sans besoin de scroll », puis « je
 * veux plutôt un bouton filtre qui affiche ensuite les 2 filtres puis les multi-choix ».
 *
 * Chaque étape a retiré du bruit de la barre. Il ne reste qu'un bouton « Filtres », et derrière lui
 * un panneau à deux colonnes — le porteur à gauche, le type à droite. On voit les deux axes
 * ensemble, on coche, on ferme une fois.
 *
 * Fermé, le bouton ne coûte que soixante-dix pixels et n'affiche un compteur que s'il filtre
 * vraiment quelque chose. Une barre de travail doit montrer ce qu'on regarde, pas les réglages qui
 * servent une fois par jour. Voir `MenuFiltres`.
 *
 * ── LES TROIS FAMILLES SE COMBINENT EN « ET », LES CASES D'UNE FAMILLE EN « OU » ──
 *
 * « Les appels ET les mails, portés par une piste, et qui sont en retard. » C'est la seule
 * combinaison qui se comprenne sans mode d'emploi.
 *
 * ── LE STATUT RESTE FIXE À TROIS ──
 *
 * C'est un ensemble clos, et un « En retard : 0 » est une bonne nouvelle qui mérite d'être lue :
 * la faire disparaître parce qu'elle vaut zéro priverait de l'information.
 */

/**
 * La hauteur du bloc — le tableau et la matrice la partagent, au pixel.
 *
 * Les trois hauteurs élémentaires viennent de `ZoneTableau`, communes aux deux zones de la page :
 * recopiées ici, elles auraient fini par diverger de celles des « Offres du jour », et les deux
 * blocs ne se seraient plus alignés.
 */
const LIGNES_VISIBLES = 5
const HAUTEUR_BLOC = HAUTEUR_BARRE + HAUTEUR_ENTETE + LIGNES_VISIBLES * HAUTEUR_LIGNE

/**
 * ══ CINQ COLONNES, ET LA LIGNE ELLE-MÊME MÈNE AU DOSSIER ══
 *
 * William, 11/09/2026 : « supprime la colonne Objet, je veux plutôt que la ligne soit cliquable et
 * renvoie vers cet enregistrement plutôt qu'une colonne dédiée qui prend de la place ».
 *
 * La colonne « Objet » portait le nom du dossier et son lien. Elle coûtait 170 px à une information
 * que le clic peut porter sans rien occuper — et la colonne « Porteur » dit déjà DE QUOI il s'agit,
 * ce qui est le plus utile pour balayer la liste. Le nom exact, lui, s'obtient en survolant : il
 * est dans l'infobulle de la ligne.
 *
 * L'ORDRE SUIT LA LECTURE D'UN COMMERCIAL : ce que je dois faire, comment, sur quel dossier, avec
 * qui, pour quand.
 */
type Colonne = 'titre' | 'type' | 'porteur' | 'date'
type Sens = 'asc' | 'desc'

const COLONNES: { cle: Colonne; libelle: string; largeur: string; min: number }[] = [
  { cle: 'titre',   libelle: 'Tâche',    largeur: 'minmax(190px,2.6fr)', min: 190 },
  { cle: 'type',    libelle: 'Type',     largeur: 'minmax(104px,.8fr)',  min: 104 },
  /* 152 PX, ET CE N'EST PAS UN CHIFFRE ROND. C'est la largeur du plus long des six cartouches,
     « Suivi de contrat » : icône 14 + écart 6 + libellé 92 + rembourrage 16 + gouttière 24. À
     132 px il se repliait sur deux lignes et faisait grandir sa ligne de 8 px — un tableau dont
     les lignes n'ont pas toutes la même hauteur se balaie deux fois moins vite. */
  { cle: 'porteur', libelle: 'Porteur',  largeur: 'minmax(152px,1fr)',   min: 152 },
  { cle: 'date',    libelle: 'Échéance', largeur: 'minmax(96px,.6fr)',   min: 96 },
]

/* LA CASE À COCHER OUVRE LA LIGNE, LES DEUX COMMANDES LA FERMENT. Ni l'une ni les autres ne sont
   triables : ce sont des gestes, pas des données. Elles encadrent donc les cinq colonnes plutôt
   que d'en faire partie. */
const LARGEUR_COCHE = 38
const LARGEUR_COMMANDES = 72
const GABARIT = [`${LARGEUR_COCHE}px`, ...COLONNES.map((c) => c.largeur), `${LARGEUR_COMMANDES}px`].join(' ')

/**
 * ══ LA LARGEUR MINIMALE EST CALCULÉE, ET C'EST UN CORRECTIF ══
 *
 * V2, 11/09/2026. Elle était écrite en dur — `min-w-[940px]` — pour une place disponible de 910 px
 * sur l'écran de William. Trente pixels manquaient EN PERMANENCE, et ce sont exactement les deux
 * boutons de commande de chaque ligne qui tombaient hors champ : il fallait faire défiler le
 * tableau latéralement pour reporter une tâche. Les colonnes ont maigri de 128 px au total, et la
 * somme se calcule désormais au lieu de se recopier.
 */
const LARGEUR_MINIMALE = LARGEUR_COCHE + LARGEUR_COMMANDES + COLONNES.reduce((n, c) => n + c.min, 0)

/**
 * ══ LES TROIS STATUTS PASSENT DANS LE MENU « FILTRES » ══
 *
 * William, 11/09/2026 : « dans le tableau tâche, ajoute en fait les statuts dans les filtres —
 * donc 3 filtres désormais ».
 *
 * Ils occupaient trois pastilles dans la barre de titre, à côté du bouton « Filtres » qui en
 * contenait déjà deux autres familles. La barre avait donc DEUX GRAMMAIRES DE FILTRAGE côte à
 * côte : des pastilles qu'on décoche, et un menu qu'on ouvre. Il fallait comprendre les deux, et
 * deviner pourquoi le statut n'était pas rangé avec le reste.
 *
 * Le menu compte maintenant trois colonnes — statut, porteur, type — et la barre ne porte plus
 * qu'un décompte et un bouton. C'est le mouvement que William avait déjà demandé pour les deux
 * premières familles le matin même : « il y a trop de filtres, l'utilisation doit être rendue
 * hyper simple ».
 *
 * ── CE QUE LE STATUT PERD, ET OÙ IL LE RETROUVE ──
 *
 * Les pastilles affichaient en permanence « En retard 4 ». Ce décompte n'est pas perdu : il est
 * dans la synthèse de la zone, juste au-dessus de la bande — « 4 en retard · journée saturée à
 * venir ». Et le statut de chaque ligne se lit sur son liseré de tête, comme dans le tableau des
 * offres.
 *
 * ── ET LA SÉMANTIQUE CHANGE : AUCUNE CASE COCHÉE VEUT DIRE « TOUT » ──
 *
 * Les pastilles partaient toutes les trois allumées, et les décocher retirait des lignes. Dans le
 * menu, la règle des deux autres familles s'applique : une famille sans case cochée ne filtre
 * rien. C'est la seule convention possible quand trois familles se combinent — sinon il faudrait
 * cocher vingt cases pour tout voir.
 */
const STATUTS: { cle: StatutTache; libelle: string }[] = [
  { cle: 'EN_RETARD',  libelle: 'En retard' },
  { cle: 'DU_JOUR',    libelle: 'Du jour' },
  { cle: 'PROGRAMMEE', libelle: 'Programmée' },
]

const RANG_STATUT: Record<StatutTache, number> = { EN_RETARD: 0, DU_JOUR: 1, PROGRAMMEE: 2 }

/**
 * Le liseré de tête de ligne, à la teinte du statut — le jumeau de celui des offres.
 *
 * IL EST PERMANENT DEPUIS QUE LES PASTILLES ONT QUITTÉ LA BARRE : c'est désormais le seul endroit
 * où le statut d'une ligne se lit sans ouvrir le menu. Au bord gauche, donc au point où l'œil
 * entre dans la ligne, et sans consommer de largeur.
 *
 * LE STATUT RESTE DIT EN TOUTES LETTRES dans l'infobulle de l'échéance : une information portée
 * par la seule couleur n'existe pas pour qui ne la distingue pas.
 */
const RAIL_STATUT: Record<StatutTache, string> = {
  EN_RETARD:  'rgb(var(--km-red))',
  DU_JOUR:    'rgb(var(--km-green))',
  PROGRAMMEE: 'rgb(var(--km-blue))',
}

/** Les cinq porteurs : leur icône, leur libellé, leur route et leur teinte de cartouche. */
const PORTEURS: Record<PorteurTache, { libelle: string; icone: LucideIcon; route: string | null; classe: string }> = {
  PISTE:          { libelle: 'Piste',           icone: Radar,          route: '/pistes',           classe: 'bg-[#F6E3EA] text-[#95395A]' },
  OPPORTUNITE:    { libelle: 'Opportunité',     icone: Target,         route: '/opportunites',     classe: 'bg-opp-100 text-opp-600' },
  RECOMMANDATION: { libelle: 'Recommandation',  icone: Sparkles,       route: '/recommandations',  classe: 'bg-km-green-soft text-km-green' },
  SUIVI_CONTRAT:  { libelle: 'Suivi de contrat', icone: FileSignature, route: '/suivis-contrats',  classe: 'bg-km-blue-soft text-km-blue' },
  REQUETE:        { libelle: 'Requête',         icone: LifeBuoy,       route: '/requetes',         classe: 'bg-km-amber-soft text-km-amber' },
  AUCUN:          { libelle: 'Sans porteur',    icone: Circle,         route: null,                classe: 'bg-km-soft text-km-faint' },
}

/** Les trois types que William suit — les autres gardent une icône neutre. */
const ICONE_TYPE: Record<string, LucideIcon> = {
  APPELER: Phone,
  ENVOYER_EMAIL: Mail,
  LIVRABLE: FileCheck2,
}

function CartouchePorteur({ type }: { type: PorteurTache }) {
  const p = PORTEURS[type]
  const Icone = p.icone
  return (
    <span className={cn(
      'inline-flex max-w-full items-center gap-1.5 truncate whitespace-nowrap rounded-km px-2 py-[3px] text-km-label font-semibold',
      p.classe,
    )}>
      <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.3} />
      {p.libelle}
    </span>
  )
}

/**
 * ══ LE CONTACT DEVIENT UNE PASTILLE D'INITIALES, DEVANT L'INTITULÉ ══
 *
 * William, 11/09/2026, en validant la maquette : « ce que tu avais mis dans ta dernière
 * proposition était top ». Dans cette maquette, le contact n'avait plus de colonne.
 *
 * LA COLONNE COÛTAIT 128 PX POUR UN NOM QU'ON NE LIT PAS EN BALAYANT. Ce qu'on cherche dans une
 * liste de tâches, c'est CE QU'IL FAUT FAIRE ; le nom de la personne ne sert qu'au moment où l'on
 * décroche, c'est-à-dire une fois qu'on a choisi la ligne. Deux initiales suffisent à la
 * reconnaître, le nom complet est dans l'infobulle, et la fiche est à un clic.
 *
 * Les 128 px rendus vont à l'intitulé, qui passe d'environ 180 à 290 px — assez pour que la
 * plupart des tâches s'affichent en entier au lieu d'être coupées au tiers.
 *
 * LA PASTILLE RESTE UN VRAI LIEN quand le contact existe : elle est au-dessus du lien étendu de
 * la ligne, et mène à la fiche du contact.
 */
function PastilleContact({ id, nom }: { id: string | null; nom: string | null }) {
  if (!nom) {
    return (
      <span
        aria-hidden
        className="pointer-events-none flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-km-soft text-km-tiny font-bold text-km-faint"
      >
        —
      </span>
    )
  }

  // Les deux initiales : première lettre du prénom, première du nom. Un nom en un seul mot en
  // rend une seule plutôt que deux lettres du même mot, qui ne distinguent rien.
  const initiales = nom.trim().split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('')

  const contenu = (
    <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-km-green-soft text-[9px] font-bold leading-none text-km-green">
      {initiales}
    </span>
  )

  if (!id) return <span title={nom}>{contenu}</span>

  return (
    <Link
      to={`/contacts/${id}`}
      onClick={(e) => e.stopPropagation()}
      title={nom}
      aria-label={`Ouvrir la fiche de ${nom}`}
      className="pointer-events-auto relative z-10 shrink-0 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45"
    >
      {contenu}
    </Link>
  )
}

/**
 * ══ LES TROIS GESTES D'UNE LIGNE ══
 *
 * William, 11/09/2026 : « dans le tableau ce sont des tâches ouvertes, donc on doit pouvoir les
 * terminer, les reporter ou les modifier — on a déjà discuté de ces fonctionnalités ».
 *
 * Rien n'est réécrit : `useGestesTache`, `MenuReport` et `PanneauEditionTache` viennent de « Ma
 * journée » et servent tels quels. Cocher garde donc sa fenêtre de rétractation de cinq secondes,
 * et reporter garde sa règle — la base de calcul est l'échéance actuelle, pas aujourd'hui, sinon
 * « +1 semaine » sur une tâche en retard de trois jours grignoterait le retard au lieu de le
 * déplacer.
 *
 * ── UN BOUTON DANS UNE LIGNE CLIQUABLE : LE PIÈGE, ET LA SORTIE ──
 *
 * La ligne mène au dossier. Mettre une case à cocher et deux boutons DANS un `<a>` est invalide —
 * un élément interactif n'en contient pas un autre — et produit des comportements imprévisibles au
 * clavier comme au clic du milieu.
 *
 * La ligne est donc un `<div>`, et le lien un `<a>` ÉTENDU en absolu par-dessus toute la ligne, en
 * dessous du reste. Les cellules de texte laissent passer le clic (`pointer-events-none`), les
 * commandes le reprennent (`pointer-events-auto`). On garde un vrai lien — clic droit, ⌘ + clic,
 * adresse au survol — et des boutons qui fonctionnent.
 */
function Commandes({
  ligne,
  gestes,
  onModifier,
}: {
  ligne: LigneTache
  gestes: ReturnType<typeof useGestesTache>
  onModifier: () => void
}) {
  const [reportOuvert, setReportOuvert] = useState(false)
  const boutonReport = useRef<HTMLButtonElement>(null)

  return (
    <span className="pointer-events-auto relative z-10 flex items-center justify-end gap-0.5 px-2">
      <button
        ref={boutonReport}
        type="button"
        onClick={() => setReportOuvert((v) => !v)}
        title="Reporter cette tâche"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-km transition-colors',
          reportOuvert ? 'bg-km-soft text-km-text' : 'text-km-faint hover:bg-km-soft hover:text-km-text',
        )}
      >
        <CalendarClock className="h-[15px] w-[15px]" strokeWidth={2.2} />
      </button>

      <button
        type="button"
        onClick={onModifier}
        title="Modifier cette tâche"
        className="flex h-7 w-7 items-center justify-center rounded-km text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
      >
        <Pencil className="h-[15px] w-[15px]" strokeWidth={2.2} />
      </button>

      <PopoverAncre
        ouvert={reportOuvert}
        onFermer={() => setReportOuvert(false)}
        ancre={boutonReport}
        largeur={272}
        ariaLabel={`Reporter « ${ligne.titre} »`}
        className="rounded-km-md border border-km-line bg-km-surface p-2 shadow-km-pop"
      >
        <MenuReport
          echeance={ligne.date_prevue}
          onReporterPreset={(r) => { gestes.reporter(ligne.id, ligne.date_prevue, r); setReportOuvert(false) }}
          onReporterDate={(instant) => { gestes.reporterA(ligne.id, instant); setReportOuvert(false) }}
        />
      </PopoverAncre>
    </span>
  )
}

/** L'échéance, en rouge quand elle est dépassée. L'heure ne s'affiche que si elle existe. */
function Echeance({ ligne }: { ligne: LigneTache }) {
  const d = new Date(ligne.date_prevue)
  const enRetard = ligne.statut === 'EN_RETARD'
  return (
    <span className={cn('tabular-nums', enRetard ? 'font-semibold text-km-red' : 'text-km-muted')}>
      {d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
      {ligne.a_une_heure && (
        <span className={cn('ml-1.5', enRetard ? 'text-km-red/75' : 'text-km-faint')}>
          {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  )
}

function valeurTri(l: LigneTache, c: Colonne): string | number {
  switch (c) {
    case 'titre':   return l.titre?.toLowerCase() ?? ''
    case 'type':    return l.type_libelle?.toLowerCase() ?? ''
    /* Par LIBELLÉ du porteur, et non par son nom : trier cette colonne sert à regrouper les pistes
       ensemble, pas à ordonner les dossiers entre eux. */
    case 'porteur': return PORTEURS[l.porteur_type].libelle.toLowerCase()
    case 'date':    return new Date(l.date_prevue).getTime()
  }
}

function EnTeteColonne({
  colonne, libelle, tri, onTrier,
}: {
  colonne: Colonne; libelle: string
  tri: { colonne: Colonne; sens: Sens }
  onTrier: (c: Colonne) => void
}) {
  const actif = tri.colonne === colonne
  const Fleche = !actif ? ChevronsUpDown : tri.sens === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      role="columnheader"
      /* `aria-sort` EST LA MOITIÉ INVISIBLE DU TRI : la flèche dit à l'œil dans quel sens on est,
         cet attribut le dit au lecteur d'écran, à qui l'ordre de la liste échappait entièrement. */
      aria-sort={actif ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onTrier(colonne)}
      title={`Trier par ${libelle.toLowerCase()}`}
      className={cn(
        'group flex h-full items-center gap-1.5 truncate whitespace-nowrap px-3 text-km-tiny font-bold uppercase tracking-[.08em]',
        'transition-colors hover:text-km-text focus-visible:outline-none focus-visible:text-km-text',
        actif ? 'text-km-text' : 'text-km-faint',
      )}
    >
      {libelle}
      <Fleche className={cn('h-3 w-3 shrink-0 transition-opacity', actif ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} strokeWidth={2.6} />
    </button>
  )
}

export function TachesDuJour({
  lignes,
  charge,
  chargement,
}: {
  lignes: LigneTache[] | undefined
  charge: JourDeCharge[] | undefined
  chargement: boolean
}) {
  const [tri, setTri] = useState<{ colonne: Colonne; sens: Sens }>({ colonne: 'date', sens: 'asc' })
  /* Vide = aucune restriction, la convention des trois familles du menu. Voir `STATUTS`. */
  const [statuts, setStatuts] = useState<StatutTache[]>([])
  const [porteurs, setPorteurs] = useState<string[]>([])
  const [types, setTypes] = useState<string[]>([])

  /* LES TROIS GESTES — voir `Commandes`. Le crochet est appelé UNE FOIS pour tout le tableau et non
     par ligne : la fenêtre de rétractation est commune, et cocher trois tâches d'affilée doit
     produire trois lignes dans un même bandeau, pas trois bandeaux concurrents. */
  const gestes = useGestesTache()
  const [enEdition, setEnEdition] = useState<LigneTache | null>(null)

  const toutes = useMemo(() => lignes ?? [], [lignes])

  const trier = (c: Colonne) =>
    setTri((t) => (t.colonne === c ? { colonne: c, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { colonne: c, sens: 'asc' }))

  /* Les effectifs portent sur TOUTES les lignes, jamais sur le résultat filtré : un compteur qui
     tomberait à zéro en se décochant lui-même ne dirait plus rien. */
  const effectifs = useMemo(() => {
    const parStatut: Record<string, number> = {}
    const parPorteur: Record<string, number> = {}
    const parType: Record<string, number> = {}
    for (const l of toutes) {
      parStatut[l.statut] = (parStatut[l.statut] ?? 0) + 1
      parPorteur[l.porteur_type] = (parPorteur[l.porteur_type] ?? 0) + 1
      parType[l.type_code ?? 'AUTRE'] = (parType[l.type_code ?? 'AUTRE'] ?? 0) + 1
    }
    return { parStatut, parPorteur, parType }
  }, [toutes])

  /* LES OPTIONS SONT DÉDUITES DES DONNÉES, triées par effectif décroissant. `types_actions` compte
     vingt-trois entrées ; en lister vingt-trois dont vingt à zéro ferait un menu qu'il faut lire
     au lieu de parcourir. */
  /* LES TROIS STATUTS SONT UN ENSEMBLE CLOS, donc ils se listent en dur et dans l'ordre d'urgence
     — à la différence du porteur et du type, déduits des données et triés par effectif. Et ils
     restent listés MÊME À ZÉRO : « En retard : 0 » est une bonne nouvelle qui mérite d'être lue. */
  const choixStatut = useMemo(
    () => STATUTS.map((s) => ({ valeur: s.cle, libelle: s.libelle, nombre: effectifs.parStatut[s.cle] ?? 0 })),
    [effectifs],
  )

  const choixPorteur = useMemo(
    () => (Object.keys(effectifs.parPorteur) as PorteurTache[])
      .sort((a, b) => effectifs.parPorteur[b] - effectifs.parPorteur[a])
      .map((p) => ({ valeur: p, libelle: PORTEURS[p].libelle, nombre: effectifs.parPorteur[p] })),
    [effectifs],
  )
  const choixType = useMemo(() => {
    const libelles = new Map<string, string>()
    for (const l of toutes) libelles.set(l.type_code ?? 'AUTRE', l.type_libelle ?? 'Autre')
    return [...libelles.entries()]
      .sort((a, b) => effectifs.parType[b[0]] - effectifs.parType[a[0]])
      .map(([valeur, libelle]) => ({ valeur, libelle, nombre: effectifs.parType[valeur] }))
  }, [toutes, effectifs])

  const affichees = useMemo(() => {
    const facteur = tri.sens === 'asc' ? 1 : -1
    return toutes
      // Une liste vide ne filtre rien : c'est l'abandon de l'axe, pas un tableau à vider.
      .filter((l) => statuts.length === 0 || statuts.includes(l.statut))
      .filter((l) => porteurs.length === 0 || porteurs.includes(l.porteur_type))
      .filter((l) => types.length === 0 || types.includes(l.type_code ?? 'AUTRE'))
      .sort((a, b) => {
        const va = valeurTri(a, tri.colonne)
        const vb = valeurTri(b, tri.colonne)
        // À valeur égale, l'urgence puis le titre départagent : sans cela l'ordre de deux lignes
        // identiques changerait d'un rendu à l'autre.
        if (va === vb) {
          const r = RANG_STATUT[a.statut] - RANG_STATUT[b.statut]
          return r !== 0 ? r : a.titre.localeCompare(b.titre, 'fr')
        }
        return (typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'fr')) * facteur
      })
  }, [toutes, statuts, porteurs, types, tri])

  return (
    /* ══ DEUX TUILES DE LA GRILLE BENTO, PAS UN BLOC QUI EN CONTIENT DEUX ══
       Le tableau prend quatre colonnes sur six, la matrice les deux dernières. Elles sont des
       enfants DIRECTS de la grille de la page : les envelopper dans un conteneur à elles aurait
       rétabli une sous-grille, et leurs bords ne seraient plus tombés sur ceux du tableau des
       offres juste au-dessus.

       LA MATRICE N'A QUE LE TIERS DE LA PAGE, et c'est pour cela qu'elle est passée de quinze à
       dix jours le 11/09/2026 : à quinze, ses cases faisaient 65 px et demandaient un effort de
       lecture. Voir `MatriceCharge`. */
    <>
      {/* ══════ LE TABLEAU ══════ */}
      <div
        style={{ height: HAUTEUR_BLOC }}
        className={cn(TUILE, 'animate-km-card-rise flex min-w-0 flex-col overflow-hidden sm:col-span-2 lg:col-span-4')}
      >
        {/* UN SEUL BOUTON, TROIS FAMILLES DERRIÈRE. Voir l'en-tête : les statuts y ont rejoint le
            porteur et le type, ce qui laisse à la barre un décompte et un bouton. */}
        <BarreZone nombre={chargement ? null : affichees.length} unite="tâche">
          <MenuFiltres
            aligne="droite"
            groupes={[
              { cle: 'statut', etiquette: 'Statut', choix: choixStatut, valeurs: statuts, onChange: (v) => setStatuts(v as StatutTache[]) },
              { cle: 'porteur', etiquette: 'Porteur', choix: choixPorteur, valeurs: porteurs, onChange: setPorteurs },
              { cle: 'type', etiquette: 'Type', choix: choixType, valeurs: types, onChange: setTypes },
            ]}
          />
        </BarreZone>

        <div className="min-h-0 flex-1 overflow-auto">
          <div style={{ minWidth: LARGEUR_MINIMALE }}>
            <div
              className="sticky top-0 z-20 grid border-b border-km-line bg-km-bg/95 backdrop-blur-sm"
              style={{ gridTemplateColumns: GABARIT, height: HAUTEUR_ENTETE }}
            >
              {/* Les deux colonnes de gestes n'ont pas d'en-tête : rien à trier, rien à nommer. */}
              <span />
              {COLONNES.map((c) => (
                <EnTeteColonne key={c.cle} colonne={c.cle} libelle={c.libelle} tri={tri} onTrier={trier} />
              ))}
              <span />
            </div>

            {chargement ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 animate-pulse rounded-km bg-km-soft" />)}
              </div>
            ) : affichees.length === 0 ? (
              <p className="px-4 py-14 text-center text-km-body text-km-faint">
                {toutes.length === 0
                  ? 'Rien à faire aujourd’hui — aucune tâche en retard ni due ce jour.'
                  : 'Aucune tâche ne correspond à ces filtres.'}
              </p>
            ) : (
              affichees.map((l, i) => {
                const p = PORTEURS[l.porteur_type]
                const Icone = ICONE_TYPE[l.type_code ?? ''] ?? Circle
                /* LA LIGNE MÈNE AU DOSSIER, et retombe sur la tâche quand il n'y en a pas. Une
                   tâche sans porteur — il y en a une aujourd'hui — n'aurait sinon plus aucune
                   destination, et une ligne cliquable qui ne mène nulle part est pire qu'une ligne
                   inerte. */
                const vers = p.route && l.porteur_id ? `${p.route}/${l.porteur_id}` : `/taches/${l.id}`
                return (
                  <div
                    key={l.id}
                    style={{
                      gridTemplateColumns: GABARIT,
                      height: HAUTEUR_LIGNE,
                      animationDelay: `${Math.min(i, 10) * 22}ms`,
                      boxShadow: `inset 3px 0 0 0 ${RAIL_STATUT[l.statut]}`,
                    }}
                    className="animate-km-fade-slide relative grid items-center border-b border-km-line/60 transition-colors hover:bg-km-bg"
                  >
                    {/* LE LIEN ÉTENDU — voir `Commandes`. Il couvre la ligne entière, sous tout le
                        reste, ce qui garde un vrai `<a>` sans emboîter d'éléments interactifs.
                        LE NOM DU DOSSIER PASSE DANS SON INFOBULLE : il avait sa colonne, qui coûtait
                        170 px ; le clic le porte désormais, et le survol le nomme. */}
                    <Link
                      to={vers}
                      aria-label={l.porteur_nom ? `Ouvrir ${p.libelle} ${l.porteur_nom}` : `Ouvrir la tâche ${l.titre}`}
                      title={l.porteur_nom ? `${p.libelle} : ${l.porteur_nom}` : 'Ouvrir la tâche'}
                      className="absolute inset-0 z-0"
                    />

                    {/* COCHER TERMINE LA TÂCHE, avec cinq secondes pour se rétracter.

                        LA ZONE DE CLIC EST LA CELLULE ENTIÈRE — 38 × 46 px — et non la case de
                        17 px. C'est un `<label>` qui l'étend : viser une cible de 17 px dans une
                        ligne de tableau est un geste de précision, et le WCAG demande 24 px au
                        minimum. La case reste petite parce qu'une grosse case dans une ligne de
                        46 px déséquilibrerait la rangée ; c'est la CIBLE qui grandit, pas le
                        dessin. */}
                    <label
                      className="pointer-events-auto relative z-10 flex h-full w-full cursor-pointer items-center justify-center"
                      title={`Terminer « ${l.titre} »`}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={gestes.enCours}
                        onChange={() => gestes.cocher(l.id, l.titre)}
                        aria-label={`Terminer « ${l.titre} »`}
                        className="h-[17px] w-[17px] cursor-pointer accent-km-green disabled:cursor-wait"
                      />
                    </label>

                    {/* Les cellules de texte laissent passer le clic vers le lien étendu. */}
                    {/* LA PASTILLE DU CONTACT PRÉCÈDE L'INTITULÉ — voir `PastilleContact`. Et
                        l'intitulé complet reste dans l'infobulle : même élargie, la colonne finit
                        par tronquer les plus longs, et il faut pouvoir les lire sans ouvrir la
                        fiche. */}
                    <span className="flex min-w-0 items-center gap-2 px-3">
                      <PastilleContact id={l.contact_id} nom={l.contact_nom} />
                      <span
                        title={l.titre}
                        className="pointer-events-none min-w-0 truncate text-km-body font-medium text-km-text"
                      >
                        {l.titre}
                      </span>
                    </span>
                    <span className="pointer-events-none min-w-0 truncate px-3 text-km-body text-km-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Icone className="h-3.5 w-3.5 shrink-0 text-km-faint" strokeWidth={2.3} />
                        {l.type_libelle ?? '—'}
                      </span>
                    </span>
                    <span className="pointer-events-none px-3"><CartouchePorteur type={l.porteur_type} /></span>
                    <span className="pointer-events-none px-3 text-km-body"><Echeance ligne={l} /></span>

                    <Commandes ligne={l} gestes={gestes} onModifier={() => setEnEdition(l)} />
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ══ LES CINQ SECONDES POUR SE RÉTRACTER ══
            La ligne cochée disparaît du tableau à la seconde même — elle n'est plus « du jour ».
            Le bandeau vit donc EN PIED DE BLOC, à une place fixe : là où était la ligne, il n'y a
            plus rien, et une confirmation qu'il faudrait aller chercher dans une liste qui a bougé
            ne confirme rien. Même geste et même code que « Ma journée » — voir `useGestesTache`. */}
        {gestes.annulables.length > 0 && (
          <div className="shrink-0 space-y-1 border-t border-km-line bg-km-bg px-3 py-2">
            {gestes.annulables.map((a) => (
              <div
                key={`annulable-${a.id}`}
                className="animate-km-fade flex items-center gap-2 rounded-km-md border border-km-green-line bg-km-green-soft px-2.5 py-1"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-km-green" strokeWidth={2.6} />
                <p className="min-w-0 flex-1 truncate text-km-label text-km-text">
                  <span className="font-semibold">Terminée</span> · {a.titre}
                </p>
                <button
                  type="button"
                  onClick={() => gestes.annuler(a.id)}
                  className="flex shrink-0 items-center gap-1 rounded-km-sm px-1.5 py-0.5 text-km-tiny font-bold text-km-green transition-colors hover:bg-white"
                >
                  <Undo2 className="h-3 w-3" strokeWidth={2.6} />
                  Annuler
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ MODIFIER, DANS UNE FENÊTRE ══
          `PanneauEditionTache` pousse le contenu vers le bas là où il est né — le volet d'activité,
          large de 324 px. Une ligne de tableau haute de 46 px n'a pas cette place : le panneau y
          doublerait la hauteur de la ligne et décalerait tout ce qui suit. La fenêtre modale garde
          donc le tableau intact, et c'est le même composant d'édition qui la remplit. */}
      <Dialog
        open={enEdition !== null}
        onClose={() => setEnEdition(null)}
        title="Modifier la tâche"
        description="L’intitulé, l’échéance et le commentaire. Le reste se règle sur la fiche."
        className="max-w-md"
      >
        {enEdition && (
          <PanneauEditionTache
            action={{
              id: enEdition.id,
              titre: enEdition.titre,
              echeance: enEdition.date_prevue,
              commentaire: enEdition.commentaire,
            }}
            onFini={() => setEnEdition(null)}
            // Le liseré du haut sépare le panneau de la carte qui le porte ; dans une fenêtre qui a
            // déjà son titre et son trait, il ferait doublon.
            className="border-t-0 pt-0"
          />
        )}
      </Dialog>

      {/* ══════ LA MATRICE DE CHARGE ══════ */}
      <div className="min-w-0 sm:col-span-2 lg:col-span-2">
        <MatriceCharge jours={charge} chargement={chargement} hauteur={HAUTEUR_BLOC} />
      </div>
    </>
  )
}
