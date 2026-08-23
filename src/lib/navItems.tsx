import {
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
export const navItems: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: Home, end: true },
  { to: '/comptes', label: 'Comptes', icon: Building2 },
  { to: '/sites', label: 'Sites', icon: MapPin },
  { to: '/contacts', label: 'Contacts', icon: User },
  // L'OPPORTUNITÉ PRÉCÈDE LA RECOMMANDATION, dans le rail comme dans la chaîne : « Piste /
  // Portefeuille / Demande entrante / Partenaire → Opportunité → Recommandation » (Michel,
  // 23/08/2026). L'ordre du menu raconte l'ordre du travail — et c'est aussi celui de William.
  { to: '/opportunites', label: 'Opportunités', icon: Target },
  { to: '/recommandations', label: 'Recommandations', icon: Sparkle },
]

/**
 * Le second groupe : les écrans de travail qui n'ont PAS d'objet parent où les retrouver.
 *
 * Une piste n'a pas encore de compte — c'est justement ce qui la définit — donc Prospection ne peut
 * se lire de nulle part ailleurs. Une requête et une rémunération se rattachent bien à un compte,
 * mais on vient les consulter pour trier ce qui traîne, toutes affaires confondues : « quelles
 * commissions sont en retard » ne se lit pas compte par compte. Ils sont séparés par un filet du
 * groupe précédent pour qu'on ne les lise pas comme des objets du patrimoine.
 */
export const travailNavItems: NavItem[] = [
  { to: '/prospection', label: 'Prospection', icon: Filter },
  // LA REQUÊTE EST À PART, comme dans le mémo : « un autre objet actif mais PARALLÈLE à la chaîne
  // commerciale ». Icône `Inbox` et non la bouée : la bouée sert déjà au Support en bas du rail, et
  // deux bouées identiques dans un rail de 56 px ne se distinguent pas (vu sur capture).
  { to: '/requetes', label: 'Requêtes', icon: Inbox },
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
  ...travailNavItems,
  ...bottomNavItems,
  { to: '/signaux', label: 'Signaux', icon: Radio },
  { to: '/contrats', label: 'Contrats', icon: FileText },
  { to: '/mandats', label: 'Mandats', icon: ShieldCheck },
  { to: '/taches', label: 'Tâches', icon: CheckSquare },
  { to: '/documents', label: 'Documents', icon: Folder },
  { to: '/interactions', label: 'Interactions', icon: MessageSquare },
  { to: '/versions', label: 'Versions', icon: Layers },
]
