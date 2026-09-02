import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * L'EN-TÊTE D'UN ÉCRAN DE LISTE, refait d'après la maquette de Michel (31/08/2026).
 *
 * Son modèle commun des pages de liste, mot pour mot :
 *
 *   « En-tête : nom de la page, phrase explicative et une action principale au maximum. »
 *
 * D'où ce qui a disparu de cet en-tête, et pourquoi :
 *
 * LA PASTILLE COLORÉE DE L'OBJET. Chaque écran s'ouvrait sur une pastille au dégradé de sa famille
 * — bleu pour le compte, violet pour le contact, magenta pour l'opportunité. C'était la convention
 * de William. Michel réserve la couleur au SENS MÉTIER : « le vert KiWee réservé aux actions
 * positives, sélections et repères importants ». Une pastille décorative par écran dépense la
 * couleur avant d'avoir rien dit.
 *
 * LE TOTAL COLLÉ AU TITRE reste : c'est une information, pas une décoration, et il répond à la
 * demande de Michel du 26/08 (« le total près du titre de page »). Il passe simplement dans sa
 * palette — fond vert pâle, texte vert.
 *
 * Le titre est en 28 px, la seule taille de sa maquette reprise telle quelle. Il descend à 22 px
 * sur les petits écrans : 28 px sur 375 px de large mange deux lignes à lui seul.
 */
export function PageHeader({ title, description, actions, badge, badgeLibelle, titreMasque }: {
  title: string
  description?: string
  actions?: ReactNode
  /**
   * LE TITRE EXISTE MAIS NE S'AFFICHE PAS.
   *
   * Une liste montée dans un onglet de Patrimoine écrivait son nom deux fois : dans l'onglet actif
   * — « Comptes », souligné de vert — et juste en dessous, en 24 px. Deux fois le même mot à
   * quarante pixels d'écart, sur les sept onglets.
   *
   * Il est MASQUÉ, pas supprimé : le titre reste dans le document pour les lecteurs d'écran et pour
   * la hiérarchie des niveaux de titre, que le retirer casserait.
   */
  titreMasque?: boolean
  /**
   * Le total de la page, déjà formaté, unité comprise : l'en-tête ne sait pas s'il annonce des
   * euros ou des GWh. Collé au titre et non posé au-dessus, parce que c'est le titre qu'il
   * qualifie — « Recommandations, 132 800 € » se lit d'un trait.
   */
  badge?: string
  /** Ce que le total mesure — « Marge totale », « Consommation totale ». */
  badgeLibelle?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* -0,04 em, c'etait le « trop rapproche » : a cette valeur les lettres d'un titre de
              28 px se touchent presque, et le mot devient un bloc au lieu d'une suite de lettres.
              Le resserrement vit maintenant dans l'echelle (-0,022 em sur km-h1), pose une fois pour
              toute l'application au lieu d'etre reecrit ici.
              La graisse descend de 570 a 540 : c'etait le « grossier ». Inter a 570 sur un titre de
              28 px donne un gras publicitaire ; 540 garde l'autorite sans l'epaisseur. */}
          <h2
            className={
              titreMasque
                ? 'sr-only'
                : 'font-display text-km-metric font-[540] text-km-text sm:text-km-h1'
            }
          >
            {title}
          </h2>
          {badge && (
            <span className="inline-flex shrink-0 items-baseline gap-1.5 rounded-km-pill bg-km-green-soft px-2.5 py-1">
              {badgeLibelle && (
                <span className="text-km-label font-semibold uppercase tracking-[0.05em] text-km-green/70">
                  {badgeLibelle}
                </span>
              )}
              <span className="text-km-body font-bold tabular-nums text-km-green">
                {badge}
              </span>
            </span>
          )}
        </div>
        {description && <p className="mt-1.5 max-w-[76ch] text-km-lead text-km-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * LES INDICATEURS D'UNE PAGE, « quatre mesures maximum, uniquement si elles servent la décision ».
 *
 * Le nombre est plafonné à quatre DANS LE CODE et non laissé à la vigilance de chaque écran : une
 * règle qui repose sur le fait que personne ne l'oublie n'est pas une règle. Un cinquième
 * indicateur est ignoré, et la console le dit en développement.
 *
 * LE PREMIER PORTE UN LISERÉ VERT EN HAUT — c'est le détail de sa maquette (`.km-metric:first-child`)
 * qui fait qu'on sait où commencer à lire. Il désigne la mesure qui compte le plus, et l'ordre
 * dans lequel l'écran les passe devient donc une décision, pas un hasard.
 */
export function Indicateurs({ mesures }: {
  mesures: { libelle: string; valeur: string; precision?: string }[]
}) {
  if (mesures.length === 0) return null

  if (import.meta.env.DEV && mesures.length > 4) {
    console.warn(
      `Indicateurs : ${mesures.length} mesures fournies, les 4 premières seulement sont affichées. ` +
        '« Quatre mesures maximum, uniquement si elles servent la décision » — dossier du 31/08/2026.',
    )
  }

  /* LA GRILLE SUIT LE NOMBRE DE MESURES. Elle était figée à quatre colonnes : une page qui n'en
     fournit que trois — le tableau de bord depuis le retrait des signaux, le 02/09/2026 — laissait
     une quatrième case vide à droite, qui se lit comme un chiffre qui n'a pas chargé. */
  const colonnes = mesures.length >= 4 ? 'lg:grid-cols-4' : mesures.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'

  return (
    <div className={cn('mb-5 grid grid-cols-2 gap-2.5', colonnes)}>
      {mesures.slice(0, 4).map((m, i) => (
        <div
          key={m.libelle}
          className={cn(
            'min-h-[68px] rounded-km-lg border border-km-line bg-km-surface/80 px-3.5 py-3 shadow-km-metric',
            i === 0 && 'shadow-[inset_0_2px_0_rgb(var(--km-green)),0_3px_12px_rgba(25,40,33,.035)]',
          )}
        >
          {/* LE LIBELLÉ EST UNE ÉTIQUETTE, PAS UNE PHRASE. Il était à la taille du texte courant,
              donc aussi présent que le chiffre qu'il annonce, et la tuile n'avait qu'un seul
              niveau. En capitales espacées et plus petit, il recule et laisse le chiffre porter. */}
          <p className="text-km-tiny font-semibold uppercase tracking-[0.07em] text-km-faint">{m.libelle}</p>
          <strong className="mt-1.5 block text-km-metric font-[580] tabular-nums text-km-text">
            {m.valeur}
          </strong>
          {m.precision && <small className="mt-1 block text-km-label text-km-faint">{m.precision}</small>}
        </div>
      ))}
    </div>
  )
}
