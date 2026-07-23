import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { InstallPrompt } from '@/components/layout/InstallPrompt'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { SidebarProvider } from '@/lib/layout'
import { getImpersonationInfo } from '@/lib/data/impersonation'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const impersonating = Boolean(getImpersonationInfo())

  return (
    <SidebarProvider>
      <ImpersonationBanner />
      <div className="flex h-screen bg-navy-50">
        <Sidebar />
        <main className={cn('min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0 md:pl-14', impersonating && 'pt-7')}>
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <InstallPrompt />
    </SidebarProvider>
  )
}
