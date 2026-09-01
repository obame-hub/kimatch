import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader, Indicateurs } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { useMonProfil } from '@/lib/data/roles'
import { RESULTAT_VERSION_LIBELLE } from '@/lib/referenceFallbacks'
import { ListToolbar, BasculeOption, BasculeSegments } from '@/components/ui/list-toolbar'
import { MenuChoix } from '@/components/ui/menu-choix'
import { FiltrePeriode, PERIODE_VIDE, periodeActive, type Periode } from '@/components/ui/filtre-periode'
import { dateRelative, tonDate } from '@/lib/dateRelative'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useKanbanServeur } from '@/lib/useKanbanServeur'
import { useTriKanban, SelecteurTri, type OptionTri } from '@/lib/triKanban'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import { IconeEnergie } from '@/components/ui/icone-energie'
import { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

/** Le formulaire de création vit désormais dans son propre fichier, réécrit le 15/08/2026 en
 *  parcours à quatre étapes calqué sur l'OpportuniteWizard de Tools. Il reste réexporté ici :
 *  CompteDetail l'importe depuis cette page depuis l'origine. */
export { CreateRecommandationDialog } from '@/components/opportunite/CreationRecommandationWizard'

/** Une carte de la liste, telle que `v_recommandations_liste` la renvoie. */
interface LigneReco {
  id: string
  nom: string
  compte_id: string
  compte_nom: string | null
  etape: string
  conseiller: string
  priorite: number
  nb_versions: number
  /** Le statut de la DERNIÈRE version, et son résultat si elle est clôturée. */
  statut_version: string | null
  resultat_version: string | null
  numero_version: number | null
  /** La colonne du tableau, calculée par la vue — voir la migration 20260828130000. */
  colonne_travail: string
  /** L'axe « statut du dossier », clôture dépliée par sa finalité — migration 20260901160000. */
  statut_recommandation: string
  /** Un contrat de ce dossier attend sa signature — voir la migration 20260831190000. */
  en_contractualisation: boolean
  contrat_en_signature_id: string | null
  sites: { id: string; nom: string }[]
  /** Ajoutées à la vue le 26/08/2026 pour le bandeau de la page 6. */
  marge_nette: number | null
  montant: number | null
  /** L'énergie du dossier — elle portait l'emoji du nom jusqu'au 31/08/2026. */
  type_energie: string | null
  /** La `CloseDate` reprise de Salesforce : date réelle si le dossier est clos, prévue sinon. */
  date_cloture: string | null
  finalite_cloture: string | null
}

/**
 * LES COLONNES DU TABLEAU SONT L'ÉTAT DU TRAVAIL, PAS L'ÉTAPE DU DOSSIER.
 *
 * Michel, 28/08/2026 : « à la place de recommandation, il faut montrer version ». Et sa raison :
 * « consultation, offres reçues, présentées, en réalité ça ne nous apporte rien, puisque ces
 * informations je vais les voir sur la version ».
 *
 * Les cinq colonnes ci-dessous sont donc les cinq états réels d'un dossier en cours, et non les
 * paliers qu'il a franchis :
 *
 *   Brouillon        aucune version — rien n'a encore été étudié          199 dossiers
 *   En construction  on travaille dessus                                   19
 *   Disponible       le comparatif est prêt                                 6
 *   En décision      c'est chez le client                                  21
 *   À réactiver      la dernière version est morte, le dossier non         86
 *
 * LE MOT « RECOMMANDATIONS » RESTE DANS LE MENU, à sa demande : « on peut laisser le terme
 * recommandation pour ne pas les embrouiller ». Ce sont bien des dossiers qu'on liste — une ligne
 * par dossier — mais rangés selon l'état de leur dernière version.
 *
 * « À RÉACTIVER » SERA LA COLONNE LA PLUS CHARGÉE, et ce n'est pas une anomalie : 1 264 versions sont
 * expirées en base. C'est l'état réel du portefeuille, et le voir est précisément l'intérêt.
 */
const COLONNES_TRAVAIL = [
  { code: 'BROUILLON', libelle: 'Brouillon' },
  { code: 'EN_CONSTRUCTION', libelle: 'En construction' },
  { code: 'DISPONIBLE', libelle: 'Disponible' },
  { code: 'EN_DECISION', libelle: 'En décision' },
  /* ══ EN COURS DE CONTRACTUALISATION ══
     Michel, 31/08/2026 : « ajouter un onglet "En cours de contractualisation" dans les
     recommandations ; cet onglet doit regrouper les recommandations actives rattachées à un contrat
     en cours de signature ».

     UNE COLONNE PLUTÔT QU'UN ONGLET, et c'est le sens de sa phrase : « regrouper ». Les 10 dossiers
     concernés étaient éparpillés dans quatre colonnes — 4 en décision, 3 à réactiver, 2 disponible,
     1 en construction. Or un dossier dont le contrat est parti à la signature n'est plus « en
     décision » : il attend une signature. Le travail a changé de nature, et la colonne le dit.

     ELLE SE PLACE APRÈS « EN DÉCISION » parce que c'est l'ordre réel du travail : on construit, on
     présente, le client décide, on contractualise. La clôture reste la sortie. */
  { code: 'EN_CONTRACTUALISATION', libelle: 'En contractualisation' },
  { code: 'A_REACTIVER', libelle: 'À réactiver' },
] as const

/**
 * ══ LA SECONDE VUE : LE STATUT DU DOSSIER, CLÔTURE DÉPLIÉE ══
 *
 * Michel, 01/09/2026, deux demandes dans la même phrase : « il aimerait voir les différents types de
 * clôturé », et — de Naoëlle — « ce serait bien d'avoir deux vues kanban en mode toggle, une avec les
 * statuts de version comme actuellement et une avec les statuts de recommandation ».
 *
 * ELLE NE REMPLACE PAS LA PREMIÈRE, ELLE LA CROISE. Les deux axes existent tous les deux en base et
 * disent deux choses différentes :
 *
 *   AVANCEMENT (`colonne_travail`)     où en est le TRAVAIL — état de la dernière version
 *   STATUT     (`statut_recommandation`) où en est le DOSSIER — et, s'il est clos, comment
 *
 * Mesuré le 01/09/2026 : « Active » se répartit sur quatre colonnes d'avancement (22 en
 * construction, 19 en décision, 5 disponible, 5 en contractualisation). Aucune des deux vues ne se
 * déduit de l'autre, et c'est pour cela qu'il en faut deux.
 *
 * LES TROIS CLÔTURES SONT TROIS COLONNES, et c'est le cœur de sa demande. 856 acceptées, 311
 * refusées, 402 expirées : trois natures de fin qui n'appellent pas le même geste — on rappelle un
 * refus, on relance une expiration, on ne touche pas à une acceptation. Une seule colonne
 * « Clôturée » de 1 569 cartes les rendait indiscernables.
 *
 * DEUX COLONNES SONT VIDES AUJOURD'HUI, et elles restent. Mesuré le 01/09/2026 : aucun Brouillon
 * (les 1 703 dossiers ont tous au moins une version) et aucun clos sans finalité. Ce ne sont pas des
 * colonnes décoratives : rien n'oblige à renseigner la finalité en clôturant, et une recommandation
 * neuve naît Brouillon. Le jour où l'un ou l'autre arrive, il a une colonne où apparaître. Une
 * colonne vide qui garde la porte vaut mieux qu'un dossier introuvable.
 */
const COLONNES_STATUT = [
  { code: 'BROUILLON', libelle: 'Brouillon' },
  { code: 'ACTIVE', libelle: 'Active' },
  { code: 'A_REACTIVER', libelle: 'À réactiver' },
  { code: 'CLOTUREE_ACCEPTEE', libelle: 'Clôturée · acceptée' },
  { code: 'CLOTUREE_REFUSEE', libelle: 'Clôturée · refusée' },
  { code: 'CLOTUREE_EXPIREE', libelle: 'Clôturée · expirée' },
  { code: 'CLOTUREE', libelle: 'Clôturée · sans finalité' },
] as const

/** Le libellé d'un état d'avancement, pour l'écrire sur la carte quand la colonne ne le dit plus. */
const LIBELLE_TRAVAIL: Record<string, string> = {
  ...Object.fromEntries(COLONNES_TRAVAIL.map((c) => [c.code, c.libelle])),
  CLOTUREE: 'Clôturée',
}

/**
 * LE TRI, LES MÊMES OPTIONS DANS LES DEUX VUES.
 *
 * « Dans chaque vue y a un système de filtre et de tri sur tout ce qui est possible dans chaque
 * vue » (Naoëlle, 01/09/2026). Ces sept colonnes sont celles de la vue qui portent un ordre ayant un
 * sens métier. Les autres colonnes filtrables ne sont pas triables utilement : trier par énergie ou
 * par finalité grouperait des cartes que le FILTRE isole mieux.
 *
 * Le sens par défaut suit la lecture : un montant se lit du plus gros au plus petit, une échéance du
 * plus proche au plus lointain, un nom de A à Z.
 */
const OPTIONS_TRI: OptionTri[] = [
  { cle: 'marge_nette', libelle: 'marge', ascendant: false },
  /* LA DATE DE CLÔTURE, LA PLUS PROCHE D'ABORD. Sur un dossier ouvert, cette date est l'échéance
     PRÉVUE (le `CloseDate` de Salesforce) : la trier en croissant met en tête ce qui se décide
     bientôt. Sur un dossier clos, c'est la date réelle. Le tableau ordonne en `nullsFirst: false`,
     donc un dossier sans date descend — il n'a rien à dire sur cet axe. */
  { cle: 'date_cloture', libelle: 'date de clôture' },
  { cle: 'date_ouverture', libelle: 'date d\u2019ouverture', ascendant: false },
  { cle: 'date_creation', libelle: 'date de création', ascendant: false },
  { cle: 'montant', libelle: 'montant', ascendant: false },
  { cle: 'priorite', libelle: 'priorité', ascendant: false },
  { cle: 'compte_nom', libelle: 'compte' },
  { cle: 'nom', libelle: 'nom de la recommandation' },
]

/** Les choix du filtre « statut du dossier » — la même nomenclature que les colonnes de la vue B. */
const CHOIX_STATUT = [
  { valeur: '', libelle: 'Tous les statuts' },
  { valeur: 'BROUILLON', libelle: 'Brouillon', detail: 'aucune version étudiée' },
  { valeur: 'ACTIVE', libelle: 'Active', detail: 'une version vivante' },
  { valeur: 'A_REACTIVER', libelle: 'À réactiver', detail: 'dernière version morte' },
  { valeur: 'CLOTUREE_ACCEPTEE', libelle: 'Clôturée · acceptée', detail: 'clos sur un oui' },
  { valeur: 'CLOTUREE_REFUSEE', libelle: 'Clôturée · refusée', detail: 'clos sur un non' },
  { valeur: 'CLOTUREE_EXPIREE', libelle: 'Clôturée · expirée', detail: 'clos par le temps' },
  { valeur: 'CLOTUREE', libelle: 'Clôturée · sans finalité', detail: 'la finalité manque' },
]

/** Les choix du filtre « avancement » — la même nomenclature que les colonnes de la vue A. */
const CHOIX_TRAVAIL = [
  { valeur: '', libelle: 'Tout l\u2019avancement' },
  ...COLONNES_TRAVAIL.map((c) => ({ valeur: c.code, libelle: c.libelle })),
  { valeur: 'CLOTUREE', libelle: 'Clôturée' },
]

/**
 * L'ÉNERGIE — deux valeurs en base, et 1 493 dossiers sans énergie renseignée sur 1 703.
 *
 * Le filtre est proposé quand même : les 210 dossiers qui la portent sont ceux nés dans Kimatch, et
 * ce sont eux qu'on travaille. Mais aucun choix « non renseignée » n'est offert : filtrer sur
 * l'absence d'une donnée n'est pas un besoin commercial, c'est un sujet de qualité de données, et
 * l'écran qui s'en occupe est un autre.
 */
const CHOIX_ENERGIE = [
  { valeur: '', libelle: 'Toutes les énergies' },
  { valeur: 'ELECTRICITE', libelle: 'Électricité' },
  { valeur: 'GAZ', libelle: 'Gaz' },
]

type VueReco = 'avancement' | 'statut'

/**
 * LA VUE CHOISIE SURVIT AU RECHARGEMENT, comme le tri et le périmètre.
 *
 * Un commercial qui travaille ses clôtures ne veut pas rebasculer à chaque F5, et celui qui vit dans
 * la vue d'avancement ne doit jamais voir la seconde s'il ne l'a pas demandée.
 */
function useVueMemorisee(cle: string, defaut: VueReco) {
  const [vue, setVue] = useState<VueReco>(() => {
    try {
      const garde = localStorage.getItem(cle)
      return garde === 'statut' || garde === 'avancement' ? garde : defaut
    } catch {
      return defaut
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(cle, vue)
    } catch {
      /* tant pis : le choix vaudra pour la session */
    }
  }, [cle, vue])
  return [vue, setVue] as const
}

/**
 * SEULS LES OBJETS ACTIFS SONT AFFICHÉS. Michel, 25/08/2026 à 14 h 29 : « pour les recommandations,
 * n'afficher que les recommandations actives (non clôturées) » — et « pareil pour les opportunités
 * et les signaux ».
 *
 * Les colonnes terminales disparaissent donc du tableau. Ce que ça retire est massif et c'est le
 * but : 1 574 recommandations closes sur 1 707, qui noyaient les 133 vivantes.
 *
 * CE QUI RESTE ATTEIGNABLE : un dossier clos se lit toujours depuis la fiche de son compte, depuis
 * la recherche ⌘K, et par son lien direct. Il quitte le plan de travail, il ne disparaît pas.
 */
export default function Recommandations() {
  /**
   * CHAQUE CONSEILLER NE VOIT QUE LES RECOMMANDATIONS DE SES COMPTES. Michel, 25/08/2026, « là en
   * urgence » : « Matthieu veut regarder ses recommandations, mais il a les recommandations de tout
   * le monde ». Accordé par Naoëlle dans le même appel.
   *
   * LE FILTRE EST ICI PARCE QUE CETTE PAGE NE LIT PAS `fetchRecommandations`. J'avais d'abord filtré
   * cette fonction, qui sert les fiches et le tableau de bord — mais /recommandations, l'écran DONT
   * IL PARLE, lit la vue `v_recommandations_liste` par `useListeServeur`. Le filtre était donc partout
   * sauf à l'endroit du reproche. La colonne `compte_proprietaire_id` vient de la migration
   * 20260825120000, écrite pour ça.
   *
   * LES ADMINISTRATEURS VOIENT TOUT — sa phrase en posant la question, « à part toi, moi ». Tant que
   * le rôle n'est pas connu, on ne filtre pas : afficher trop brièvement est moins trompeur que de
   * montrer une liste vide qu'on prendrait pour « je n'ai rien à traiter ».
   */
  const { data: monProfil } = useMonProfil()

  /**
   * LE PERIMETRE EST DESORMAIS UN CHOIX, plus une consequence du role.
   *
   * Avant : `!estAdmin && monProfil?.id ? monProfil.id : null`. Un conseiller ne voyait QUE ses
   * dossiers sans aucun moyen d'en sortir — or « des fois des commerciaux partent en vacances et
   * les autres s'occupent de leurs dossiers » (Naoelle, 28/08/2026) —, et un administrateur voyait
   * TOUJOURS tout, sans moyen de se concentrer sur les siens.
   *
   * Maintenant : « Mes dossiers » par defaut pour tout le monde, administrateurs compris, et la
   * bascule « Tous » a cote. Le filtre part en base (useKanbanServeur), donc les colonnes et la
   * somme de marge suivent — sans quoi le bandeau annoncerait une marge que le tableau ne montre
   * pas.
   */
  const { perimetre, setPerimetre } = usePerimetre('recommandations')
  const filtreProprietaire = perimetre === 'moi' && monProfil?.id ? monProfil.id : null
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  // `?creer=1` ouvre ce formulaire depuis le menu « Créer » de la barre du haut.
  useOuvrirCreation(() => setShowCreate(true))

  /**
   * LA RECHERCHE SURVIT À LA LISTE. `useListeServeur` ne servait plus qu'à porter la saisie et le
   * total : le garder aurait lancé une requête paginée dont personne n'affiche le résultat. Un état
   * local suffit, et le total se lit sur la somme des colonnes — qui sont, elles, comptées en base.
   */
  const [recherche, setRecherche] = useState('')
  const [avecClos, setAvecClos] = useState(false)

  /**
   * LE TABLEAU EST SERVI PAR LA BASE, une requête par colonne.
   *
   * La liste de cette page est paginée côté serveur : construire le tableau à partir de la tranche
   * chargée ferait compter les cent lignes reçues au lieu des 648 réelles, et laisserait des colonnes
   * vides simplement parce que leur page n'a pas été demandée. Voir useKanbanServeur.
   *
   * Les huit étapes, terminales comprises : sur la page d'un objet, le tableau montre tout le
   * pipeline. La recherche et le filtre de propriétaire de la liste s'y appliquent — sans quoi les
   * deux vues montreraient deux populations différentes sous le même bandeau.
   */
  /* LES QUATRE AXES QUI ONT UN SENS SUR UN DOSSIER. « Marge » d'abord parce que c'est ce que
     Michel regarde, et decroissante : une marge se lit du plus gros au plus petit. */
  /* ══ LES DEUX VUES ══
     Le tri est mémorisé PAR VUE : on ne trie pas un tableau de clôtures comme un plan de charge.
     La clé de la première reste `recommandations` — c'est celle que les navigateurs portent déjà,
     la renommer aurait effacé le choix de chacun sans raison. */
  const [vue, setVue] = useVueMemorisee('kimatch-vue-recommandations', 'avancement')
  const triAvancement = useTriKanban('recommandations', OPTIONS_TRI)
  const triStatut = useTriKanban('recommandations-statut', OPTIONS_TRI)
  const { tri, ascendant, setTri, options: optionsTri } = vue === 'statut' ? triStatut : triAvancement
  const parStatut = vue === 'statut'

  /* ══ LES FILTRES ══
     CHAQUE VUE FILTRE SUR L'AXE DE L'AUTRE, et c'est ce qui les rend complémentaires plutôt que
     redondantes : dans la vue d'avancement on demande « montre-moi les acceptées », dans la vue des
     statuts « montre-moi ce qui est en décision ». Croiser les deux axes sans changer de vue, c'est
     exactement ce qu'un filtre sait faire et qu'une colonne ne sait pas.

     L'ÉNERGIE ET LA PÉRIODE VALENT DANS LES DEUX : ce sont des propriétés du dossier, pas d'un axe. */
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreTravail, setFiltreTravail] = useState('')
  const [filtreEnergie, setFiltreEnergie] = useState('')
  const [periode, setPeriode] = useState<Periode>(PERIODE_VIDE)

  /* CE QUI EST POSÉ, ET LE MOYEN DE TOUT RETIRER D'UN GESTE. Avec quatre commandes de filtrage, un
     tableau vide se diagnostique mal : on ne sait plus laquelle a tout coupé. Le bouton n'apparaît
     que s'il y a quelque chose à défaire — un bouton grisé en permanence est du bruit.
     LA CASE « INCLURE LES CLOSES » N'EN FAIT PAS PARTIE : elle AJOUTE une colonne, elle ne retire
     rien. La remettre à zéro en « effaçant les filtres » ferait disparaître des cartes au moment où
     l'on croit en libérer. */
  const filtresPoses =
    (parStatut ? filtreTravail : filtreStatut) !== '' || filtreEnergie !== '' || periodeActive(periode)
  const effacerFiltres = () => {
    setFiltreStatut('')
    setFiltreTravail('')
    setFiltreEnergie('')
    setPeriode(PERIODE_VIDE)
  }

  const tableau = useKanbanServeur<LigneReco>({
    vue: 'v_recommandations_liste',
    /* `colonne_travail` réunit en un champ l'état de la dernière version et, à défaut, celui du
       dossier ; `statut_recommandation` porte l'étape du dossier, clôture dépliée par sa finalité.
       Les deux sont calculés par la vue : les refaire ici risquerait de les faire autrement. */
    colonneStatut: parStatut ? 'statut_recommandation' : 'colonne_travail',
    /* VUE STATUT : LES SEPT COLONNES, TOUJOURS. La case « inclure les closes » ne s'y applique pas —
       les trois clôtures SONT le sujet de cette vue, les masquer la viderait de sa raison d'être.
       Elles sont placées après les colonnes vivantes, donc le travail en cours reste à gauche.
       VUE AVANCEMENT : les six états du travail, et les clos seulement si on les demande. Décoché,
       la page ne montre que ce qui reste à faire — 134 dossiers contre 1 569 clos. */
    colonnes: parStatut
      ? COLONNES_STATUT.map((c) => ({ code: c.code, libelle: c.libelle }))
      : [
          ...COLONNES_TRAVAIL.map((c) => ({ code: c.code, libelle: c.libelle })),
          ...(avecClos ? [{ code: 'CLOTUREE', libelle: 'Clôturée' }] : []),
        ],
    colonnesRecherche: ['nom', 'compte_nom', 'conseiller'],
    recherche,
    /* LES FILTRES DESCENDENT EN BASE. Ce tableau est paginé ET sommé par la base : filtrer à
       l'arrivée n'aurait touché que les cinquante cartes reçues, et le bandeau chiffré aurait
       continué de compter tout le monde.
       Le filtre de l'axe COURANT est neutralisé : dans la vue des statuts, filtrer sur un statut
       reviendrait à masquer six colonnes sur sept — c'est la colonne elle-même qui le fait déjà. */
    filtres: {
      compte_proprietaire_id: filtreProprietaire,
      statut_recommandation: parStatut ? null : filtreStatut || null,
      colonne_travail: parStatut ? filtreTravail || null : null,
      type_energie: filtreEnergie || null,
    },
    /* LA PÉRIODE DE CLÔTURE — « le moyen de sélectionner une date ». Sur un dossier ouvert cette
       date est prévue, sur un dossier clos elle est réelle : le même filtre sert donc à préparer
       (« les trois prochains mois ») et à faire les comptes (« l'année dernière »). */
    intervalles: { date_cloture: { min: periode.min, max: periode.max } },
    /**
     * LA MARGE SE SOMME EN BASE, colonne par colonne. Michel, PDF du 25/08/2026, page 6 : un bandeau
     * « Marge totale des recommandations » découpé en à envoyer, à présenter, décision attendue,
     * acceptées. La somme suit les mêmes filtres que les colonnes — recherche, propriétaire et
     * période comprises — sans quoi le bandeau démentirait le tableau juste en dessous.
     */
    colonneSomme: 'marge_nette',
    /* LE TRI PART EN BASE. Seules cinquante cartes par colonne sont chargées : trier à l'arrivée
       réordonnerait un échantillon, et la plus grosse marge resterait invisible parce que
       cinquante-et-unième. */
    ordre: { colonne: tri, ascendant },
    // Le tableau est la seule vue : il est toujours actif.
    actif: true,
  })

  /**
   * LE TOTAL EST LA SOMME DES COLONNES AFFICHÉES, et pas celle de toutes les recommandations.
   *
   * C'est voulu : quand « inclure les dossiers clos » est décoché, le bandeau doit annoncer la marge
   * du travail EN COURS. Un total qui inclurait les 1 573 dossiers clos écraserait les 199 355 € des
   * colonnes ouvertes et ne voudrait plus rien dire — on lirait l'historique de Kiwee, pas son
   * pipeline.
   */
  const colonnes = tableau.data ?? []
  const margeTotale = colonnes.reduce((t, c) => t + (c.somme ?? 0), 0)
  const nbDossiers = colonnes.reduce((n, c) => n + c.total, 0)
  const margeConnue = colonnes.some((c) => c.somme != null)

  const euros = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'

  /**
   * LES QUATRE MESURES SORTENT DES TOTAUX DÉJÀ CALCULÉS PAR LA BASE, colonne par colonne.
   *
   * C'est ce qui garantit qu'elles disent la même chose que le tableau juste en dessous. Les
   * recompter dans le navigateur sur les cartes chargées donnerait un autre chiffre : seules dix
   * cartes par colonne descendent, alors que le total, lui, compte tout.
   */
  const totalDe = (code: string) => colonnes.find((c) => c.code === code)?.total ?? 0
  /* CHAQUE VUE ANNONCE SES PROPRES MESURES. Reprendre les quatre de l'avancement dans la vue des
     statuts aurait affiché des zéros : « EN_CONSTRUCTION » n'y est pas une colonne, et un indicateur
     qui compte une colonne absente ne dit pas « aucun », il dit une contre-vérité. */
  const mesures = parStatut
    ? [
        { libelle: 'Actives', valeur: String(totalDe('ACTIVE')), precision: 'Dossiers vivants' },
        { libelle: 'À réactiver', valeur: String(totalDe('A_REACTIVER')), precision: 'En sommeil' },
        { libelle: 'Acceptées', valeur: String(totalDe('CLOTUREE_ACCEPTEE')), precision: 'Clos sur un oui' },
        { libelle: 'Refusées', valeur: String(totalDe('CLOTUREE_REFUSEE')), precision: 'Clos sur un non' },
        { libelle: 'Expirées', valeur: String(totalDe('CLOTUREE_EXPIREE')), precision: 'Clos par le temps' },
      ]
    : [
        { libelle: 'À traiter', valeur: String(nbDossiers), precision: 'Recommandations ouvertes' },
        { libelle: 'En construction', valeur: String(totalDe('EN_CONSTRUCTION')), precision: 'Versions en cours' },
        { libelle: 'En décision', valeur: String(totalDe('EN_DECISION')), precision: 'Client sollicité' },
        { libelle: 'À réactiver', valeur: String(totalDe('A_REACTIVER')), precision: 'En sommeil' },
      ]

  return (
    <div>
      <Topbar title="Recommandations" />
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Recommandations"
          /* LA MARGE TOTALE COLLÉE AU TITRE, comme sur sa maquette. C'est la somme des COLONNES
             AFFICHÉES : « inclure les dossiers clos » décoché, elle annonce la marge du travail en
             cours. Un total incluant les 1 573 dossiers clos écraserait les 199 355 € du pipeline et
             on lirait l'historique de Kiwee au lieu de son plan de charge. */
          badge={margeConnue ? euros(margeTotale) : undefined}
          badgeLibelle="Marge totale"
          description="Le véritable produit de KiWee — jamais figée, elle évolue par versions successives."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouvelle recommandation</Button>}
        />

        <Indicateurs mesures={mesures} />

        <ListToolbar
          query={recherche}
          onQueryChange={setRecherche}
          placeholder="Rechercher une recommandation, un compte…"
          count={nbDossiers}
          /* ══ LA LIGNE DES FILTRES ══
             Ligne du haut : ce qu'on regarde (périmètre, axe, ordre). Ligne du bas : ce qu'on en
             retire. Huit commandes sur une seule ligne passaient à la ligne au hasard de la largeur
             de la fenêtre, en coupant un groupe au milieu. */
          secondaryRow={
            <>
              <span className="mr-0.5 text-km-label font-semibold text-km-faint">Filtrer</span>

              {/* LE FILTRE DE L'AXE OPPOSÉ.
                  Vue Avancement : on filtre par statut de dossier, les trois clôtures comprises —
                  c'est là que « voir les différents types de clôturé » se joue sans quitter son plan
                  de charge. Vue Statut : on filtre par avancement, pour lire « les actives qui sont
                  en décision ». Un seul des deux est monté à la fois : l'autre porterait sur l'axe
                  des colonnes, où il ne ferait que masquer six colonnes sur sept. */}
              {parStatut ? (
                <MenuChoix
                  valeur={filtreTravail}
                  onChange={setFiltreTravail}
                  ariaLabel="Filtrer par avancement"
                  choix={CHOIX_TRAVAIL}
                />
              ) : (
                /* CHOISIR UNE CLÔTURE COCHE LA CASE DES CLOS. Sans ce lien, filtrer sur « acceptée »
                   afficherait un tableau vide — la colonne des clos n'étant pas montée par défaut —
                   et on croirait à une absence de données plutôt qu'à deux réglages qui se
                   contredisent. */
                <MenuChoix
                  valeur={filtreStatut}
                  onChange={(v) => {
                    setFiltreStatut(v)
                    if (v.startsWith('CLOTUREE')) setAvecClos(true)
                  }}
                  ariaLabel="Filtrer par statut de recommandation"
                  choix={CHOIX_STATUT}
                />
              )}

              <MenuChoix
                valeur={filtreEnergie}
                onChange={setFiltreEnergie}
                ariaLabel="Filtrer par énergie"
                choix={CHOIX_ENERGIE}
              />

              {/* LA PÉRIODE DE CLÔTURE — « il aimerait sélectionner la date » : deux champs et six
                  raccourcis, voir `FiltrePeriode`. La même commande sert à préparer (« les 3
                  prochains mois », sur les dates prévues) et à faire les comptes (« l'année
                  dernière », sur les dates réelles). */}
              <FiltrePeriode libelle="Clôture" valeur={periode} onChange={setPeriode} />

              {/* INCLURE LES DOSSIERS CLOS. Demandé par Naoëlle le 25/08/2026, après que j'aie
                  signalé la conséquence de la règle de Michel : un dossier clos ne se trouvait plus
                  par la recherche de cette page, et c'est le genre de chose qu'on découvre au mauvais
                  moment. Décoché par défaut — sa règle reste la règle, la case est l'exception.
                  ELLE DISPARAÎT DANS LA VUE DES STATUTS : les clôtures y sont trois colonnes
                  nommées, une case pour les masquer n'y aurait aucun sens. */}
              {!parStatut && (
                <BasculeOption
                  actif={avecClos}
                  onChange={setAvecClos}
                  libelle="Inclure les recommandations closes"
                />
              )}

              {filtresPoses && (
                <button
                  type="button"
                  onClick={effacerFiltres}
                  className="ml-auto text-km-label font-semibold text-km-muted underline decoration-km-line underline-offset-2 hover:text-km-text"
                >
                  Tout effacer
                </button>
              )}
            </>
          }
        >
          <BasculePerimetre
            valeur={perimetre}
            onChange={setPerimetre}
            libelleMien="Mes recommandations"
            libelleTous="Toutes les recommandations"
          />
          {/* ══ LA BASCULE DE VUE ══
              Naoëlle, 01/09/2026 : « deux vues kanban en mode toggle ». Elle est placée juste après
              le périmètre, avant les filtres : elle décide de ce que les filtres suivants pourront
              filtrer, donc elle se lit d'abord. */}
          <BasculeSegments
            valeur={vue}
            onChange={(v) => setVue(v as VueReco)}
            segments={[
              { valeur: 'avancement', libelle: 'Avancement' },
              { valeur: 'statut', libelle: 'Statut' },
            ]}
            ariaLabel="Choisir l'axe du tableau"
          />
          {/* LE TRI EST REVENU LE 28/08/2026 : « un système de tri et de filtre sur toutes les vues
              kanban ». Il avait été retiré trois jours plus tôt, avec le filtre par étape et la vue
              de liste. Ce qui gênait alors, c'était de trier des COLONNES — les étapes SONT les
              colonnes, elles ne se trient pas de l'extérieur. Trier les CARTES à l'intérieur d'une
              colonne est une autre affaire, et c'est celle-là qu'on demande. */}
          <SelecteurTri valeur={tri} onChange={setTri} options={optionsTri} />

        </ListToolbar>

        <TableauKanban
            /* LA MARGE PAR STATUT, EN PASTILLE DE COLONNE — règle n° 6 du dossier UX du 26/08 :
               « afficher la marge par statut près du titre de chaque colonne et la marge totale près
               du titre de page ». Le bandeau récapitulatif livré le matin même disparaît, et sa
               version est meilleure : le chiffre est là où on lit la colonne, au lieu d'un tableau
               au-dessus qu'il faut mettre en correspondance de tête. */
            colonnes={colonnes.map((c) => ({
              code: c.code,
              libelle: c.libelle,
              total: c.somme == null ? null : euros(c.somme),
            }))}
            cartes={Object.fromEntries(
              colonnes.map((c) => [
                c.code,
                c.lignes.map((r) => ({
                  id: r.id,
                  titre: r.nom,
                  icone: <IconeEnergie type={r.type_energie} />,
                  sousTitre: r.compte_nom ?? undefined,
                  /* LA MENTION PORTE LA MARGE, comme sur ses cartes. Le nombre de versions reprend
                     la place quand la marge n'est pas connue — c'est le cas de tout dossier né dans
                     Kimatch, dont aucun écran ne remplit encore les chiffres d'affaire. */
                  /* L'ÉTIQUETTE PORTE LA VERSION, ET SON RÉSULTAT QUAND ELLE EST CLOSE.
                     C'est ce qui distingue deux cartes de la même colonne : dans « À réactiver »,
                     une version expirée et une version refusée ne demandent pas le même appel.
                     Le numéro de version situe le dossier d'un coup d'œil — troisième tentative
                     n'est pas la première. */
                  /* DANS LA VUE DES STATUTS, L'ÉTIQUETTE PORTE L'AVANCEMENT. La colonne y dit le
                     statut du dossier ; sans cette mention, rien ne distinguerait une « Active » en
                     construction d'une « Active » déjà chez le client — l'information même qui
                     décide s'il y a quelque chose à faire aujourd'hui. */
                  nature: (() => {
                    const num = r.numero_version != null ? `V${r.numero_version}` : null
                    const fin = r.resultat_version
                      ? RESULTAT_VERSION_LIBELLE[r.resultat_version] ?? r.resultat_version
                      : null
                    if (parStatut) {
                      const av = LIBELLE_TRAVAIL[r.colonne_travail] ?? r.colonne_travail
                      return [av, num].filter(Boolean).join(' · ')
                    }
                    if (!num) return 'Aucune version'
                    return [num, fin].filter(Boolean).join(' · ')
                  })(),
                  mention:
                    r.marge_nette != null
                      ? euros(r.marge_nette)
                      : r.nb_versions > 1
                        ? `${r.nb_versions} versions`
                        : undefined,
                  /* LA DATE DE CLÔTURE SUR LA CARTE. Michel, 31/08/2026 : il la cherchait sur les
                     dossiers « À réactiver », où elle existe en base mais n'était affichée nulle
                     part. Elle passe en pied de carte avec le bon mot : « clôturée » sur un dossier
                     clos, « prévue » sinon — `CloseDate` est la date PRÉVUE tant que l'opportunité
                     est ouverte, et 126 des nôtres le sont encore dans l'org.

                     LE MOT SUIT L'ÉTAPE, PAS LA FINALITÉ, depuis le 01/09/2026. Il testait
                     `finalite_cloture` : or 23 dossiers ACTIFS en portent une, héritée d'une clôture
                     précédente avant leur réouverture. La carte écrivait donc « Clôturée le
                     31/10/2028 » sur un dossier vivant dont l'échéance est à venir. Une finalité dit
                     comment un dossier s'est terminé UNE FOIS ; seule l'étape dit s'il est terminé
                     MAINTENANT. */
                  /* LA DISTANCE EN INTERLIGNE — « qu'on mette des dates relatives en interligne »
                     (Michel, 01/09/2026). Il lisait « Clôture prévue 21/04/2026 » et devait compter
                     de tête pour savoir si c'était demain ou dans un an. La date exacte reste, la
                     distance s'ajoute en dessous : l'une sert à préparer, l'autre à décider.
                     ELLE SE COLORE quand elle est passée ou proche, et RIEN sur un dossier clos :
                     « il y a huit mois » sur une acceptation n'est pas une alerte, c'est de
                     l'histoire — la peindre en ambre aurait crié au loup 856 fois. */
                  chiffres: r.date_cloture
                    ? [{
                        libelle: r.etape === 'CLOTUREE' ? 'Clôturée le' : 'Clôture prévue',
                        valeur: new Date(r.date_cloture).toLocaleDateString('fr-FR'),
                        precision: dateRelative(r.date_cloture) ?? undefined,
                        ton:
                          r.etape === 'CLOTUREE'
                            ? ('neutre' as const)
                            : tonDate(r.date_cloture) === 'passe'
                              ? ('passe' as const)
                              : tonDate(r.date_cloture) === 'proche'
                                ? ('proche' as const)
                                : ('neutre' as const),
                      }]
                    : undefined,
                  to: `/recommandations/${r.id}`,
                })),
              ]),
            )}
            /* LE TOTAL VIENT DE LA BASE, pas du nombre de cartes reçues : dix par colonne sont
               demandées, et une colonne peut en compter six cents. */
            totaux={Object.fromEntries(colonnes.map((c) => [c.code, c.total]))}
            /* UN VIDE QUI DIT CE QU'IL FAUT DÉFAIRE. Avec cinq commandes dans la barre, « aucune
               recommandation » laisse chercher laquelle a tout coupé — et la période est la plus
               facile à oublier, puisqu'elle se referme après usage. */
            siVide={
              tableau.isLoading
                ? 'Chargement…'
                : periodeActive(periode)
                  ? 'Aucune recommandation dans cette période de clôture.'
                  : 'Aucune recommandation ne correspond.'
            }
          />
      </div>
      {showCreate && (
        <CreateRecommandationDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(recoId) => navigate(`/recommandations/${recoId}`)}
        />
      )}
    </div>
  )
}
