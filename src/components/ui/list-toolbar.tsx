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

export function ListToolbar({
  query,
  onQueryChange,
  placeholder = 'Rechercher…',
  count,
  children,
}: {
  query: string
  onQueryChange: (value: string) => void
  placeholder?: string
  /** Nombre de lignes affichées, après recherche, filtre et tri. */
  count?: number
  children?: ReactNode
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2">
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
  )
}
