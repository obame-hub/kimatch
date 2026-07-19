import { LogOut, Menu } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/lib/layout'

export function Topbar({ title }: { title: string }) {
  const { signOut, demoMode } = useAuth()
  const { toggle } = useSidebar()

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-navy-100 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="-ml-1 rounded-lg p-2 text-navy-500 hover:bg-navy-100 md:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-navy-900 sm:text-lg">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {demoMode && (
          <span className="hidden rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 sm:inline-block">
            Mode démo
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Déconnexion</span>
        </Button>
      </div>
    </header>
  )
}
