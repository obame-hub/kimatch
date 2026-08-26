import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * L'en-tête d'un écran de liste.
 *
 * LA PASTILLE PORTE LA COULEUR DE L'OBJET, comme chez William : chacun de ses écrans s'ouvre sur une
 * pastille au dégradé de sa famille — bleu pour le compte, violet pour le contact, vert pour le
 * site, magenta pour l'opportunité. Sans elle, deux listes se ressemblent trait pour trait et on ne
 * sait plus où l'on est. Le paramètre est optionnel : les écrans qui ne l'ont pas encore gardent
 * exactement l'apparence d'avant.
 */
export function PageHeader({ title, description, actions, icone, teinte, badge, badgeLibelle }: {
  title: string
  description?: string
  actions?: ReactNode
  icone?: ReactNode
  /** Classes du dégradé de la pastille, par exemple `from-opp-600 to-opp-400`. */
  teinte?: string
  /**
   * LE TOTAL DE LA PAGE, COLLÉ AU TITRE — maquettes 5 et 6 du dossier UX du 26/08/2026 : « le total
   * près du titre de page », « la marge totale près du titre de page ».
   *
   * Déjà formaté, unité comprise : l'en-tête ne sait pas s'il annonce des euros ou des GWh. Collé au
   * titre et non posé au-dessus, parce que c'est le titre qu'il qualifie — « Recommandations,
   * 132 800 € » se lit d'un trait, là où un bandeau séparé demande de faire le lien soi-même.
   */
  badge?: string
  /** Ce que le total mesure — « Marge totale », « Consommation totale ». */
  badgeLibelle?: string
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icone && (
          <span
            className={cn(
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br text-white shadow-[0_4px_12px_rgba(22,24,29,.14)]',
              teinte ?? 'from-navy-700 to-navy-500',
            )}
          >
            {icone}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-semibold text-navy-900">{title}</h2>
            {badge && (
              <span className="inline-flex shrink-0 items-baseline gap-1.5 rounded-kw-pill border border-kw-green-border bg-kw-green-light px-2.5 py-1">
                {badgeLibelle && (
                  <span className="text-kw-micro font-bold uppercase tracking-[0.06em] text-kw-meta">
                    {badgeLibelle}
                  </span>
                )}
                <span className="font-mono text-kw-sm font-extrabold tabular-nums text-kw-green">
                  {badge}
                </span>
              </span>
            )}
          </div>
          {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
        </div>
      </div>
      {actions}
    </div>
  )
}
