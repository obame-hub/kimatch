import { NavLink } from 'react-router-dom'
import { Home, Building2, Sparkle, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/layout'
import { useEstPartenaire } from '@/lib/data/roles'

// Destinations de premier niveau (Tâches retiré du menu — accessible via les objets liés
// et le Tableau de bord). "Plus" est ajouté en dernier pour atteindre les autres sections.
//
// Signaux est sorti d'ici le 02/09/2026 avec le reste du sujet — voir `cycleNavItems` dans
// `lib/navItems.tsx` pour la décision et la façon de le remettre. Les quatre entrées restantes
// occupent la barre plus largement, ce qui est un gain sur un écran de téléphone.
const items = [
  { to: '/', label: 'Accueil', icon: Home, end: true, tint: 'text-km-text' },
  { to: '/comptes', label: 'Comptes', icon: Building2, tint: 'text-sky-500' },
  /* Sites sort de la barre le 09/09/2026, meme raison que dans les onglets du Patrimoine : il
     annoncait un objet de premier rang alors qu'il n'etait qu'un regroupement d'adresse, et des
     commerciaux le prenaient pour un point de livraison. Voir `Patrimoine.tsx`. */
  { to: '/recommandations', label: 'Recos', icon: Sparkle, tint: 'text-amber-500' },
]

/* ══ LA BARRE DU BAS SUIT LE MÊME CLOISONNEMENT — 24/09/2026 ══
 *
 * Naoëlle : « affiche seulement ce dont il a besoin ». Et sa règle de toujours : le mobile compte
 * autant que le PC — une barre qui proposerait « Accueil » et « Comptes » à un partenaire ouvrirait
 * sur téléphone ce que le rail ferme sur ordinateur.
 *
 * ACCUEIL SORT AUSSI : la vue d'ensemble compte les affaires de KiWee, les tâches du jour, le pipe.
 * Une page de zéros ferait croire à une panne. */
const itemsPartenaire = [
  { to: '/recommandations', label: 'Recos', icon: Sparkle, end: false, tint: 'text-amber-500' },
  { to: '/patrimoine', label: 'Patrimoine', icon: Building2, end: false, tint: 'text-sky-500' },
]

export function BottomNav() {
  const { toggle } = useSidebar()
  const estPartenaire = useEstPartenaire()
  const entrees = estPartenaire ? itemsPartenaire : items

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-km-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {entrees.map(({ to, label, icon: Icon, end, tint }) => (
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
