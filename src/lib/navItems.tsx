import {
  Home,
  Building2,
  MapPin,
  Radio,
  Target,
  Sparkle,
  User,
  Settings,
  LifeBuoy,
} from 'lucide-react'

// Un module = une icône + une couleur d'accent, comme le rail CRM de référence (William).
// Mandats, Contrats, Versions, Interactions, Documents, Compteurs et Tâches n'ont pas leur
// propre entrée : on les retrouve toujours via un Site, un Compte, un Contact (et, pour les
// tâches, sur le Tableau de bord — "mes tâches du jour"), jamais dans une liste isolée
// (retour William) — leurs pages/routes restent accessibles en navigation profonde, seul le
// lien de premier niveau est retiré. Compteurs n'a même plus de route de liste : redondante
// avec celle des Sites.
export const navItems = [
  { to: '/', label: 'Tableau de bord', icon: Home, end: true, accent: 'bg-ink-700', tint: 'text-navy-300' },
  { to: '/comptes', label: 'Comptes', icon: Building2, accent: 'bg-sky-500', tint: 'text-sky-400' },
  { to: '/contacts', label: 'Contacts', icon: User, accent: 'bg-violet-500', tint: 'text-violet-400' },
  { to: '/sites', label: 'Sites', icon: MapPin, accent: 'bg-kiwi-600', tint: 'text-kiwi-400' },
  // L'OPPORTUNITE PRECEDE LA RECOMMANDATION dans le rail comme dans la chaine : « Piste /
  // Portefeuille / Demande entrante / Partenaire → Opportunite → Recommandation » (Michel,
  // 23/08/2026). L'ordre du menu raconte l'ordre du travail.
  { to: '/signaux', label: 'Signaux', icon: Radio, accent: 'bg-red-500', tint: 'text-red-400' },
  { to: '/opportunites', label: 'Opportunités', icon: Target, accent: 'bg-amber-500', tint: 'text-amber-300' },
  { to: '/recommandations', label: 'Recommandations', icon: Sparkle, accent: 'bg-amber-500', tint: 'text-amber-300' },
]

// Séparés des objets métier ci-dessus : support et réglages, affichés en bas du rail
// juste au-dessus du profil.
export const bottomNavItems = [
  { to: '/support', label: 'Support', icon: LifeBuoy, accent: 'bg-rose-500', tint: 'text-rose-400' },
  { to: '/parametres', label: 'Paramètres', icon: Settings, accent: 'bg-ink-700', tint: 'text-navy-300' },
]
