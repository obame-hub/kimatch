import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { InstallPrompt } from '@/components/layout/InstallPrompt'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { DocusignBanner } from '@/components/layout/DocusignBanner'
import { GmailBanner } from '@/components/layout/GmailBanner'
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
      {/* `flex-1` et non plus `h-screen` : la colonne pleine hauteur est montée dans `App`,
          bandeau compris. Reprendre `h-screen` ici rendrait les 28 px de débordement. */}
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <DocusignBanner />
        {/* MÊME PLACE, MÊME FORME QUE DOCUSIGN. Les deux peuvent s'afficher ensemble : ils se
            posent l'un sous l'autre et poussent le contenu, aucun ne recouvre l'autre. */}
        <GmailBanner />
        {/* Le fond de page passe au `km-bg` de Michel : #FCFCFB, presque blanc. */}
        <div className="flex min-h-0 flex-1 bg-km-bg">
          <Sidebar />
          {/* ══ LA MARGE BASSE EST CELLE DES PASTILLES FLOTTANTES ══

              Naoëlle, 15/09/2026, capture à l'appui : « je ne peux pas déplier à cause des widgets
              de téléphone et de notification ». Le bouton « voir le reste » d'une colonne du kanban
              se trouve en bas ; les deux pastilles y flottent en permanence et le recouvrent. Le
              contenu n'était pas seulement caché — il devenait INCLIQUABLE, et rien ne le disait.

              Le calcul, pour qu'il se refasse le jour où les pastilles bougent :

                ordinateur   `md:bottom-4` (16 px) + `h-11` (44 px)      = 60 px occupés
                mobile       `bottom-[4.5rem]` (72 px) + 44 px           = 116 px occupés

              D'où `pb-32` (128 px) sur mobile — la barre du bas y ajoutait déjà 56 px, ce qui ne
              suffisait pas — et `md:pb-20` (80 px) sur ordinateur. Dans les deux cas une marge de
              plus que le strict nécessaire, pour qu'un clic près du bord ne tombe pas à un pixel
              de la pastille.

              ICI ET PAS DANS CHAQUE ÉCRAN : `main` est le seul conteneur qui défile, donc la seule
              correction qui vaille pour les pages d'aujourd'hui comme pour celles de demain. */}
          <main className={cn('min-w-0 flex-1 overflow-y-auto pb-32 md:pb-20 md:pl-[215px]', impersonating && 'pt-7')}>
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
