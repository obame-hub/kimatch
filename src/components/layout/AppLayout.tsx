import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { InstallPrompt } from '@/components/layout/InstallPrompt'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { BanniereRappels } from '@/components/layout/BanniereRappels'
import { DocusignBanner } from '@/components/layout/DocusignBanner'
import { GmailBanner } from '@/components/layout/GmailBanner'
import { SidebarProvider } from '@/lib/layout'
import { TelephonieProvider } from '@/lib/telephonie'
import { getImpersonationInfo } from '@/lib/data/impersonation'
import { useEstPartenaire } from '@/lib/data/roles'
import { PaletteCommandes } from '@/components/layout/PaletteCommandes'
import { estUneSaisie, ouvertureDemandee } from '@/lib/raccourci'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const impersonating = Boolean(getImpersonationInfo())

  /* ══════════════════════════════════════════════════════════════════════════════════════════
   * L'ESPACE PARTENAIRE N'OUVRE PAS LES ÉCRANS DE KIWEE — 24/09/2026
   * ══════════════════════════════════════════════════════════════════════════════════════════
   *
   * Naoëlle : « il n'est pas censé voir ni cockpit ni piste, affiche seulement ce dont il a besoin ».
   *
   * RETIRER L'ENTRÉE DU RAIL NE SUFFIT PAS. Éprouvé à l'écran : le rail était bien réduit à deux
   * entrées, et la page d'accueil affichait quand même la vue d'ensemble de KiWee — « Appels à
   * passer », « Pistes à relancer », « Charge à venir ». Des compteurs à zéro, mais des compteurs
   * qui ne le regardent pas, et qui laissent croire que Kimatch est en panne.
   *
   * L'AIGUILLAGE VIT ICI ET NON DANS LES ROUTES : un seul point de passage, donc une seule chose à
   * tenir à jour. Une route ajoutée demain sera couverte sans qu'on y pense — et l'oubli, dans ce
   * sens-là, ouvrirait un écran interne à un externe.
   *
   * CE N'EST PAS LA SÉCURITÉ, et il ne faut pas s'y tromper : ce sont les policies qui protègent
   * les données (migration 20260924143000). Ceci évite d'AFFICHER ce qui ne le concerne pas.
   * ══════════════════════════════════════════════════════════════════════════════════════════ */
  const estPartenaire = useEstPartenaire()
  const { pathname } = useLocation()
  /* CE QU'IL A LE DROIT D'OUVRIR. Tout le reste le ramène à ses recommandations — y compris la
     racine, dont la vue d'ensemble ne parle que de KiWee. */
  const ouvertAuPartenaire = [
    '/recommandations', '/patrimoine', '/comptes', '/contacts', '/compteurs',
    '/mandats', '/contrats', '/nouveautes', '/profil',
  ]
  const autorise = ouvertAuPartenaire.some((d) => pathname === d || pathname.startsWith(d + '/'))

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

  if (estPartenaire && !autorise) return <Navigate to="/recommandations" replace />

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
        {/* LE RAPPEL À L'HEURE, AU-DESSUS DE TOUT LE RESTE. Il pousse le contenu comme les deux
            autres bandeaux, il ne recouvre rien — et il ne paraît pas dans le Cockpit, qui a le
            sien et qui en fait davantage. */}
        <BanniereRappels />
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
          {/* ══ LA BANDE DU BAS EST PARTIE AVEC LES DEUX PASTILLES (William, 18/09/2026) ══

              `md:pb-20` réservait 80 px sous chaque page pour que la dernière carte ne passe pas
              sous la pastille d'appel et la cloche. Les deux ont quitté le bas de l'écran le
              18/09 — l'appel parce qu'« un commercial va cliquer sur un numéro, jamais ouvrir le
              téléphone pour composer », les notifications parce qu'elles sont redevenues une ligne
              du menu. Il ne reste rien à éviter : la marge est donc du vide pur, et c'est
              exactement la bande que William a signalée deux fois comme « l'écran est coupé en bas ».

              `pb-32` RESTE SUR MOBILE, et pour une autre raison : `BottomNav` y est une vraie barre
              fixée, en `md:hidden`. Sans cette marge, la dernière ligne d'une liste passerait
              dessous. Le `md:pb-0` annule donc la seule moitié qui n'a plus d'objet.

              `has-[[data-pleine-hauteur]]:pb-0` survit pour le mobile, pour la raison du
              15/09/2026 : une fiche ne défile pas dans `main`, elle prend toute la hauteur et fait
              défiler ses volets — une marge basse la RACCOURCIT au lieu de la protéger. */}
          <main className={cn('min-w-0 flex-1 overflow-y-auto pb-32 md:pb-0 md:pl-[215px] has-[[data-pleine-hauteur]]:pb-0', impersonating && 'pt-7')}>
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
