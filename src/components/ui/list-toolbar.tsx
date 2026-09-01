import { Check, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/form'
import { cn } from '@/lib/utils'

/**
 * LA BARRE DE TRAVAIL D'UN ÉCRAN DE LISTE, refaite d'après la maquette de Michel (31/08/2026).
 *
 * Son modèle commun : « Barre de travail : recherche, filtres utiles et bascule Mes dossiers /
 * Équipe. »
 *
 * Trois choses s'y jouent, dans cet ordre de lecture :
 *
 *   à gauche   la recherche, toujours au même endroit sur les seize listes
 *   au milieu  ce que l'écran ajoute — bascule de périmètre, tri, filtres
 *   à droite   le nombre de résultats
 *
 * LE COMPTE EST À DROITE, ET C'EST DÉLIBÉRÉ. Il change à chaque frappe : posé à côté du champ, il
 * ferait bouger la mise en page sous les doigts de celui qui tape. À l'autre bout de la barre, il
 * se lit quand on le cherche et ne gêne pas quand on l'ignore.
 *
 * La barre passe à la ligne sur petit écran plutôt que de comprimer le champ de recherche : un
 * champ de 80 px de large ne sert à personne.
 */
/**
 * LA HAUTEUR ET L'ARRONDI DE TOUS LES CONTRÔLES DE LA BARRE.
 *
 * Naoëlle, 31/08/2026, capture à l'appui : « c'est encore le bordel, c'est vraiment pas beau ».
 * Elle a raison, et la cause est structurelle : la barre alignait quatre contrôles issus de DEUX
 * systèmes de jetons. Le champ de recherche en `km-*` (34 px de haut, rayon 8 px, bordure
 * `km-line`), la bascule de périmètre en `kw-*` (rayon `kw-md`, fond `kw-muted`), le sélecteur de
 * tri en `kw-*` aussi mais en 36 px avec `border-km-line`, et la case d'option recopiée
 * en dur sur chaque page. Quatre hauteurs, quatre rayons, trois bordures, sur une seule ligne.
 *
 * Aucun réglage de police ne rattrape ça : ce que l'œil lit comme « pas soigné », c'est
 * l'alignement rompu. D'où cette constante unique, importée par les trois contrôles partagés.
 */
export const CONTROLE_BARRE =
  'h-[32px] shrink-0 rounded-km border text-km-label font-semibold transition-colors'

/**
 * UNE OPTION À COCHER DANS LA BARRE — « inclure les dossiers clos », « inclure les refusées ».
 *
 * Elle était recopiée à la main sur quatre pages, avec à chaque fois une variante de padding et de
 * taille de texte. Une copie par écran, c'est un écart par écran.
 */
export function BasculeOption({ actif, onChange, libelle }: {
  actif: boolean
  onChange: (v: boolean) => void
  libelle: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!actif)}
      aria-pressed={actif}
      className={cn(
        CONTROLE_BARRE,
        'inline-flex items-center gap-1.5 px-2.5',
        actif
          ? 'border-km-green bg-km-green text-white'
          : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft',
      )}
    >
      <span
        className={cn(
          'flex h-3.5 w-3.5 items-center justify-center rounded-[3px]',
          actif ? 'bg-white/25' : 'border border-km-line',
        )}
      >
        {actif && <Check className="h-2.5 w-2.5" />}
      </span>
      {libelle}
    </button>
  )
}

/**
 * UNE BASCULE ENTRE DEUX OU TROIS ÉTATS EXCLUSIFS — l'axe d'un tableau, le mode d'un écran.
 *
 * Naoëlle, 01/09/2026 : « deux vues kanban en mode toggle ». Le dessin est celui de
 * `BasculePerimetre`, qui existait depuis le 28/08 pour « Mes dossiers / Tous » : un rail creux, un
 * segment plein sur le choix actif. Le reprendre plutôt que d'inventer une seconde apparence pour le
 * même geste, c'est ce qui évite les quatre hauteurs et trois rayons sur une même ligne que Naoëlle
 * a photographiés le 31/08.
 *
 * PAS DE `MenuChoix` ICI, ET C'EST LA RÈGLE HABITUELLE : deux choix se montrent, ils ne se cachent
 * pas derrière un clic. On voit d'un coup d'œil qu'une autre vue existe — un menu fermé, non.
 *
 * `radiogroup` PLUTÔT QUE DES BOUTONS PRESSÉS : ces segments sont exclusifs, et c'est ce qu'un
 * lecteur d'écran doit entendre — « 1 sur 2 sélectionné », pas « bouton enfoncé » deux fois.
 */
export function BasculeSegments({
  valeur,
  onChange,
  segments,
  ariaLabel,
}: {
  valeur: string
  onChange: (v: string) => void
  segments: { valeur: string; libelle: string }[]
  ariaLabel: string
}) {
  return (
    // 26 px de segment + 2×3 px de rembourrage = 32 px, la valeur de CONTROLE_BARRE. Un pixel
    // d'écart se voit sur une ligne de cinq contrôles alignés.
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex h-[32px] shrink-0 items-center gap-0.5 rounded-km border border-km-line bg-km-soft p-[3px]"
    >
      {segments.map((sg) => (
        <button
          key={sg.valeur}
          type="button"
          role="radio"
          aria-checked={valeur === sg.valeur}
          onClick={() => onChange(sg.valeur)}
          className={cn(
            'flex h-[26px] items-center rounded-[6px] px-2.5 text-km-label font-semibold transition-colors',
            valeur === sg.valeur ? 'bg-km-surface text-km-text shadow-sm' : 'text-km-muted hover:text-km-text',
          )}
        >
          {sg.libelle}
        </button>
      ))}
    </div>
  )
}

export function ListToolbar({
  query,
  onQueryChange,
  placeholder = 'Rechercher…',
  count,
  children,
  secondaryRow,
}: {
  query: string
  onQueryChange: (value: string) => void
  placeholder?: string
  /** Nombre de lignes affichées, après recherche, filtre et tri. */
  count?: number
  children?: ReactNode
  /**
   * UNE SECONDE LIGNE, POUR LES ÉCRANS QUI FILTRENT BEAUCOUP.
   *
   * Ajoutée le 01/09/2026 pour /recommandations, qui porte désormais huit commandes : recherche,
   * périmètre, bascule de vue, tri, deux filtres de nomenclature, une période, une case à cocher.
   * Sur une seule ligne, elles passent à la ligne toutes seules — mais au hasard de la largeur de
   * la fenêtre, en coupant un groupe au milieu. C'est exactement ce que Naoëlle a photographié le
   * 31/08 : « c'est encore le bordel ».
   *
   * LE PARTAGE EST UNE DÉCISION, PAS UN DÉBORDEMENT. Ligne du haut : CE QU'ON REGARDE — le
   * périmètre, l'axe du tableau, l'ordre. Ligne du bas : CE QU'ON EN RETIRE — les filtres. Deux
   * questions différentes, deux lignes, et le retour à la ligne ne dépend plus de la fenêtre.
   *
   * Les quinze autres listes ne passent rien ici et gardent exactement la barre d'avant.
   */
  secondaryRow?: ReactNode
}) {
  return (
    <>
    <div className={cn('flex flex-wrap items-center gap-2', secondaryRow ? 'mb-2' : 'mb-3.5')}>
      <div className="relative w-full max-w-[260px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="h-[32px] pl-8"
        />
      </div>
      {children}
      {count != null && (
        <span className="ml-auto whitespace-nowrap text-km-label tabular-nums text-km-faint">
          {count} résultat{count > 1 ? 's' : ''}
        </span>
      )}
    </div>
    {secondaryRow && (
      <div className="mb-3.5 flex flex-wrap items-center gap-2">{secondaryRow}</div>
    )}
    </>
  )
}
