import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  MapPin,
  Gauge,
  Radio,
  FileCheck2,
  FileText,
  History,
  FolderClosed,
  MessageSquare,
  FileSignature,
  User,
  CheckSquare,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { KiweeMark } from '@/components/ui/kiwee-mark'
import { useActions } from '@/lib/data/actions'
import { useSidebar } from '@/lib/layout'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/comptes', label: 'Comptes', icon: Building2 },
  { to: '/contacts', label: 'Contacts', icon: User },
  { to: '/sites', label: 'Sites', icon: MapPin },
  { to: '/compteurs', label: 'Compteurs', icon: Gauge },
  { to: '/signaux', label: 'Signaux', icon: Radio },
  { to: '/mandats', label: 'Mandats', icon: FileCheck2 },
  { to: '/contrats', label: 'Contrats', icon: FileSignature },
  { to: '/recommandations', label: 'Recommandations', icon: FileText },
  { to: '/versions', label: 'Versions', icon: History },
  { to: '/taches', label: 'Tâches', icon: CheckSquare, badgeKey: 'taches' as const },
  { to: '/interactions', label: 'Interactions', icon: MessageSquare },
  { to: '/documents', label: 'Documents', icon: FolderClosed },
]

export function Sidebar() {
  const { data: actions } = useActions()
  const nbTachesOuvertes = (actions ?? []).filter((a) => a.statut !== 'TERMINEE' && a.statut !== 'ANNULEE').length
  const { open, close } = useSidebar()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-950 text-navy-200 transition-transform duration-200 md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <KiweeMark className="h-8 w-8 drop-shadow-[0_4px_10px_rgba(140,203,56,0.45)]" />
          <div className="flex-1">
            <p className="font-display text-sm font-semibold leading-none text-white">KiWee OS</p>
            <p className="text-[11px] text-navy-400">Conseil énergie</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-ink-900 hover:text-white md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin">
          {navItems.map(({ to, label, icon: Icon, end, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={close}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-kiwi-500/15 text-kiwi-300 shadow-[inset_0_0_0_1px_rgba(140,203,56,0.35)]'
                    : 'text-navy-300 hover:bg-ink-900 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-kiwi-400" />
                  )}
                  <Icon className={cn('h-4 w-4 shrink-0 transition-transform', isActive && 'scale-110')} />
                  {label}
                  {badgeKey === 'taches' && nbTachesOuvertes > 0 && (
                    <span className="ml-auto rounded-full bg-navy-700 px-1.5 py-0.5 text-[10px] font-semibold text-navy-200">
                      {nbTachesOuvertes}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-800 px-5 py-4 text-[11px] text-navy-500">
          KiWee Énergie · MVP
        </div>
      </aside>
    </>
  )
}
