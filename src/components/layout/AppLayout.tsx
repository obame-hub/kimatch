import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { InstallPrompt } from '@/components/layout/InstallPrompt'
import { SidebarProvider } from '@/lib/layout'

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen bg-navy-50">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto md:pl-14">
          <Outlet />
        </main>
      </div>
      <InstallPrompt />
    </SidebarProvider>
  )
}
