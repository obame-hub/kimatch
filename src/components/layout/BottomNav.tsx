import { NavLink } from 'react-router-dom'
import { LayoutDashboard, MapPin, Radio, FileText, CheckSquare, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActions } from '@/lib/data/actions'
import { useSignaux } from '@/lib/data/signaux'
import { useSidebar } from '@/lib/layout'

const items = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true, tint: 'text-navy-800' },
  { to: '/sites', label: 'Sites', icon: MapPin, tint: 'text-kiwi-600' },
  { to: '/signaux', label: 'Signaux', icon: Radio, tint: 'text-red-500' },
  { to: '/recommandations', label: 'Recos', icon: FileText, tint: 'text-amber-500' },
  { to: '/taches', label: 'Tâches', icon: CheckSquare, tint: 'text-amber-600' },
]

export function BottomNav() {
  const { data: signaux } = useSignaux()
  const { data: actions } = useActions()
  const { toggle } = useSidebar()
  const nbSignauxOuverts = (signaux ?? []).filter((s) => s.statut !== 'CLOTURE').length
  const nbTachesOuvertes = (actions ?? []).filter((a) => a.statut !== 'TERMINEE' && a.statut !== 'ANNULEE').length
  const badges: Record<string, number> = { '/signaux': nbSignauxOuverts, '/taches': nbTachesOuvertes }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-navy-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map(({ to, label, icon: Icon, end, tint }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-navy-400"
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('h-[18px] w-[18px]', isActive && tint)} />
              <span className={cn('text-[9px] font-semibold', isActive && tint)}>{label}</span>
              {!!badges[to] && (
                <span className="absolute right-[calc(50%-16px)] top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
              )}
            </>
          )}
        </NavLink>
      ))}
      <button type="button" onClick={toggle} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-navy-400">
        <Menu className="h-[18px] w-[18px]" />
        <span className="text-[9px] font-semibold">Plus</span>
      </button>
    </nav>
  )
}
