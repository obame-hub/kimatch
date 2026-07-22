import { NavLink } from 'react-router-dom'
import { X, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import kiweePicto from '@/assets/kiwee-picto.png'
import { useActions } from '@/lib/data/actions'
import { useSidebar } from '@/lib/layout'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { useAuth } from '@/lib/auth'
import { navItems } from '@/lib/navItems'

export function Sidebar() {
  const { data: actions } = useActions()
  const nbTachesOuvertes = (actions ?? []).filter((a) => a.statut !== 'TERMINEE' && a.statut !== 'ANNULEE').length
  const { open, close } = useSidebar()
  const isAdmin = useIsAdmin()
  const { session } = useAuth()
  const { data: profil } = useMonProfil()
  const items = isAdmin
    ? [...navItems, { to: '/administration', label: 'Administration', icon: ShieldCheck, accent: 'bg-ink-700', tint: 'text-navy-300' }]
    : navItems
  const initiales = profil
    ? `${profil.prenom[0] ?? ''}${profil.nom[0] ?? ''}`.toUpperCase()
    : (session?.user.email ?? 'KW').slice(0, 2).toUpperCase()

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
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-ink-800 bg-ink-950 transition-transform duration-200 ease-out',
          'w-64 md:w-14 md:overflow-visible',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex items-center gap-2.5 px-3.5 py-4 md:justify-center md:px-0">
          <img src={kiweePicto} alt="KiWee" className="h-7 w-7 shrink-0 object-contain drop-shadow-[0_4px_10px_rgba(13,122,95,0.45)]" />
          <div className="min-w-0 flex-1 md:hidden">
            <p className="whitespace-nowrap font-display text-sm font-semibold leading-none text-white">Kimatch</p>
            <p className="whitespace-nowrap text-[11px] text-navy-400">Conseil énergie</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-ink-800 hover:text-white md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2.5 py-1 scrollbar-thin md:overflow-visible md:px-0">
          {items.map(({ to, label, icon: Icon, end, accent, tint, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={close}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg py-2 pl-2 pr-3 text-sm font-medium transition-colors',
                  'md:justify-center md:px-0',
                  isActive ? 'text-white' : 'text-navy-300 hover:bg-ink-800 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isActive ? accent : 'bg-transparent',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', isActive ? 'text-white' : tint)} />
                  </span>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap md:hidden">
                    {label}
                  </span>
                  {badgeKey === 'taches' && nbTachesOuvertes > 0 && (
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] font-semibold text-navy-200 md:hidden">
                      {nbTachesOuvertes}
                    </span>
                  )}
                  {badgeKey === 'taches' && nbTachesOuvertes > 0 && (
                    <span className="absolute left-[26px] top-1.5 hidden h-1.5 w-1.5 rounded-full bg-red-500 md:block" />
                  )}
                  {/* Info-bulle au survol : remplace le déploiement de la barre (retour William). */}
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 md:block">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/profil"
          onClick={close}
          className="group relative flex items-center gap-2.5 border-t border-ink-800 px-3.5 py-3.5 md:justify-center md:px-0"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-navy-200">
            {initiales}
          </div>
          <p className="min-w-0 flex-1 truncate whitespace-nowrap text-[11px] text-navy-500 md:hidden">
            KiWee Énergie · MVP
          </p>
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 md:block">
            Mon profil
          </span>
        </NavLink>
      </aside>
    </>
  )
}
