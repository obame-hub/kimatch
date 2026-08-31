import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/form'

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
          className="pl-8"
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
