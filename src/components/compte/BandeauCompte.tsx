import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Building2, ChevronDown, History, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MesuresDuParc } from '@/lib/data/parcDuCompte'
import { CompteurAnime } from '@/components/dashboard/CompteurAnime'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE BANDEAU DE LA FICHE COMPTE — « C, AVEC LA COMPACITÉ DE A »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 14/09/2026, après avoir comparé trois directions dessinées : « Ok pour C, avec la
 * compacité de A. »
 *
 * ══ LE DÉFAUT QU'ON CORRIGE N'ÉTAIT PAS LA LAIDEUR ══
 *
 * L'ancien bandeau empilait neuf objets à la même altitude visuelle — flèche, marque, nom en 28 px,
 * trois pastilles, décompte d'adresses, hub de création, Supprimer, carte du propriétaire — puis les
 * onglets sur une bande séparée. Tout y était juste, rien n'y était hiérarchisé, et surtout RIEN NE
 * DISAIT DANS QUEL ÉTAT ÉTAIT LE COMPTE. On lisait un intitulé là où on pouvait lire une situation.
 *
 * ══ UNE LIGNE D'IDENTITÉ, PUIS QUATRE JAUGES ══
 *
 * La ligne d'identité prend la compacité de la direction A : hauteur de barre d'outils, nom en
 * 19 px et non 28, marque réduite à un jeton, tout sur une rangée. La rangée ainsi rendue est
 * dépensée en information plutôt qu'en blanc — c'est la direction C.
 *
 * Les quatre mesures VIENNENT DE L'ONGLET COMPTEURS, où elles étaient en héros de haut de page.
 * Elles n'y sont plus : les afficher aux deux endroits ferait lire deux fois le même chiffre, avec
 * le risque qu'ils divergent au premier correctif.
 *
 * ══ LA BANDE DISPARAÎT QUAND ELLE N'A RIEN À DIRE ══
 *
 * Un fournisseur ou un partenaire n'a pas de parc de compteurs : la bande y afficherait quatre
 * tirets. La condition porte sur le parc lui-même et non sur le type de compte — un client sans
 * aucun compteur est dans le même cas, et une règle qui suit la donnée vaut mieux qu'une règle qui
 * suit une étiquette.
 *
 * ══ CE QUI N'Y EST PAS, ET POURQUOI ══
 *
 * J'avais glissé le SIREN et la ville dans la ligne d'identité — une idée de la direction B, que
 * j'avais signalée dans la proposition mais que William n'a pas retenue en choisissant C.
 * Mélanger deux directions après un arbitrage, c'est reprendre d'une main ce qu'on a fait trancher
 * de l'autre : ils sont retirés, et restent dans l'onglet Détail.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * L'état replié survit à la navigation.
 *
 * Un tiroir qu'on referme et qui se rouvre à chaque fiche n'est pas un tiroir, c'est un ressort.
 * Le choix se garde donc dans le navigateur — et une lecture qui échoue (navigation privée,
 * stockage bloqué) n'empêche rien : on retombe sur « ouvert », l'état utile par défaut.
 */
const CLE_REPLI = 'kimatch.bandeau-compte.parc-replie'

/**
 * REPLIÉ PAR DÉFAUT — William, 14/09/2026 : « la barre est par défaut repliée ».
 *
 * On ouvre une fiche pour travailler dans un onglet, pas pour lire un tableau de bord. Les trois
 * mesures répondent à une question qu'on se pose de temps en temps, et la poignée est là pour ça.
 * Seul un choix explicite — noté dans le navigateur — la fait s'ouvrir.
 */
function lireRepli(): boolean {
  try {
    const garde = localStorage.getItem(CLE_REPLI)
    return garde === null ? true : garde === '1'
  } catch {
    return true
  }
}

/**
 * Une mesure du tiroir.
 *
 * ══ LE CHIFFRE SE DÉTACHE PAR SA PLACE, PAS PAR SA TAILLE ══
 *
 * William, 14/09/2026, sur la première version : « c'est trop haut et les chiffres ont un décalage
 * étrange et moche avec le reste du contenu […] je t'ai demandé plus gros certes, mais ça ne doit
 * pas être non plus déséquilibré. Si la grosseur n'est pas la solution, le design doit permettre
 * d'accentuer l'info pertinente. »
 *
 * Il avait raison sur les trois points, et ils avaient la même cause : j'empilais quatre lignes —
 * intitulé, nombre, barre, commentaire — dans une carte large aux trois quarts vide. Le nombre
 * grossissait pour compenser, et la carte montait.
 *
 * LA COMPOSITION EST DEVENUE HORIZONTALE. Le nombre occupe la gauche, ses qualificatifs se rangent
 * à sa droite sur deux petites lignes. La carte passe de quatre rangées à deux, la hauteur du
 * tiroir est presque divisée par deux, et la largeur enfin disponible sert à quelque chose.
 *
 * LE DÉCALAGE VENAIT DE L'ODOMÈTRE. `CompteurAnime` dessine ses chiffres dans des boîtes qui ont
 * leur propre hauteur ; aligné sur la même LIGNE DE BASE qu'un mot voisin, il flottait de quelques
 * pixels — le « compteurs » tombait sous le « 343 ». Le nombre a désormais sa propre colonne,
 * centrée sur la hauteur du bloc : plus de ligne de base commune, donc plus de décalage possible.
 *
 * ET 28 px SUFFISENT, parce que trois autres choses accentuent en même temps : la couleur, le rail
 * au bord, et le contraste de graisse avec deux lignes de 11 px juste à côté. Un chiffre isolé au
 * milieu du blanc n'a pas besoin d'être énorme pour être le premier lu.
 */
function Jauge({
  intitule,
  valeur,
  unite,
  detail,
  encre,
  rail,
  part,
}: {
  intitule: string
  valeur: number
  unite: string
  detail: string
  encre: string
  rail: string
  /** Entre 0 et 100 : la barre s'étire dans la largeur restante, au lieu de prendre une rangée. */
  part?: number
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col justify-center rounded-km-md bg-km-surface px-3.5 py-2"
      style={{ boxShadow: `inset 3px 0 0 0 ${rail}` }}
    >
      <p className="truncate text-km-tiny font-bold uppercase tracking-[0.09em] text-km-faint">{intitule}</p>

      <div className="mt-1 flex items-center gap-2.5">
        <CompteurAnime
          valeur={valeur}
          className="shrink-0 text-[28px] font-bold leading-none tracking-[-.045em]"
          style={{ color: encre }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-km-label font-semibold text-km-text">{unite}</p>
          <p className="truncate text-km-label text-km-muted">{detail}</p>
        </div>
        {/* LA BARRE PREND LA LARGEUR QUI RESTE au lieu d'une rangée à elle : c'est exactement la
            place qu'on venait de gagner, et une proportion se lit mieux en longueur. */}
        {part != null && (
          <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-km-soft xl:block">
            <div
              className="h-full rounded-full transition-[width] duration-[900ms] ease-out"
              style={{ width: `${Math.min(part, 100)}%`, background: encre }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function BandeauCompte({
  mesures,
  canManage,
  titre,
  pastilles,
  proprietaire,
  actionCreer,
  onRetour,
  onModifier,
  onSupprimer,
  onHistorique,
  onglets,
}: {
  mesures: MesuresDuParc
  canManage: boolean
  /** Le nom, éditable en place quand les droits le permettent — rendu par l'appelant. */
  titre: React.ReactNode
  /** Les pastilles de segment et de type, dont la logique de repli vit dans la fiche. */
  pastilles: React.ReactNode
  proprietaire: React.ReactNode
  /** Le hub de création, monté par la fiche qui connaît ses conditions d'accès. */
  actionCreer: React.ReactNode
  onRetour: () => void
  onModifier: () => void
  onSupprimer: () => void
  onHistorique: () => void
  onglets: React.ReactNode
}) {
  const geste = 'inline-flex h-8 items-center gap-1.5 rounded-km border px-2.5 text-km-label font-semibold transition-colors'

  const [menu, setMenu] = useState(false)
  const zoneMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const auClic = (e: MouseEvent) => {
      if (zoneMenu.current && !zoneMenu.current.contains(e.target as Node)) setMenu(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [menu])

  const [replie, setReplie] = useState(lireRepli)
  useEffect(() => {
    try { localStorage.setItem(CLE_REPLI, replie ? '1' : '0') } catch { /* sans conséquence */ }
  }, [replie])

  return (
    <div className="flex-none bg-km-surface">
      {/* ══ LA LIGNE D'IDENTITÉ ══ */}
      <div className="flex items-center gap-2.5 px-4 py-2 sm:px-[22px]">
        <button
          type="button"
          onClick={onRetour}
          title="Retour aux comptes"
          aria-label="Retour aux comptes"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-km text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* L'ICÔNE DE LA CHARTE, ET NON DES INITIALES. J'avais mis un monogramme pour distinguer
            deux fiches ouvertes côte à côte ; William, 14/09/2026 : « il faut reprendre l'icône du
            compte plutôt que les initiales ». Building2 sur le bleu du compte est l'objet « compte »
            partout dans le CRM — la reconnaître d'un écran à l'autre vaut mieux que distinguer deux
            onglets, et le nom est juste à côté pour ça. */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-km-md bg-gradient-to-br from-km-blue to-[#4f78ab] text-white">
          <Building2 className="h-4 w-4" />
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* LE NOM EN 23 px. Il était à 19 après la mise en compacité, ce qui l'aplatissait au
              niveau des boutons. C'est le titre de la fiche : il doit se lire d'un coup d'œil, et à
              deux mètres sur un écran partagé. */}
          <div className="min-w-0 truncate text-[23px] font-bold leading-tight tracking-[-.022em] text-km-text">{titre}</div>
          <div className="flex shrink-0 items-center gap-1.5">
            {pastilles}
            {/* ══ LA POIGNÉE EST À HAUTEUR DES CARTOUCHES ══
                William, 14/09/2026 : « la poignée doit être alignée horizontalement avec les
                cartouches syndic de copropriété et client par exemple ».

                Elle a d'abord été une languette sous le tiroir, puis le premier élément de la
                rangée des cartes — deux fois au mauvais endroit. Elle rejoint la LIGNE D'IDENTITÉ,
                juste après les deux cartouches, avec leur hauteur et leur rayon : elle se lit comme
                une troisième étiquette, celle qui s'ouvre.

                C'est aussi la seule place qui tient quand le tiroir est replié — et il l'est par
                défaut. Une commande qui doit survivre à la disparition de ce qu'elle commande ne
                peut pas vivre dedans. */}
            {mesures.total > 0 && (
              <button
                type="button"
                onClick={() => setReplie((v) => !v)}
                aria-expanded={!replie}
                title={replie ? 'Déplier les mesures du parc' : 'Replier les mesures du parc'}
                className={cn(
                  'inline-flex items-center gap-1 rounded-km border px-2 py-0.5 text-km-label font-semibold transition-colors',
                  replie
                    ? 'border-km-line bg-km-surface text-km-muted hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green'
                    : 'border-km-green-line bg-km-green-soft text-km-green',
                )}
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform duration-300', replie ? '' : 'rotate-180')} />
                Le parc
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {proprietaire}
          <span className="hidden h-4 w-px bg-km-line sm:block" />
          {canManage && (
            <button
              type="button"
              onClick={onModifier}
              title="Modifier la fiche"
              className={cn(geste, 'border-km-line bg-km-surface text-km-muted hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green')}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Modifier</span>
            </button>
          )}
          {actionCreer}

          {/* ══ LES DEUX GESTES RARES PASSENT DANS UN « ⋯ » ══
              William, 14/09/2026 : « garde le bouton créer et modifier et regroupe les boutons
              historique + supprimer dans un bouton récap ⋯ ».

              Ils ont en commun de ne pas s'utiliser en travaillant : on consulte l'historique quand
              on se pose une question, on supprime deux fois par an. Les laisser en permanence à
              côté de « Créer » leur donnait le même poids qu'un geste quotidien — et à Supprimer,
              une présence d'avertissement dont il n'a pas besoin. */}
          <div className="relative" ref={zoneMenu}>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-label="Autres actions"
              title="Autres actions"
              className={cn(geste, 'px-2', menu
                ? 'border-km-green bg-km-green-soft text-km-green'
                : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft')}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {menu && (
              <div className="absolute right-0 z-40 mt-1.5 w-56 animate-km-hub-pop overflow-hidden rounded-km-md border border-km-line bg-km-surface py-1 shadow-kw-panel">
                <button
                  type="button"
                  onClick={() => { setMenu(false); onHistorique() }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-km-body font-semibold text-km-text hover:bg-km-soft"
                >
                  <History className="h-3.5 w-3.5 text-km-muted" /> Historique des modifications
                </button>
                {canManage && (
                  <>
                    <div className="my-1 h-px bg-km-line-soft" />
                    <button
                      type="button"
                      onClick={() => { setMenu(false); onSupprimer() }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-km-body font-semibold text-km-red hover:bg-km-red-soft"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer ce compte
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ LE TIROIR DES MESURES ══
          William, 14/09/2026 : « le bandeau détail doit être rétractable », puis « quand je replie,
          absolument tout le drawer doit disparaître, je veux que ce soit complètement invisible ».

          REPLIÉ, IL N'EN RESTE QUE LA POIGNÉE. Pas de fond teinté, pas de ligne de résumé, pas de
          hauteur : la ligne d'identité touche les onglets comme s'il n'avait jamais existé. J'avais
          laissé un résumé d'une ligne pour qu'on n'oublie pas ce que le tiroir contient — c'était
          justement ce qui l'empêchait de disparaître.

          DÉPLIÉ, TROIS SIGNAUX LE DISTINGUENT DES ONGLETS :
          · le fond est creusé — teinte `km-soft` et ombre intérieure en haut, quand la ligne
            d'identité et les onglets sont sur du blanc ;
          · il n'a pas de bord bas, alors que les onglets en ont un — c'est ce bord qui porte
            l'onglet actif, et sans lui la bande ne peut pas être prise pour une navigation ;
          · la poignée est au milieu de son arête basse, à cheval sur la bordure : la convention du
            tiroir, qui dit dans quel sens ça bouge. Un chevron dans un coin aurait dit « menu ». */}
      {mesures.total > 0 && (
        <div
          className={cn(
            'transition-[background-color,box-shadow] duration-300',
            replie ? 'bg-transparent' : 'bg-km-soft shadow-[inset_0_7px_9px_-9px_rgb(20_40_32_/_.25)]',
          )}
        >
          <div className={cn('flex items-stretch px-4 sm:px-[22px]', replie ? 'h-0' : 'pb-2 pt-1.5')}>
            <div
              className={cn(
                'grid min-w-0 flex-1 transition-[grid-template-rows] duration-300 ease-out',
                replie ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
              )}
            >
              <div className="min-w-0 overflow-hidden">
                <div className="flex items-stretch gap-2">
                  <Jauge
                    intitule="Le parc"
                    valeur={mesures.total}
                    unite="compteurs"
                    encre="rgb(var(--km-text))"
                    rail="rgb(var(--km-blue))"
                    detail={`${Math.round(mesures.mwh).toLocaleString('fr-FR')} MWh · ${mesures.adresses} adresse${mesures.adresses > 1 ? 's' : ''}`}
                  />
                  <Jauge
                    intitule="Sous contrat"
                    valeur={mesures.penetration}
                    unite="% du parc"
                    encre="rgb(var(--km-green))"
                    rail="rgb(var(--km-green))"
                    part={mesures.penetration}
                    detail={`${mesures.clients} sur ${mesures.total} · ${Math.round(mesures.mwhClient).toLocaleString('fr-FR')} MWh`}
                  />
                  <Jauge
                    intitule="Échéances sous 12 mois"
                    valeur={mesures.douzeMois}
                    unite="compteurs"
                    encre={mesures.douzeMois > 0 ? 'rgb(var(--km-amber))' : 'rgb(var(--km-text))'}
                    rail="rgb(var(--km-amber))"
                    detail={
                      mesures.prochaine
                        ? `la première le ${new Date(mesures.prochaine).toLocaleDateString('fr-FR')}`
                        : 'aucune échéance à venir'
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ LES ONGLETS ══ */}
      {onglets}
    </div>
  )
}

