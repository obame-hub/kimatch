import { useEffect, useState } from 'react'
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
import { PaletteCommandes } from '@/components/layout/PaletteCommandes'
import { estUneSaisie, ouvertureDemandee } from '@/lib/raccourci'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const impersonating = Boolean(getImpersonationInfo())

  /* ══ LA PALETTE EST MONTÉE ICI, ET UNE SEULE FOIS ══
     Elle vivait dans la barre du haut, supprimée le 16/09/2026. `AppLayout` est ce qui reste de
     commun à tous les écrans — c'est donc lui qui écoute le clavier et qui porte le panneau.

     LE MONTAGE UNIQUE N'EST PAS UN DÉTAIL : monté par chaque page, l'écouteur se serait attaché
     autant de fois qu'il y a d'écrans empilés, et une frappe aurait ouvert plusieurs palettes. */
  const [palette, setPalette] = useState(false)
  const [saisieInitiale, setSaisieInitiale] = useState<string | undefined>(undefined)

  function ouvrirPalette(saisie?: string) {
    setSaisieInitiale(saisie)
    setPalette(true)
  }

  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (palette) return
      /* La décision vit dans `raccourci.ts`, où elle est testée cas par cas : c'est la logique la
         plus facile à casser sans s'en apercevoir, parce qu'une régression n'y lève aucune erreur. */
      const quoi = ouvertureDemandee({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        dansUneSaisie: estUneSaisie(e.target),
        panneauOuvert: Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]')),
      })
      if (!quoi) return
      e.preventDefault()
      ouvrirPalette(quoi === 'frappe' ? e.key : undefined)
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [palette])

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

              ICI ET PAS DANS CHAQUE ÉCRAN : `main` est le seul conteneur qui défile — SAUF pour
              les fiches, et c'est tout le sujet du paragraphe suivant.

              ══ SAUF SUR UNE PAGE QUI GÈRE SA PROPRE HAUTEUR ══

              William, 16/09/2026, capture à l'appui : « c'est toujours coupé… c'est comme s'il y
              avait un bandeau où est disposée la pastille de notification et d'appel ». Il décrit
              exactement cette marge.

              Une fiche (`data-pleine-hauteur`) ne défile PAS dans `main` : elle prend toute la
              hauteur et fait défiler ses volets à l'intérieur. La marge basse ne repousse alors
              rien du tout — elle RACCOURCIT la page de 80 px, et le volet s'arrête au-dessus du bas
              de la fenêtre. La dernière carte est tranchée net sur une bande vide où flottent les
              deux pastilles : la description est littérale.

              La marge est donc annulée sur ces pages, et reportée À L'INTÉRIEUR du volet qui
              défile — voir la colonne de gauche de la fiche. Le contenu retrouve toute la hauteur,
              et la dernière carte peut être amenée au-dessus des pastilles en défilant. Les deux
              intentions sont servies, au lieu d'une contre l'autre.

              `has-[[data-pleine-hauteur]]` PLUTÔT QU'UNE LISTE DE ROUTES : la règle suit ce que la
              page déclare, et une fiche créée demain en hérite sans qu'on ait rien à tenir à jour
              ici. */}
          <main className={cn('min-w-0 flex-1 overflow-y-auto pb-32 md:pb-20 md:pl-[215px] has-[[data-pleine-hauteur]]:pb-0', impersonating && 'pt-7')}>
            <Outlet />
          </main>
        </div>
      </div>
      <PaletteCommandes
        ouverte={palette}
        saisieInitiale={saisieInitiale}
        onFermer={() => { setPalette(false); setSaisieInitiale(undefined) }}
      />
      <BottomNav />
      <InstallPrompt />
      </TelephonieProvider>
    </SidebarProvider>
  )
}
