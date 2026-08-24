import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * L'INFO-BULLE SORT DU RAIL, ET C'EST TOUTE LA CLEF DU DEFILEMENT.
 *
 * Elle etait posee en `absolute left-full` DANS le lien, donc dans la barre de navigation. Une barre
 * qui defile a forcement `overflow` autre que `visible`, et un `overflow` coupe ce qui depasse : les
 * info-bulles auraient ete tronquees. C'est pour cela que la barre etait laissee en
 * `md:overflow-visible` — et donc qu'elle ne defilait pas du tout sur grand ecran. Les entrees
 * debordaient alors PAR-DESSUS le filet de section et le bloc du bas, ce que Naoelle a vu le
 * 24/08/2026 : l'euro des Remunerations posé sur la barre de section.
 *
 * Rendue dans `document.body`, l'info-bulle n'a plus d'ancetre qui la coupe. La barre peut defiler,
 * et ajouter un objet ne cassera plus rien.
 */
function InfoBulle({ ancre, label }: { ancre: HTMLElement; label: string }) {
  const r = ancre.getBoundingClientRect()
  return createPortal(
    <span
      className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-800 px-2 py-1 text-xs font-medium text-white shadow-lg"
      style={{ left: r.right + 8, top: r.top + r.height / 2 }}
    >
      {label}
    </span>,
    document.body,
  )
}

/**
 * Le rail se replie par CSS (`md:w-14`) et non par un etat : on interroge donc la media query. Lue
 * au moment du survol, elle est forcement a jour.
 */
function railReplie(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
}

function SidebarLink({ to, label, icon: Icon, end, onClick }: NavItem & { onClick: () => void }) {
  // `null` tant qu'on ne survole pas : l'info-bulle n'existe pas dans le DOM au repos.
  const [survole, setSurvole] = useState<HTMLElement | null>(null)

  return (
    <NavLink
      onMouseEnter={(e) => setSurvole(e.currentTarget)}
      onMouseLeave={() => setSurvole(null)}
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
          {/* Au survol seulement, et seulement quand le rail est replié : déplié, le libellé est
              déjà lu à côté de l'icône. */}
          {survole && railReplie() && <InfoBulle ancre={survole} label={label} />}
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
  // Les deux dégradés ne s'affichent que s'il reste quelque chose à voir de ce côté-là. Recalculés
  // au défilement, au redimensionnement, et quand le nombre d'entrées change — c'est ce dernier cas
  // qui compte : ajouter un objet ne doit rien casser.
  const barre = useRef<HTMLElement | null>(null)
  const [haut, setHaut] = useState(false)
  const [bas, setBas] = useState(false)

  const majDegrades = useCallback(() => {
    const el = barre.current
    if (!el) return
    setHaut(el.scrollTop > 2)
    setBas(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }, [])

  useEffect(() => {
    majDegrades()
    window.addEventListener('resize', majDegrades)
    return () => window.removeEventListener('resize', majDegrades)
  }, [majDegrades, isAdmin])

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

        {/* LA BARRE DEFILE, ET LES DEGRADES LE DISENT. Sans eux on ne devine pas qu'il reste des
            entrees hors champ : la derniere visible a l'air d'etre la derniere. Ils n'apparaissent
            que du cote ou il reste quelque chose. */}
        <div className="relative min-h-0 flex-1">
          {haut && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-ink-950 to-transparent" />
          )}
          <nav
            ref={barre}
            onScroll={majDegrades}
            className="h-full space-y-1 overflow-y-auto overflow-x-hidden px-2.5 py-1 scrollbar-thin md:px-0"
          >
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
          {bas && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-ink-950 to-transparent" />
          )}
        </div>

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
