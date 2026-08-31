import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-km-faint">Chargement…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
