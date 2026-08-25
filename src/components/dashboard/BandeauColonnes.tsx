/**
 * LE BANDEAU CHIFFRÉ D'UNE PAGE D'OBJET — un total, réparti sur les colonnes du tableau qui suit.
 *
 * C'est le motif commun des six maquettes que Michel a envoyées le 25/08/2026, et c'est ce qui les
 * relie : chaque page reçoit en haut un total, découpé exactement selon les colonnes du kanban qui
 * est en dessous. La marge pour les recommandations, le volume pour les opportunités, le score pour
 * le patrimoine. Une seule pièce, déclinée.
 *
 * POURQUOI CE DÉCOUPAGE-LÀ ET PAS UN AUTRE : les colonnes du kanban sont les étapes du pipeline. Un
 * total réparti sur elles ne dit pas seulement « combien », il dit OÙ c'est bloqué — et c'est la
 * seule question qu'un directeur commercial se pose devant un pipeline.
 *
 * `valeur` ARRIVE DÉJÀ FORMATÉE. Le composant ne sait pas s'il montre des euros, des mégawattheures
 * ou des points : c'est l'appelant qui connaît son unité, et lui seul. Une cellule dont la valeur est
 * `null` affiche un tiret — la colonne existe, son chiffre n'est pas connu, et ce n'est pas zéro.
 */

export interface CelluleBandeau {
  libelle: string
  /** Déjà formatée, unité comprise. `null` quand le chiffre n'est pas connu. */
  valeur: string | null
  /** Sous la valeur : le nombre de dossiers, en général. */
  precision?: string
}

export function BandeauColonnes({
  intitule,
  total,
  precision,
  cellules,
}: {
  /** Ce que le total mesure — « Marge totale des recommandations ». */
  intitule: string
  total: string | null
  precision?: string
  cellules: CelluleBandeau[]
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-kw-3xl border border-kw-border bg-white">
      {/* ── Le total ── */}
      <div className="border-b border-kw-border px-5 pb-4 pt-4">
        <p className="text-kw-xs font-bold text-kw-meta">{intitule}</p>
        <p className="mt-1 font-mono text-[26px] font-extrabold leading-none tabular-nums text-kw-ink">
          {total ?? '—'}
        </p>
        {precision && <p className="mt-1.5 text-kw-xs text-kw-meta">{precision}</p>}
      </div>

      {/* ── La répartition. `divide-x` plutôt qu'une bordure par cellule : sur deux rangées, la
             dernière cellule d'une ligne ne doit pas porter de filet à droite. ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {cellules.map((c, i) => (
          <div
            key={c.libelle}
            className={
              'px-5 py-3.5 ' +
              (i % 2 === 1 ? 'border-l border-kw-border-faint ' : '') +
              (i >= 2 ? 'border-t border-kw-border-faint ' : '') +
              'sm:border-t-0 ' +
              (i % 4 !== 0 ? 'sm:border-l sm:border-kw-border-faint' : 'sm:border-l-0')
            }
          >
            <p className="truncate text-kw-xs font-bold text-kw-meta" title={c.libelle}>
              {c.libelle}
            </p>
            <p className="mt-1 font-mono text-kw-h2 font-extrabold tabular-nums text-kw-ink">
              {c.valeur ?? '—'}
            </p>
            {c.precision && <p className="mt-0.5 text-kw-micro text-kw-faint">{c.precision}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
