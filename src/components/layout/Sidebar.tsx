import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { X, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import kiweePicto from '@/assets/kiwee-picto.png'
import { useSidebar } from '@/lib/layout'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { useAuth } from '@/lib/auth'
import { navItems, cycleNavItems, productionNavItems, bottomNavItems } from '@/lib/navItems'
import type { NavItem } from '@/lib/navItems'
import { getImpersonationInfo } from '@/lib/data/impersonation'


/**
 * L'INTITULÉ D'UNE RUBRIQUE — Pilotage, Cycle commercial, Production.
 *
 * Ils remplacent les filets qui séparaient les groupes. Un filet dit « ces entrées vont ensemble » ;
 * un intitulé dit POURQUOI, et c'est ce que l'architecture de Michel cherche à faire passer : le
 * pilotage n'est pas le cycle commercial, et la production vient après les deux.
 *
 * Le premier n'a pas de marge haute : il touche le sommet du rail, où il n'a rien à séparer.
 */
function Rubrique({ children }: { children: string }) {
  return (
    /* L'AIR SE MET AU-DESSUS, PAS AUTOUR. Naoëlle : « mets des espaces entre les titres
       interligne ». Un intitulé séparé également en haut et en bas flotte entre deux groupes sans
       dire auquel il appartient. Une grande marge devant et une petite derrière le COLLENT aux
       entrées qu'il annonce : c'est ce qui fait lire trois groupes au lieu d'une liste.
       L'interligne du titre lui-même ne bouge pas — elle l'a demandé explicitement. */
    <p className="mb-1 mt-6 px-2.5 text-km-tiny font-bold uppercase tracking-[0.09em] text-km-side-faint first:mt-1">
      {children}
    </p>
  )
}

function SidebarLink({ to, label, icon: Icon, end, onClick }: NavItem & { onClick: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          /* La police des entrées descend de 14 à 13 px (« réduis leur police un peu »), et le
             rembourrage vertical monte de 7 à 8 px : c'est ce couple qui aère. Réduire seule la
             police aurait resserré la liste au lieu de la détendre. */
          'group relative flex items-center gap-2.5 rounded-km py-2 pl-2 pr-2.5 text-km-body transition-colors',
          'md:px-2.5',
          /* LA BARRE PASSE DU SOMBRE AU CLAIR — maquette de Michel du 31/08/2026. C'etait le
             changement le plus visible de sa refonte : le rail `ink-950` devient un fond
             `km-side` en degrade, et l'entree active n'est plus un pave vert mais un fond
             `km-green-soft` avec l'icone seule en vert.

             Le sens y gagne : le vert ne sert plus a remplir une pastille, il ne marque plus que
             la selection — c'est la regle de son dossier, « le vert KiWee reserve aux actions
             positives, selections et reperes importants ». */
          /* ══ LE FOND VERT DE L'ONGLET COURANT, ET POURQUOI IL ÉTAIT INVISIBLE ══
             Naoëlle, 31/08/2026 : « j'aimerais bien qu'il y ait un fond vert clair transparent sur
             l'onglet sur lequel je me trouve ». Il y EN AVAIT un — `km-green/18` — mais on ne le
             voyait pas, et le calcul dit pourquoi : le vert de marque #0D7A5F est SOMBRE, alors
             mélangé à 18 % dans un rail déjà sombre il rend rgb(30,55,47), soit un écart de 1,17
             avec le fond. En dessous de 1,3, l'œil ne distingue plus un bloc de son support.
             Sur fond clair, diluer une couleur l'éclaircit ; sur fond sombre, diluer une couleur
             SOMBRE ne fait presque rien. Il faut donc partir du vert CLAIR de la palette.
             `kiwi-300` #5FAE8F à 20 % rend rgb(46,66,58) — écart 1,42, franchement visible — et le
             libellé y garde un contraste de 9,3. L'icône passe au vert clair : deux signaux, dont
             un seul est une couleur de fond. */
          isActive
            ? 'bg-kiwi-300/20 font-semibold text-km-side-text'
            : 'text-km-side-muted hover:bg-white/[0.055] hover:text-km-side-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* UNE SEULE TEINTE AU REPOS. Chaque entree portait sa couleur (rouge, rose, ambre,
              emeraude...) : onze teintes saturees dans un rail de 56 px de large. La couleur ne dit
              plus quel objet mais ou l'on se trouve, comme chez William. */}
          <span className="flex w-[17px] shrink-0 items-center justify-center">
            {/* Le vert de marque est trop sombre sur l'anthracite : c'est sa version claire qui
                garde le contraste sans changer de teinte. */}
            <Icon className={cn('h-4 w-4', isActive ? 'text-kiwi-300' : 'text-km-side-faint')} />
          </span>
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
          {/* PLUS D'INFO-BULLE : elle disait le libellé quand le rail était replié, et le libellé
              est maintenant écrit à côté de l'icône. La garder ferait apparaître au survol un texte
              déjà lisible, ce qui n'informe pas et masque la ligne voisine. */}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { open, close } = useSidebar()
  const isAdmin = useIsAdmin()
  const { session } = useAuth()
  const { data: profil } = useMonProfil()
  // Support/Paramètres (et Administration pour les admins) sont séparés des objets métier
  // ci-dessus : regroupés en bas du rail, juste au-dessus du profil.
  const bottomItems: NavItem[] = isAdmin
    ? [...bottomNavItems, { to: '/administration', label: 'Administration', icon: ShieldCheck }]
    : bottomNavItems
  // Les deux dégradés ne s'affichent que s'il reste quelque chose à voir de ce côté-là. Recalculés
  // au défilement, au redimensionnement, et quand le nombre d'entrées change — c'est ce dernier cas
  // qui compte : ajouter un objet ne doit rien casser.
  const barre = useRef<HTMLElement | null>(null)
  const [haut, setHaut] = useState(false)
  const [bas, setBas] = useState(false)

  const majDegrades = useCallback(() => {
    const el = barre.current
    if (!el) return
    setHaut(el.scrollTop > 2)
    setBas(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }, [])

  useEffect(() => {
    majDegrades()
    window.addEventListener('resize', majDegrades)
    return () => window.removeEventListener('resize', majDegrades)
  }, [majDegrades, isAdmin])

  const initiales = profil
    ? `${profil.prenom[0] ?? ''}${profil.nom[0] ?? ''}`.toUpperCase()
    : (session?.user.email ?? 'KW').slice(0, 2).toUpperCase()
  const impersonating = Boolean(getImpersonationInfo())

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed left-0 z-50 flex flex-col overflow-hidden border-r border-km-side-line bg-gradient-to-b from-km-side to-km-side-bas transition-transform duration-200 ease-out',
          impersonating ? 'top-7 bottom-0' : 'inset-y-0',
          /* LE RAIL EST DÉPLIÉ, LIBELLÉS VISIBLES. Naoëlle, 27/08/2026 : « maintenant on va mettre
             les noms de chaque logo ». Il faisait 56 px depuis toujours, ce qui obligeait à
             reconnaître onze pictogrammes ou à survoler chacun pour lire son info-bulle.

             215 PX, la largeur de sa maquette (215 de barre + le reste fluide). L'application
             gardera une largeur fluide : c'est la barre qui est fixe, pas le contenu. */
          'w-64 md:w-[215px] md:overflow-visible',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* ══ L'IDENTITÉ REMONTE ICI ══
            Naoëlle, 27/08/2026 : « enlève le logo Kimatch de la fenêtre principale en haut et
            place-le au-dessus du menu de gauche, ça désengorge la fenêtre et ça remplit le haut du
            menu tout vide. » Le rail portait un picto de 28 px centré dans une bande vide.

            LE LOGO N'EST PAS L'IMAGE, C'EST DU TEXTE, et c'est délibéré : `kimatch-logo.png` est un
            lettrage NOIR sur fond transparent, donc invisible sur ce fond `ink-950`. L'inverser en
            CSS aurait rendu le mot lisible mais retourné le kiwi vert en magenta. Le picto en
            couleur plus le nom en blanc donnent la même identité, nette à toute taille, et
            respectent le code couleur de Kimatch — sa consigne du même jour.

            Le bloc existait déjà pour le menu mobile : il perd seulement son `md:hidden`. */}
        {/* LE LETTRAGE SUIT LE FOND DU RAIL. Il a été blanc quand le rail était noir, puis
            `km-text` quand Michel l'a voulu clair, et il redevient clair maintenant qu'il est
            anthracite. C'est précisément pour ne plus faire ce va-et-vient à la main que les trois
            niveaux de texte du rail ont leurs propres jetons : ils suivent le fond, pas la page. */}
        <div className="flex items-center gap-2.5 px-3 pb-4 pt-4">
          <img src={kiweePicto} alt="KiWee" className="h-[26px] w-[26px] shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap font-display text-km-name font-bold leading-none tracking-[-0.02em] text-km-side-text">Kimatch</p>
            <p className="mt-1 whitespace-nowrap text-km-tiny uppercase tracking-[0.08em] text-km-side-faint">Conseil énergie</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-km p-1.5 text-km-side-muted hover:bg-white/[0.055] hover:text-km-side-text md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* LA BARRE DEFILE, ET LES DEGRADES LE DISENT. Sans eux on ne devine pas qu'il reste des
            entrees hors champ : la derniere visible a l'air d'etre la derniere. Ils n'apparaissent
            que du cote ou il reste quelque chose. */}
        <div className="relative min-h-0 flex-1">
          {haut && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-km-side to-transparent" />
          )}
          <nav
            ref={barre}
            onScroll={majDegrades}
            className="h-full space-y-0.5 overflow-y-auto overflow-x-hidden px-2.5 py-1"
          >
            {/* PILOTAGE réunit le portefeuille ET le cycle commercial. L'intitulé « Cycle
                commercial » a été retiré le 31/08/2026 : sur onze entrées, trois titres donnaient
                un rythme d'un titre pour trois lignes, et le rail se lisait comme une table des
                matières. L'ordre des entrées, lui, ne change pas — il raconte toujours la chaîne. */}
            <Rubrique>Pilotage</Rubrique>
            {[...navItems, ...cycleNavItems].map((item) => (
              <SidebarLink key={item.to} {...item} onClick={close} />
            ))}
            <div className="h-4" aria-hidden="true" />
            <Rubrique>Production</Rubrique>
            {productionNavItems.map((item) => (
              <SidebarLink key={item.to} {...item} onClick={close} />
            ))}
          </nav>
          {bas && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-km-side-bas to-transparent" />
          )}
        </div>

        <nav className="space-y-0.5 border-t border-km-side-line px-2.5 py-2.5">
          {bottomItems.map((item) => (
            <SidebarLink key={item.to} {...item} onClick={close} />
          ))}
        </nav>

        <NavLink
          to="/profil"
          onClick={close}
          className="group relative flex items-center gap-2.5 border-t border-km-side-line px-3 py-3 transition-colors hover:bg-white/[0.045]"
        >
          {profil?.photo_url ? (
            <img src={profil.photo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-km-green/20 text-km-label font-bold text-kiwi-300">
              {initiales}
            </div>
          )}
          <p className="min-w-0 flex-1 truncate whitespace-nowrap text-km-label text-km-side-muted">
            KiWee Énergie
          </p>

        </NavLink>
      </aside>
    </>
  )
}
