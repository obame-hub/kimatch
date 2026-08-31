import { NavLink } from 'react-router-dom'
import { Home, Building2, MapPin, Sparkle, Radio, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/layout'

// Destinations de premier niveau (Tâches retiré du menu — accessible via les objets liés
// et le Tableau de bord). "Plus" est ajouté en dernier pour atteindre les autres sections.
const items = [
  { to: '/', label: 'Accueil', icon: Home, end: true, tint: 'text-km-text' },
  { to: '/comptes', label: 'Comptes', icon: Building2, tint: 'text-sky-500' },
  { to: '/sites', label: 'Sites', icon: MapPin, tint: 'text-km-green' },
  { to: '/recommandations', label: 'Recos', icon: Sparkle, tint: 'text-amber-500' },
  { to: '/signaux', label: 'Signaux', icon: Radio, tint: 'text-red-500' },
]

export function BottomNav() {
  const { toggle } = useSidebar()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-km-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map(({ to, label, icon: Icon, end, tint }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-km-faint"
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('h-[18px] w-[18px]', isActive && tint)} />
              <span className={cn('text-km-tiny font-semibold', isActive && tint)}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button type="button" onClick={toggle} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-km-faint">
        <Menu className="h-[18px] w-[18px]" />
        <span className="text-km-tiny font-semibold">Plus</span>
      </button>
    </nav>
  )
}
