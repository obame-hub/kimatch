import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { InstallPrompt } from '@/components/layout/InstallPrompt'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { DocusignBanner } from '@/components/layout/DocusignBanner'
import { SidebarProvider } from '@/lib/layout'
import { TelephonieProvider } from '@/lib/telephonie'
import { getImpersonationInfo } from '@/lib/data/impersonation'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const impersonating = Boolean(getImpersonationInfo())

  return (
    <SidebarProvider>
      {/* LE TÉLÉPHONE EST MONTÉ UNE FOIS POUR TOUTE L'APPLICATION. Son panneau doit survivre à la
          navigation : un appel en cours ne peut pas être coupé parce qu'on change de page pour
          consulter la fiche du client qu'on a au bout du fil. */}
      <TelephonieProvider>
      <ImpersonationBanner />
      {/* En flux normal, contrairement au bandeau d'emprunt d'identité qui est en position fixe :
          les deux peuvent s'afficher ensemble sans se superposer, et celui-ci pousse le contenu au
          lieu de le masquer. */}
      {/* La colonne en h-screen englobe le bandeau : sans elle, bandeau + zone applicative en
          h-screen depasseraient la hauteur de la fenetre et feraient apparaitre un second
          ascenseur, celui de la page, en plus de celui du contenu. */}
      <div className="flex h-screen w-full flex-col">
        <DocusignBanner />
        {/* Le fond de page passe au `km-bg` de Michel : #FCFCFB, presque blanc. */}
        <div className="flex min-h-0 flex-1 bg-km-bg">
          <Sidebar />
          <main className={cn('min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0 md:pl-[215px]', impersonating && 'pt-7')}>
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
      <InstallPrompt />
      </TelephonieProvider>
    </SidebarProvider>
  )
}
