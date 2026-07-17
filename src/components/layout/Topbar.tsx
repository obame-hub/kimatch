import { LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export function Topbar({ title }: { title: string }) {
  const { signOut, demoMode } = useAuth()

  return (
    <header className="flex h-16 items-center justify-between border-b border-navy-100 bg-white px-6">
      <h1 className="text-lg font-semibold text-navy-900">{title}</h1>
      <div className="flex items-center gap-3">
        {demoMode && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            Mode démo
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </header>
  )
}
