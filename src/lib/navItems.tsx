import {
  Gauge,
  Home,
  Building2,
  MapPin,
  User,
  Target,
  Sparkle,
  Filter,
  Inbox,
  Euro,
  Settings,
  LifeBuoy,
  Radio,
  FileText,
  ShieldCheck,
  CheckSquare,
  Folder,
  MessageSquare,
  Layers,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

/**
 * LE RAIL DE GAUCHE SUIT LA MAQUETTE DE WILLIAM.
 *
 * Relevé le 23/08/2026 dans ses onze écrans (`Fiche Compte`, `Fiche Site`, `Fiche Opportunite`…) :
 * le rail porte toujours les mêmes entrées — Accueil, Comptes, Sites, Contacts, Recommandations,
 * Tâches, Marché — et il y ajoute Opportunités sur la fiche Opportunité. Contrats et Mandats
 * n'apparaissent que sur les écrans qui parlent d'eux : ce sont des insertions contextuelles, pas
 * des entrées permanentes. D'où l'ordre et le contenu ci-dessous.
 *
 * DEUX ABSENTS ASSUMÉS. Pas de « Marché » : aucune page ne l'implémente, et je préfère ne pas poser
 * une icône qui ne mène nulle part. Pas de « Tâches » non plus dans le rail — la page existe
 * (`/taches`) mais les tâches du jour se lisent sur le Tableau de bord ; c'est la seule entrée que
 * William a et que nous n'avons pas, à rétablir d'un mot.
 *
 * CE QUI SORT DU RAIL, ET OÙ LE RETROUVER. Les Signaux ont quitté le rail : ils sont un onglet de la
 * fiche Compte ET de la fiche Site (vérifié), donc on les lit là où ils se produisent. Idem, de
 * longue date, pour Contrats, Mandats, Compteurs, Documents, Interactions et Versions. Aucune de ces
 * pages n'est perdue : elles restent atteignables par la recherche (voir `pagesRecherchables`) et en
 * navigation profonde depuis leur objet parent.
 *
 * PLUS D'ARC-EN-CIEL. Chaque entrée portait sa propre couleur d'icône au repos — rouge, rose, ambre,
 * émeraude, violet… Onze teintes saturées côte à côte : c'est ce que Naoëlle a signalé le
 * 23/08/2026. William tient toutes ses icônes dans un même gris et n'éclaire que l'entrée active.
 * La couleur ne dit donc plus « quel objet », elle dit « où je suis ».
 */
/**
 * ══ PILOTAGE ══ — la première rubrique de son architecture du 26/08/2026.
 *
 * « PILOTAGE : Vue d'ensemble, Patrimoine. » Deux écrans qui ne font avancer aucune affaire : ils
 * disent où l'on en est et ce que vaut le portefeuille.
 */
export const navItems: NavItem[] = [
  { to: '/', label: 'Vue d’ensemble', icon: Home, end: true },
  // UNE SEULE ENTRÉE POUR LE PATRIMOINE — diapositive 8 : « la page Patrimoine rassemble ces objets
  // et permet de naviguer du compte jusqu'au compteur et au contrat ». Comptes, Sites et Contacts
  // étaient trois entrées séparées, et mandats, contrats, compteurs et documents n'en avaient plus
  // aucune depuis le ménage du 23/08 — sept objets qui décrivent la même chose, éclatés en sept
  // endroits. Leurs adresses restent valides : /comptes, /sites, /contacts fonctionnent toujours,
  // seul le rail change.
  { to: '/patrimoine', label: 'Patrimoine', icon: Building2 },
]



/**
 * ══ CYCLE COMMERCIAL ══ — la deuxième rubrique de son architecture du 26/08/2026.
 *
 * « CYCLE COMMERCIAL : Signaux, Pistes, Opportunités, Recommandations. » L'ordre est celui du
 * travail, et il raconte la chaîne : un signal se détecte, devient une piste, mûrit en opportunité,
 * se conclut en recommandation.
 *
 * DEUX CORRECTIONS PAR RAPPORT À CE QUI ÉTAIT EN PLACE :
 *
 * · SIGNAUX N'ÉTAIT PAS DANS LE RAIL DU TOUT. La page existait, avec ses 830 signaux à traiter, mais
 *   elle ne se trouvait que par la recherche ⌘K — un écran d'entrée du cycle commercial qu'il fallait
 *   chercher pour ouvrir.
 * · « PROSPECTION » DEVIENT « PISTES ». C'est le nom de son architecture et celui de l'objet ; la
 *   page s'appelle « Pistes » dans son titre depuis le 30/08/2026 — elle s'appelait « Prospection »
 *   quand ce commentaire a été écrit, ce qui le rendait faux. Un menu qui nomme autrement ce qu'il ouvre fait
 *   hésiter à chaque clic.
 */
export const cycleNavItems: NavItem[] = [
  { to: '/signaux', label: 'Signaux', icon: Radio },
  { to: '/prospection', label: 'Pistes', icon: Filter },
  { to: '/opportunites', label: 'Opportunités', icon: Target },
  { to: '/recommandations', label: 'Recommandations', icon: Sparkle },
]

/** Les deux objets retirés du rail le 25/08/2026, gardés ici pour les remettre d'un geste. */
/**
 * LA RUBRIQUE PRODUCTION du dossier UX du 26/08/2026 : Pricing et Requêtes.
 *
 * Elles sortent des pages masquées où Requêtes dormait depuis le 25/08 : son architecture leur donne
 * une rubrique à elles, après le cycle commercial. C'est juste — ni l'une ni l'autre ne fait avancer
 * une affaire, elles traitent ce qui arrive après ou à côté.
 */
export const productionNavItems: NavItem[] = [
  { to: '/pricing', label: 'Pricing', icon: Euro },
  { to: '/requetes', label: 'Requêtes', icon: Inbox },
  // Le dernier objet de la chaîne : ce qui se passe APRÈS la signature. Dossier de transmission du
  // 31/08/2026, § 2 — la zone Production réunit « Pricing · Requêtes · Suivis de contrats ».
  { to: '/suivis-contrats', label: 'Suivis de contrats', icon: LifeBuoy },
]

export const navItemsMasques: NavItem[] = [
  { to: '/remunerations', label: 'Rémunérations', icon: Euro },
]

// Support et réglages : pas des objets métier, affichés en bas du rail juste au-dessus du profil.
export const bottomNavItems: NavItem[] = [
  { to: '/support', label: 'Support', icon: LifeBuoy },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
]

/**
 * CE QUE LA RECHERCHE DOIT TROUVER, rail ou pas.
 *
 * Sortir une page du rail ne doit pas la rendre introuvable : la barre de recherche cherchait
 * uniquement dans le rail, si bien que retirer les Signaux les aurait laissés accessibles à l'URL
 * seule. Les listes qui vivent hors du rail sont donc listées ici, et elles seules s'ajoutent à
 * l'index des pages.
 */
export const pagesRecherchables: NavItem[] = [
  ...navItems,
  ...cycleNavItems,
  // Retirées du rail le 25/08, mais toujours atteignables : masquer n'est pas supprimer.
  ...productionNavItems,
  ...navItemsMasques,
  ...bottomNavItems,
  { to: '/signaux', label: 'Signaux', icon: Radio },
  // Les listes du patrimoine restent trouvables par la recherche, chacune sur son onglet.
  { to: '/comptes', label: 'Comptes', icon: Building2 },
  { to: '/sites', label: 'Sites', icon: MapPin },
  { to: '/contacts', label: 'Contacts', icon: User },
  { to: '/compteurs', label: 'Compteurs', icon: Gauge },
  { to: '/contrats', label: 'Contrats', icon: FileText },
  { to: '/mandats', label: 'Mandats', icon: ShieldCheck },
  { to: '/taches', label: 'Tâches', icon: CheckSquare },
  { to: '/documents', label: 'Documents', icon: Folder },
  { to: '/interactions', label: 'Interactions', icon: MessageSquare },
  { to: '/versions', label: 'Versions', icon: Layers },
]
