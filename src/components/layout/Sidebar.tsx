import { NavLink } from 'react-router-dom'
import { X, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import kiweePicto from '@/assets/kiwee-picto.png'
import { useSidebar } from '@/lib/layout'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { useAuth } from '@/lib/auth'
import { navItems, travailNavItems, bottomNavItems } from '@/lib/navItems'
import type { NavItem } from '@/lib/navItems'
import { getImpersonationInfo } from '@/lib/data/impersonation'

function SidebarLink({ to, label, icon: Icon, end, onClick }: NavItem & { onClick: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg py-2 pl-2 pr-3 text-sm font-medium transition-colors',
          'md:justify-center md:px-0',
          // LES TEINTES DU RAIL SONT FIXES, ET C'EST LA RAISON D'ETRE DE `ink-*`. Le rail garde son
          // fond `ink-950` dans les deux themes, alors que les jetons `navy-*` s'inversent :
          // `navy-300` valait 201,203,198 en clair mais 58,61,68 en sombre — soit un gris presque
          // invisible sur un fond presque noir. Mesure faite le 23/08/2026. `ink-400` vaut #8b8e96,
          // exactement la teinte que William donne a ses icones de rail.
          isActive ? 'text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* UNE SEULE TEINTE AU REPOS. Chaque entree portait sa couleur (rouge, rose, ambre,
              emeraude...) : onze teintes saturees dans un rail de 56 px de large. La couleur ne dit
              plus quel objet mais ou l'on se trouve, comme chez William. */}
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-kiwi-600' : 'bg-transparent',
            )}
          >
            <Icon className={cn('h-4 w-4', isActive ? 'text-white' : 'text-ink-400')} />
          </span>
          <span className="min-w-0 flex-1 truncate whitespace-nowrap md:hidden">
            {label}
          </span>
          {/* Info-bulle au survol : remplace le déploiement de la barre (retour William). */}
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 md:block">
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { open, close } = useSidebar()
  const isAdmin = useIsAdmin()
  const { session } = useAuth()
  const { data: profil } = useMonProfil()
  // Support/Paramètres (et Administration pour les admins) sont séparés des objets métier
  // ci-dessus : regroupés en bas du rail, juste au-dessus du profil.
  const bottomItems: NavItem[] = isAdmin
    ? [...bottomNavItems, { to: '/administration', label: 'Administration', icon: ShieldCheck }]
    : bottomNavItems
  const initiales = profil
    ? `${profil.prenom[0] ?? ''}${profil.nom[0] ?? ''}`.toUpperCase()
    : (session?.user.email ?? 'KW').slice(0, 2).toUpperCase()
  const impersonating = Boolean(getImpersonationInfo())

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
          'fixed left-0 z-50 flex flex-col overflow-hidden border-r border-ink-800 bg-ink-950 transition-transform duration-200 ease-out',
          impersonating ? 'top-7 bottom-0' : 'inset-y-0',
          'w-64 md:w-14 md:overflow-visible',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex items-center gap-2.5 px-3.5 py-4 md:justify-center md:px-0">
          <img src={kiweePicto} alt="KiWee" className="h-7 w-7 shrink-0 object-contain drop-shadow-[0_4px_10px_rgba(13,122,95,0.45)]" />
          <div className="min-w-0 flex-1 md:hidden">
            <p className="whitespace-nowrap font-display text-sm font-semibold leading-none text-white">Kimatch</p>
            <p className="whitespace-nowrap text-[11px] text-ink-400">Conseil énergie</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-white md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2.5 py-1 scrollbar-thin md:overflow-visible md:px-0">
          {navItems.map((item) => (
            <SidebarLink key={item.to} {...item} onClick={close} />
          ))}
          {/* Un filet, et non un titre de section : le rail replie fait 56 px, un intitule n'y
              tiendrait pas. Il separe les objets du patrimoine des ecrans de travail. */}
          <div className="mx-2 my-2 border-t border-ink-800 md:mx-3" />
          {travailNavItems.map((item) => (
            <SidebarLink key={item.to} {...item} onClick={close} />
          ))}
        </nav>

        <nav className="space-y-1 border-t border-ink-800 px-2.5 py-2 md:px-0">
          {bottomItems.map((item) => (
            <SidebarLink key={item.to} {...item} onClick={close} />
          ))}
        </nav>

        <NavLink
          to="/profil"
          onClick={close}
          className="group relative flex items-center gap-2.5 border-t border-ink-800 px-3.5 py-3.5 md:justify-center md:px-0"
        >
          {profil?.photo_url ? (
            <img src={profil.photo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-ink-100">
              {initiales}
            </div>
          )}
          <p className="min-w-0 flex-1 truncate whitespace-nowrap text-[11px] text-ink-400 md:hidden">
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
