import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronUp, LogOut, Search, ShieldCheck, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import kiweePicto from '@/assets/kiwee-picto.png'
import { useSidebar } from '@/lib/layout'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { useAuth } from '@/lib/auth'
import { raccourci } from '@/lib/raccourci'
import { navItems, cycleNavItems, productionNavItems, cockpitNavItems, bottomNavItems } from '@/lib/navItems'
import { PastilleNotifications } from '@/components/layout/PastilleNotifications'
import type { NavItem } from '@/lib/navItems'
import { getImpersonationInfo } from '@/lib/data/impersonation'
import { PopupNouveautes } from '@/components/nouveautes/PopupNouveautes'
import { useNouveautesNonLues } from '@/lib/data/publications'


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

/**
 * L'HABILLAGE D'UNE LIGNE DU RAIL, écrit une fois.
 *
 * Il était inscrit dans `SidebarLink` seul, ce qui allait tant que toutes les entrées étaient des
 * liens. « Nouveautés » n'en est pas un — elle ouvre une fenêtre — et recopier ces classes dans un
 * second composant aurait fait diverger les deux au premier ajustement d'interligne, sur deux
 * lignes voisines du même rail.
 */
const LIGNE_RAIL =
  'group relative flex items-center gap-2.5 rounded-km py-2 pl-2 pr-2.5 text-km-body transition-colors md:px-2.5'
const LIGNE_RAIL_ACTIVE = 'bg-kiwi-300/20 font-semibold text-km-side-text'
const LIGNE_RAIL_REPOS = 'text-km-side-muted hover:bg-white/[0.055] hover:text-km-side-text'

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
          LIGNE_RAIL,
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
          isActive ? LIGNE_RAIL_ACTIVE : LIGNE_RAIL_REPOS,
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

/**
 * « NOUVEAUTÉS » OUVRE UNE FENÊTRE, PAS UNE PAGE — et porte le compte de ce qui n'est pas lu.
 *
 * LA PASTILLE EST UN NOMBRE, PAS UN POINT. Un point dit « il s'est passé quelque chose » ; le
 * nombre dit s'il faut cinq secondes ou cinq minutes. C'est la différence entre une notification
 * qu'on ouvre et une notification qu'on remet à plus tard indéfiniment.
 *
 * Elle s'éteint dès l'ouverture de la fenêtre, sans attendre sa fermeture : la lecture est
 * enregistrée à ce moment-là, et le rail lit le même compte que la fenêtre.
 */
function BoutonNouveautes({
  label,
  icon: Icon,
  onOuvrir,
}: {
  label: string
  icon: NavItem['icon']
  onOuvrir: () => void
}) {
  const { pathname } = useLocation()
  const nonLues = useNouveautesNonLues()
  // La page d'historique existe : quand on y est, l'entrée s'allume comme n'importe quelle autre.
  const actif = pathname === '/nouveautes'

  return (
    <button
      type="button"
      onClick={onOuvrir}
      className={cn(LIGNE_RAIL, 'w-full text-left', actif ? LIGNE_RAIL_ACTIVE : LIGNE_RAIL_REPOS)}
    >
      <span className="flex w-[17px] shrink-0 items-center justify-center">
        <Icon className={cn('h-4 w-4', actif ? 'text-kiwi-300' : 'text-km-side-faint')} />
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap">{label}</span>
      {nonLues.length > 0 && (
        <span
          /* Le vert CLAIR de la palette, pas le vert de marque : sur ce rail anthracite, #0D7A5F
             rend une pastille qu'on ne distingue pas du fond — c'est le calcul fait pour l'entrée
             active, quelques lignes plus haut. Texte sombre sur fond clair, l'inverse du reste. */
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-km-pill bg-kiwi-300 px-1 text-km-tiny font-bold tabular-nums text-ink-950"
          aria-label={`${nonLues.length} nouveauté${nonLues.length > 1 ? 's' : ''} non lue${nonLues.length > 1 ? 's' : ''}`}
        >
          {nonLues.length > 9 ? '9+' : nonLues.length}
        </span>
      )}
    </button>
  )
}

export function Sidebar({ onRechercher }: { onRechercher: () => void }) {
  const { open, close } = useSidebar()
  const { signOut } = useAuth()
  const [menuProfil, setMenuProfil] = useState(false)
  const [popupNouveautes, setPopupNouveautes] = useState(false)
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
            {/* ══ LA RECHERCHE OUVRE LE RAIL ══
                La barre du haut a été supprimée le 16/09/2026 : elle coûtait 52 px de hauteur sur
                42 écrans pour un fil d'Ariane qui doublait déjà le bandeau des fiches. La loupe
                descend ici, où la largeur est DÉJÀ payée — le rail fait 215 px quoi qu'il arrive,
                alors qu'une barre horizontale prend de la hauteur sur toute la page.

                ELLE EST EN PREMIÈRE POSITION, au-dessus de PILOTAGE : c'est le geste le plus
                fréquent de la journée, et il n'appartient à aucune rubrique. Elle annonce le
                raccourci, parce qu'une entrée de menu est justement l'endroit où l'on apprend qu'il
                y a plus rapide. */}
            <button
              type="button"
              onClick={() => { close(); onRechercher() }}
              className={cn(LIGNE_RAIL, LIGNE_RAIL_REPOS, 'w-full')}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                <Search className="h-4 w-4 text-km-side-faint" />
              </span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">Rechercher</span>
              <span className="shrink-0 rounded-km-sm border border-km-side-line px-1 font-mono text-km-tiny text-km-side-faint">
                {raccourci('K')}
              </span>
            </button>

            <div className="my-1.5 h-px bg-km-side-line" />

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
            {/* LE COCKPIT, DERNIÈRE ENTRÉE DU RAIL, sans rubrique et détaché des autres : ce n'est
                pas un objet de plus, c'est une façon de passer sa journée (voir `cockpitNavItems`). */}
            <div className="h-4" aria-hidden="true" />
            {cockpitNavItems.map((item) => (
              <SidebarLink key={item.to} {...item} onClick={close} />
            ))}
          </nav>
          {bas && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-km-side-bas to-transparent" />
          )}
        </div>

        <nav className="space-y-0.5 border-t border-km-side-line px-2.5 py-2.5">
          {bottomItems.map((item) =>
            item.to === '/nouveautes' ? (
              <BoutonNouveautes
                key={item.to}
                label={item.label}
                icon={item.icon}
                onOuvrir={() => {
                  close()
                  setPopupNouveautes(true)
                }}
              />
            ) : (
              <SidebarLink key={item.to} {...item} onClick={close} />
            ),
          )}
        </nav>

        {/* ══ LA DÉCONNEXION EST SOUS LE PROFIL ══
            William, 16/09/2026 : « Déconnexion doit s'afficher quand on clique sur son profil (tout
            en bas à gauche) ». Elle était dans la barre du haut, en permanence, à côté du bouton de
            création — c'est-à-dire qu'un geste qu'on fait une fois par jour occupait la même
            altitude qu'un geste qu'on fait quarante fois.

            LE BLOC DEVIENT UN BOUTON ET NON PLUS UN LIEN. « Mon profil » reste la première ligne du
            menu : on ne perd pas l'accès, on le déplace d'un cran. */}
        <div className="relative border-t border-km-side-line">
          <button
            type="button"
            onClick={() => setMenuProfil((v) => !v)}
            aria-expanded={menuProfil}
            className="group relative flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-white/[0.045]"
          >
            {profil?.photo_url ? (
              <img src={profil.photo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-km-green/20 text-km-label font-bold text-kiwi-300">
                {initiales}
              </div>
            )}
            <p className="min-w-0 flex-1 truncate whitespace-nowrap text-km-label text-km-side-muted">
              {profil ? `${profil.prenom} ${profil.nom}`.trim() || 'Mon profil' : 'Mon profil'}
            </p>
            <ChevronUp className={cn('h-3.5 w-3.5 shrink-0 text-km-side-faint transition-transform', menuProfil ? '' : 'rotate-180')} />
          </button>

          {menuProfil && (
            /* Il s'ouvre VERS LE HAUT : le bloc est collé au bas de l'écran, un menu vers le bas
               sortirait de la fenêtre. */
            <div className="absolute inset-x-2 bottom-full z-30 mb-1 overflow-hidden rounded-km-md border border-km-side-line bg-km-side py-1 shadow-kw-panel">
              <NavLink
                to="/profil"
                onClick={() => { setMenuProfil(false); close() }}
                className="flex items-center gap-2.5 px-3 py-2 text-km-label text-km-side-muted transition-colors hover:bg-white/[0.055] hover:text-km-side-text"
              >
                <User className="h-3.5 w-3.5" /> Mon profil
              </NavLink>
              <button
                type="button"
                onClick={() => { setMenuProfil(false); void signOut() }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-km-label text-km-side-muted transition-colors hover:bg-white/[0.055] hover:text-km-side-text"
              >
                <LogOut className="h-3.5 w-3.5" /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </aside>

      <PopupNouveautes open={popupNouveautes} onClose={() => setPopupNouveautes(false)} />
      {/* LA CLOCHE N'EST PLUS UNE LIGNE DE MENU — elle est posée à côté du téléphone, en bas à
          gauche, et s'ouvre en volet à droite. Voir `PastilleNotifications`. */}
      <PastilleNotifications />
    </>
  )
}
