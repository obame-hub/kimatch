import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export function ProtectedRoute() {
  const { session, loading, demoMode } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-navy-400">Chargement…</div>
  }

  if (!demoMode && !session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
