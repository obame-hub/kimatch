import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * UNE TUILE CHIFFRÉE DE LA MAQUETTE DE MICHEL : icône en pastille à gauche, badge à droite, le
 * nombre en gros, son libellé dessous. Quatre côte à côte.
 *
 * LE BADGE N'EST PAS DÉCORATIF, et c'est la seule liberté que j'ai prise : sa maquette écrit
 * « 3 prioritaires » sur les signaux, or `signaux.gravite` est nulle sur toutes les lignes de la
 * base — le chiffre n'aurait aucune source. Chaque badge porte donc une grandeur qui existe, et
 * `titre` en donne la définition au survol : personne ne doit avoir à devenir devin pour savoir ce
 * que compte un nombre affiché sur un tableau de bord.
 */
export function TuileChiffre({
  icone: Icone,
  teinte,
  badge,
  valeur,
  libelle,
  definition,
  onClick,
}: {
  icone: LucideIcon
  /** Les classes de la pastille — fond et couleur d'icône. */
  teinte: string
  badge: string | null
  valeur: string
  libelle: string
  definition: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={definition}
      className="rounded-km-lg border border-km-line bg-white px-4 py-4 text-left transition-shadow hover:shadow-km-metric"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-km-lg', teinte)}>
          <Icone className="h-[17px] w-[17px]" strokeWidth={2.3} />
        </span>
        {badge && (
          <span className="rounded-km bg-km-soft px-2 py-1 text-km-label font-bold text-km-muted">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-4 text-km-metric-lg font-bold leading-none tabular-nums text-km-text">
        {valeur}
      </p>
      <p className="mt-1.5 text-km-body text-km-muted">{libelle}</p>
    </button>
  )
}
