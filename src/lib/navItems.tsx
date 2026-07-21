import {
  Home,
  Building2,
  MapPin,
  Gauge,
  Radio,
  Sparkle,
  User,
  CheckSquare,
  Settings,
} from 'lucide-react'

// Un module = une icône + une couleur d'accent, comme le rail CRM de référence (William).
// Mandats, Contrats, Versions, Interactions et Documents n'ont pas leur propre entrée :
// on les retrouve toujours via un Site, un Compte, un Contact ou un Compteur, jamais
// dans une liste isolée (retour William) — leurs pages/routes restent accessibles en
// navigation profonde, seul le lien de premier niveau est retiré.
export const navItems = [
  { to: '/', label: 'Tableau de bord', icon: Home, end: true, accent: 'bg-ink-700', tint: 'text-navy-300' },
  { to: '/comptes', label: 'Comptes', icon: Building2, accent: 'bg-sky-500', tint: 'text-sky-400' },
  { to: '/contacts', label: 'Contacts', icon: User, accent: 'bg-violet-500', tint: 'text-violet-400' },
  { to: '/sites', label: 'Sites', icon: MapPin, accent: 'bg-kiwi-600', tint: 'text-kiwi-400' },
  { to: '/compteurs', label: 'Compteurs', icon: Gauge, accent: 'bg-ink-700', tint: 'text-navy-300' },
  { to: '/signaux', label: 'Signaux', icon: Radio, accent: 'bg-red-500', tint: 'text-red-400' },
  { to: '/recommandations', label: 'Recommandations', icon: Sparkle, accent: 'bg-amber-500', tint: 'text-amber-300' },
  { to: '/taches', label: 'Tâches', icon: CheckSquare, accent: 'bg-amber-600', tint: 'text-amber-400', badgeKey: 'taches' as const },
  { to: '/parametres', label: 'Paramètres', icon: Settings, accent: 'bg-ink-700', tint: 'text-navy-300' },
]
