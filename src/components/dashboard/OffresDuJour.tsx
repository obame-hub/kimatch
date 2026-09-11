import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronsUpDown, Flame, Zap, RotateCcw } from 'lucide-react'
import { TUILE } from '@/components/dashboard/TuilesDuJour'
import type { LigneOffre, SectionOffre } from '@/lib/data/offresDuJour'
import { eurosOu } from '@/lib/euros'
import { cn } from '@/lib/utils'

/**
 * ══ LES OFFRES DU JOUR ══
 *
 * Un tableau des études à traiter aujourd'hui, piloté par trois cartes de statut posées à sa
 * gauche.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * LES TROIS STATUTS DEVIENNENT TROIS CARTES, ET CE N'EST PAS QU'UN DÉPLACEMENT
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 11/09/2026 : « 3 carrés à gauche du tableau l'un en dessous de l'autre — En retard /
 * À recevoir / À envoyer, et le nombre. Lors du clic, le tableau à droite actualise sa donnée
 * pour n'afficher que les enregistrements en question. »
 *
 * ── CE QUE LES PASTILLES NE SAVAIENT PAS FAIRE ──
 *
 * Les trois filtres vivaient dans la barre de titre, en pastilles de 26 px de haut portant un
 * libellé et un décompte en 11 px. Deux défauts :
 *
 *   LE NOMBRE ÉTAIT ILLISIBLE DE LOIN. « 3 en retard » est l'information la plus importante de la
 *   zone, et elle était écrite dans le plus petit corps de la page. En carte, le chiffre passe à
 *   28 px : on le lit avant d'avoir lu son libellé.
 *
 *   ELLES OCCUPAIENT LA BARRE. Environ 300 px pris sur le tableau, pour des réglages dont on se
 *   sert une fois par consultation. Ces pixels repartent dans les colonnes.
 *
 * ── UN SEUL STATUT À LA FOIS, ET C'EST LITTÉRALEMENT LA DEMANDE ──
 *
 * « n'afficher que les enregistrements en question ». Cliquer une carte ISOLE son statut ; la
 * recliquer, ou cliquer « Tout afficher », revient à la liste entière. C'est plus direct que les
 * anciennes pastilles, où voir un seul statut demandait d'en décocher deux.
 *
 * ── UNE CARTE À ZÉRO RESTE À L'ÉCRAN, ET RESTE CLIQUABLE ──
 *
 * William, 11/09/2026 : « oui la carte à zéro on la laisse ». C'est le bon arbitrage — « En
 * retard : 0 » est une bonne nouvelle, et une bonne nouvelle qui disparaît n'est pas lue.
 *
 * ELLE RESTE CLIQUABLE, ET C'EST UN CORRECTIF. Première version : la carte vide était désactivée,
 * au motif qu'un bouton qui ne montre rien ne sert à rien. C'était faux — et surtout, cela rendait
 * INATTEIGNABLE la phrase que William avait demandée le même jour : « si on n'est pas censé
 * envoyer d'offres aujourd'hui, le bloc est remplacé par une phrase ». Cette phrase s'affiche
 * quand on isole « À envoyer » ; avec une carte désactivée, on ne pouvait jamais l'isoler.
 *
 * Le clic sur une carte vide ne montre donc pas « 0 résultat », il montre une PHRASE qui dit
 * pourquoi c'est vide et quoi faire à la place. Seule la teinte au repos est atténuée — le chiffre
 * passe en gris — pour qu'on voie d'un coup d'œil qu'il n'y a rien derrière.
 *
 * ── L'ORDRE DES TROIS EST CELUI DE LA CHAÎNE, PAS DE L'URGENCE ──
 *
 * En retard → À recevoir → À envoyer, l'ordre donné par William. C'est le trajet d'une étude :
 * ce qui a dépassé la date promise, ce que le pricing me doit, ce que je dois au client. Le tri
 * par défaut du tableau suit le même ordre, sans quoi les cartes et les lignes raconteraient deux
 * histoires différentes.
 *
 * `EN_ATTENTE` s'affiche « À recevoir » : le code de la base ne bouge pas, seul le mot change.
 * « En attente » ne disait ni de QUI on attend — le pricing — ni que c'est lui qui doit rendre.
 */

/**
 * ══ LA HAUTEUR SE CALCULE, ELLE NE SE CHOISIT PAS ══
 *
 * William, 10/09/2026 : « fais en sorte que le tableau affiche au max 4 recommandations. S'il y en
 * a plus, on pourra toujours scroll à l'intérieur. » Une valeur ronde posée à l'œil coupe la
 * cinquième ligne en deux, ce qui est pire que de la masquer : on croit avoir tout vu.
 */
const HAUTEUR_BARRE = 44
const HAUTEUR_ENTETE = 34
const HAUTEUR_LIGNE = 46
const LIGNES_VISIBLES = 4
export const HAUTEUR_OFFRES = HAUTEUR_BARRE + HAUTEUR_ENTETE + LIGNES_VISIBLES * HAUTEUR_LIGNE

/* `statut` reste dans l'union bien qu'il n'ait plus de colonne : c'est le TRI PAR DÉFAUT, et un
   tri n'a pas besoin d'un en-tête pour exister. Voir `COLONNES`. */
type Colonne = 'nom' | 'type' | 'version' | 'montant' | 'contact' | 'compte' | 'statut'
type Sens = 'asc' | 'desc'

/**
 * ══ SIX COLONNES : « STATUT » A ÉTÉ RETIRÉE ══
 *
 * William, 11/09/2026 : « la colonne statut dans le tableau des offres peut désormais être
 * masquée ». Le « désormais » est le mot juste — la colonne n'était pas de trop en soi, elle l'est
 * devenue le jour où les trois cartes de statut sont apparues à gauche du tableau.
 *
 * DEUX RAISONS, ET LA SECONDE EST LA PLUS FORTE :
 *
 *   FILTRÉE, LA COLONNE NE DIT PLUS RIEN. Quand on isole « En retard », les quatre lignes
 *   affichent quatre fois « En retard ». 122 px pour répéter ce que la carte allumée à gauche
 *   annonce déjà en 28 px de haut.
 *
 *   NON FILTRÉE, L'INFORMATION EXISTE AILLEURS. Le liseré de couleur en tête de ligne la porte,
 *   au même endroit et sans largeur — voir `RAIL_STATUT`. Et les lignes restent groupées par
 *   statut par défaut : les rouges, puis les ambres, puis les vertes. On voit les trois blocs
 *   avant de lire une seule ligne.
 *
 * Les 122 px rendus partent dans les noms de recommandation et de compte, qui se tronquaient.
 *
 * « COMPTE », ELLE, EST DE RETOUR. Supprimée un temps faute de place — les sept colonnes
 * réclamaient 1 040 px pour 910 disponibles — elle revient avec la pleine largeur du bento.
 */
const COLONNES: { cle: Colonne; libelle: string; largeur: string; aDroite?: boolean }[] = [
  { cle: 'nom',     libelle: 'Recommandation', largeur: 'minmax(240px,2.5fr)' },
  { cle: 'type',    libelle: 'Type',           largeur: 'minmax(118px,.8fr)' },
  { cle: 'version', libelle: 'Version',        largeur: 'minmax(76px,.4fr)' },
  { cle: 'montant', libelle: 'Montant estimé', largeur: 'minmax(132px,.9fr)', aDroite: true },
  { cle: 'contact', libelle: 'Contact',        largeur: 'minmax(170px,1.2fr)' },
  { cle: 'compte',  libelle: 'Compte',         largeur: 'minmax(165px,1.2fr)' },
]

/* Une seule définition de gabarit pour l'en-tête ET les lignes : deux listes de largeurs finiraient
   décalées d'une colonne à la première modification. */
const GABARIT = COLONNES.map((c) => c.largeur).join(' ')
const LARGEUR_MINIMALE = 240 + 118 + 76 + 132 + 170 + 165

/**
 * Les trois statuts, dans l'ordre de la chaîne de production — voir l'en-tête.
 *
 * `vide` EST UNE PHRASE, PAS UN « 0 RÉSULTAT ». William, 11/09/2026, pour « À envoyer » : « si on
 * n'est pas censé envoyer d'offres aujourd'hui, le bloc est remplacé par une phrase : aucune offre
 * à envoyer aujourd'hui, profites-en pour prospecter et mettre à jour ta data ;) ». Chaque statut
 * a donc la sienne — un tableau vide sans explication se lit comme une panne, et « 0 résultat »
 * n'apprend rien qu'on ne sache déjà en regardant la carte.
 */
const STATUTS: {
  cle: SectionOffre
  libelle: string
  /** Ce qu'on écrit après le décompte, dans la barre : « 3 études en retard ». */
  contexte: string
  /** L'encre de la carte allumée, de son ombre teintée, et du liseré de ligne. */
  encre: string
  vide: string
}[] = [
  {
    cle: 'EN_RETARD', libelle: 'En retard', contexte: 'en retard',
    encre: '#B85145',
    vide: 'Aucun retard. Tout ce qui était promis est parti à l’heure.',
  },
  {
    cle: 'EN_ATTENTE', libelle: 'À recevoir', contexte: 'à recevoir du pricing',
    encre: '#A06B19',
    vide: 'Rien à attendre du pricing aujourd’hui — aucune étude n’est en construction pour ce jour.',
  },
  {
    cle: 'A_ENVOYER', libelle: 'À envoyer', contexte: 'à envoyer au client',
    encre: '#0D7A5F',
    vide: 'Aucune offre à envoyer aujourd’hui, profites-en pour prospecter et mettre à jour ta data ;)',
  },
]

const RANG_STATUT: Record<SectionOffre, number> = { EN_RETARD: 0, EN_ATTENTE: 1, A_ENVOYER: 2 }

/**
 * ══ LE LISERÉ DE TÊTE DE LIGNE PORTE LE STATUT ══
 *
 * Depuis que la colonne « Statut » a été retirée, ces trois pixels sont le seul endroit où le
 * statut d'une ligne se lit. Ils le font mieux que la colonne : au BORD GAUCHE, donc au point où
 * l'œil entre dans la ligne, et sans consommer de largeur.
 *
 * ── IL EST PERMANENT, PLUS SEULEMENT AU SURVOL ──
 *
 * Il n'apparaissait qu'au survol, quand la colonne disait le statut en permanence. L'inverse
 * maintenant : il est toujours là, et c'est le FOND de la ligne qui change au survol.
 *
 * ── ET LES TROIS CARTES SONT SA LÉGENDE ──
 *
 * Rouge, ambre, vert, dans cet ordre, à trente pixels à gauche du tableau : les cartes de statut
 * sont exactement la légende de ces liserés, sans qu'on ait eu à en écrire une. C'est ce qui rend
 * le code couleur lisible sans apprentissage.
 *
 * LE STATUT RESTE DIT EN TOUTES LETTRES dans l'infobulle et dans le nom accessible de la ligne :
 * une information portée par la seule couleur n'existe pas pour qui ne la distingue pas.
 */
const RAIL_STATUT: Record<SectionOffre, string> = {
  EN_RETARD:  'rgb(var(--km-red))',
  EN_ATTENTE: 'rgb(var(--km-amber))',
  A_ENVOYER:  'rgb(var(--km-green))',
}

/** La cartouche d'énergie, reprise telle quelle de la fiche recommandation. */
function CartoucheEnergie({ type }: { type: string | null }) {
  if (!type) return <span className="text-km-faint">—</span>
  const gaz = type.toUpperCase().startsWith('GAZ')
  const Icone = gaz ? Flame : Zap
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-km px-2 py-[3px] text-km-label font-semibold',
      gaz ? 'bg-km-amber-soft text-km-amber' : 'bg-km-blue-soft text-km-blue',
    )}>
      <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.3} />
      {gaz ? 'Gaz' : 'Électricité'}
    </span>
  )
}

/** Une cartouche cliquable vers une autre fiche — un vrai lien, pour le clic droit et le ⌘ + clic. */
function CartoucheLien({ to, libelle }: { to: string | null; libelle: string | null }) {
  if (!to || !libelle) return <span className="text-km-faint">—</span>
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className="relative z-10 inline-flex max-w-full items-center truncate rounded-km bg-km-soft px-2 py-[3px] text-km-label font-medium text-km-text transition-colors hover:bg-km-line"
    >
      {libelle}
    </Link>
  )
}

function valeurTri(l: LigneOffre, c: Colonne): string | number {
  switch (c) {
    case 'nom':     return l.nom?.toLowerCase() ?? ''
    case 'type':    return l.type_energie?.toLowerCase() ?? ''
    case 'version': return l.numero_version ?? -1
    // Un montant absent part en bas dans les deux sens : il n'est ni le plus gros ni le plus petit,
    // il n'est pas connu. Le traiter comme zéro le ferait remonter en tête d'un tri croissant.
    case 'montant': return l.montant_estime ?? Number.NEGATIVE_INFINITY
    case 'contact': return l.contact_nom?.toLowerCase() ?? ''
    case 'compte':  return l.compte_nom?.toLowerCase() ?? ''
    case 'statut':  return RANG_STATUT[l.section]
  }
}

function EnTeteColonne({
  colonne, libelle, aDroite, tri, onTrier,
}: {
  colonne: Colonne; libelle: string; aDroite?: boolean
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
        'transition-colors hover:text-km-text focus-visible:text-km-text focus-visible:outline-none',
        actif ? 'text-km-text' : 'text-km-faint',
        aDroite && 'justify-end',
      )}
    >
      {libelle}
      <Fleche className={cn('h-3 w-3 shrink-0 transition-opacity', actif ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} strokeWidth={2.6} />
    </button>
  )
}

/**
 * Une des trois cartes de statut.
 *
 * ── LE CHIFFRE EST LE SUJET, LE LIBELLÉ EST LA LÉGENDE ──
 *
 * 28 px contre 11. Vu de loin on lit « 3 » en rouge avant de lire « En retard » — et c'est bien
 * l'ordre dans lequel l'information sert le matin.
 *
 * ── ALLUMÉE, ELLE SE REMPLIT ; ÉTEINTE, ELLE GARDE SA TEINTE ──
 *
 * Le remplissage dit l'ÉTAT (ce filtre est actif), la teinte dit DE QUOI on parle. Deux signaux
 * sur deux canaux : on ne confond pas « ce filtre est actif » avec « ces dossiers sont en retard ».
 */
function CarteStatut({
  statut, nombre, actif, onBasculer,
}: {
  statut: typeof STATUTS[number]
  nombre: number
  actif: boolean
  onBasculer: () => void
}) {
  const vide = nombre === 0

  return (
    <button
      type="button"
      onClick={onBasculer}
      aria-pressed={actif}
      title={actif
        ? 'Revenir à toutes les études'
        : vide
          ? `Aucune étude « ${statut.libelle} » aujourd’hui — cliquer pour le lire en clair`
          : `N’afficher que « ${statut.libelle} »`}
      style={actif ? { background: statut.encre, boxShadow: `0 10px 24px -12px ${statut.encre}` } : undefined}
      className={cn(
        'flex min-w-0 cursor-pointer flex-col justify-center rounded-[18px] border px-4 py-3 text-left',
        'transition-[transform,box-shadow,background-color,border-color] duration-200',
        'hover:translate-x-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45',
        actif
          ? 'border-transparent'
          : cn('border-km-line hover:border-km-line-soft hover:shadow-kw-card-open',
               vide ? 'bg-km-bg' : 'bg-km-surface'),
      )}
    >
      <span
        className={cn('text-[28px] font-bold leading-none tracking-[-.04em] tabular-nums',
          actif ? 'text-white' : vide && 'text-km-faint')}
        style={!actif && !vide ? { color: statut.encre } : undefined}
      >
        {nombre}
      </span>
      <span className={cn('mt-1 truncate text-km-label font-semibold',
        actif ? 'text-white/85' : vide ? 'text-km-faint' : 'text-km-muted')}>
        {statut.libelle}
      </span>
    </button>
  )
}

export function OffresDuJour({
  lignes,
  chargement,
}: {
  lignes: LigneOffre[] | undefined
  chargement: boolean
}) {
  const [tri, setTri] = useState<{ colonne: Colonne; sens: Sens }>({ colonne: 'statut', sens: 'asc' })
  /* `null` = toutes. Un seul statut à la fois — voir l'en-tête : c'est la demande, littéralement. */
  const [isole, setIsole] = useState<SectionOffre | null>(null)

  const trier = (c: Colonne) =>
    setTri((t) => (t.colonne === c ? { colonne: c, sens: t.sens === 'asc' ? 'desc' : 'asc' } : { colonne: c, sens: 'asc' }))

  const toutes = useMemo(() => lignes ?? [], [lignes])

  /* Les compteurs des cartes portent sur TOUTES les lignes, jamais sur le résultat filtré : un
     compteur qui tomberait à zéro en se sélectionnant lui-même ne dirait plus rien. */
  const parStatut = useMemo(() => {
    const c: Record<SectionOffre, number> = { EN_RETARD: 0, A_ENVOYER: 0, EN_ATTENTE: 0 }
    for (const l of toutes) c[l.section] += 1
    return c
  }, [toutes])

  const affichees = useMemo(() => {
    const facteur = tri.sens === 'asc' ? 1 : -1
    return toutes
      .filter((l) => isole === null || l.section === isole)
      .sort((a, b) => {
        const va = valeurTri(a, tri.colonne)
        const vb = valeurTri(b, tri.colonne)
        // À valeur égale, le nom départage : sans cela l'ordre de deux lignes identiques
        // changerait d'un rendu à l'autre, et la liste « bougerait » sans raison visible.
        if (va === vb) return a.nom.localeCompare(b.nom, 'fr')
        return (typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'fr')) * facteur
      })
  }, [toutes, isole, tri])

  const statutIsole = isole ? STATUTS.find((s) => s.cle === isole)! : null

  return (
    <div
      className="grid gap-2.5 lg:grid-cols-[176px_minmax(0,1fr)]"
      style={{ minHeight: HAUTEUR_OFFRES }}
    >
      {/* ══════ LES TROIS CARTES DE STATUT ══════
          Trois rangées égales qui se partagent exactement la hauteur du tableau : les bords du
          haut et du bas tombent au pixel sur ceux de la barre de titre et de la dernière ligne.
          En dessous de `lg`, elles repassent côte à côte — trois cartes empilées au-dessus d'un
          tableau sur un portable mangeraient tout l'écran. */}
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-1 lg:grid-rows-3">
        {STATUTS.map((s) => (
          <CarteStatut
            key={s.cle}
            statut={s}
            nombre={parStatut[s.cle]}
            actif={isole === s.cle}
            onBasculer={() => setIsole((actuel) => (actuel === s.cle ? null : s.cle))}
          />
        ))}
      </div>

      {/* ══════ LE TABLEAU ══════ */}
      <div className={cn(TUILE, 'animate-km-card-rise flex min-w-0 flex-col overflow-hidden')} style={{ height: HAUTEUR_OFFRES }}>
        <div
          className="flex shrink-0 items-center gap-2.5 border-b border-km-line px-4"
          style={{ height: HAUTEUR_BARRE }}
        >
          {/* PLUS DE TITRE ICI — il est monté sur la bande de la zone. L'écrire aux deux endroits
              le répétait à quarante pixels d'écart. La barre ne garde que ce qui BOUGE : le
              décompte, qui suit le filtre, et la sortie du filtre.

              LA LIGNE DE CONTEXTE NE DIT PAS SEULEMENT COMBIEN, ELLE DIT QUOI — « 3 études en
              retard » plutôt qu'un « 3 » qui obligerait à regarder ailleurs pour savoir de quoi
              il s'agit. */}
          <p className="min-w-0 truncate text-km-body font-medium text-km-text">
            {chargement
              ? '—'
              : `${affichees.length} étude${affichees.length > 1 ? 's' : ''}${statutIsole ? ` ${statutIsole.contexte}` : ''}`}
          </p>

          {/* LA SORTIE DU FILTRE N'APPARAÎT QUE QUAND IL Y EN A UN. Recliquer la carte active
              fonctionne aussi, mais rien ne l'annonce — ce bouton, si. */}
          {isole !== null && (
            <button
              type="button"
              onClick={() => setIsole(null)}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-km-green-soft px-2.5 py-1 text-km-label font-semibold text-km-green transition-colors hover:bg-km-green/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green/45"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={2.6} />
              Tout afficher · {toutes.length}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div style={{ minWidth: LARGEUR_MINIMALE }}>
            {/* L'EN-TÊTE RESTE COLLÉ : sans lui on perd le nom des colonnes dès la troisième ligne. */}
            <div
              role="row"
              className="sticky top-0 z-20 grid border-b border-km-line bg-km-bg/95 backdrop-blur-sm"
              style={{ gridTemplateColumns: GABARIT, height: HAUTEUR_ENTETE }}
            >
              {COLONNES.map((c) => (
                <EnTeteColonne key={c.cle} colonne={c.cle} libelle={c.libelle} aDroite={c.aDroite} tri={tri} onTrier={trier} />
              ))}
            </div>

            {chargement ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-km bg-km-soft" />)}
              </div>
            ) : affichees.length === 0 ? (
              /* ══ LE VIDE SE DIT AVEC DES MOTS, PAS AVEC « 0 RÉSULTAT » ══
                 William, 11/09/2026 : « si on n'est pas censé envoyer d'offres aujourd'hui, le
                 bloc est remplacé par une phrase ». Chaque statut a la sienne, et celle du statut
                 filtré passe avant la générale : dire « aucune offre à envoyer » quand on vient de
                 cliquer « À envoyer » est une réponse ; dire « rien à traiter » en serait une à
                 côté de la question. */
              <p className="mx-auto max-w-[46ch] px-6 py-12 text-center text-km-lead text-km-muted">
                {statutIsole
                  ? statutIsole.vide
                  : 'Aucune étude à traiter aujourd’hui, profites-en pour prospecter et mettre à jour ta data ;)'}
              </p>
            ) : (
              affichees.map((l, i) => {
                const s = STATUTS.find((x) => x.cle === l.section)!
                return (
                <Link
                  key={l.recommandation_id}
                  to={`/recommandations/${l.recommandation_id}`}
                  title={`${l.nom} — ${s.libelle}`}
                  aria-label={`${l.nom}, ${s.libelle}`}
                  style={{
                    gridTemplateColumns: GABARIT,
                    height: HAUTEUR_LIGNE,
                    animationDelay: `${Math.min(i, 10) * 22}ms`,
                    boxShadow: `inset 3px 0 0 0 ${RAIL_STATUT[l.section]}`,
                  }}
                  className="animate-km-fade-slide relative grid items-center border-b border-km-line/55 transition-colors last:border-b-0 hover:bg-km-bg focus-visible:bg-km-bg focus-visible:outline-none"
                >
                  {/* `pl-4` ET NON `px-3` : le liseré occupe les trois premiers pixels, et un nom
                      collé dessus se lirait comme s'il en débordait. */}
                  <span className="truncate py-3 pl-4 pr-3 text-km-body font-medium text-km-text">{l.nom}</span>
                  <span className="px-3"><CartoucheEnergie type={l.type_energie} /></span>
                  <span className="px-3">
                    <span className="inline-flex items-center rounded-km bg-km-soft px-1.5 py-[3px] text-km-label font-bold tabular-nums text-km-muted">
                      V{l.numero_version ?? '—'}
                    </span>
                  </span>
                  {/* LE MONTANT EST À DROITE ET EN CHASSE FIXE : c'est ce qui met les virgules les
                      unes sous les autres et permet de comparer deux lignes sans les lire. */}
                  <span className="px-3 text-right font-mono text-km-body tabular-nums text-km-text">
                    {eurosOu(l.montant_estime)}
                  </span>
                  <span className="min-w-0 px-3">
                    <CartoucheLien to={l.contact_id ? `/contacts/${l.contact_id}` : null} libelle={l.contact_nom} />
                  </span>
                  <span className="min-w-0 px-3">
                    <CartoucheLien to={l.compte_id ? `/comptes/${l.compte_id}` : null} libelle={l.compte_nom} />
                  </span>
                </Link>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
