import { Euro } from 'lucide-react'
import type { ChiffresTableauDeBord } from '@/lib/data/tableauDeBord'

/**
 * LE BANDEAU « MARGE GÉNÉRÉE » DE LA MAQUETTE DE MICHEL (25/08/2026).
 *
 * Sa disposition est reprise telle quelle : à gauche le chiffre du mois et sa variation, à droite
 * trois grandeurs séparées par un filet, puis une barre de répartition. Ce qui change, ce sont les
 * TROIS GRANDEURS — voir la note de `tableauDeBord.ts` : son partage « Commercial 60 % / Kiwee 40 % »
 * ne peut pas être calculé, parce qu'aucune paire de colonnes ne le porte (sur mars,
 * `commission_interne` dépasse `commission_nette` : l'une n'est donc pas une part de l'autre) et que
 * les deux sont nulles sur le mois en cours. J'ai mis à la place trois chiffres qui existent et qui
 * répondent à la même question — combien d'affaires, à quelle taille, à quel taux de réussite.
 *
 * LA BARRE DIT CE QU'ELLE MONTRE : la part des affaires décidées ce mois qui sont acceptées. C'est
 * une répartition VRAIE — acceptées, refusées, abandonnées forment une partition des décisions du
 * mois — là où une barre 60/40 sur deux colonnes de sens incertain aurait été une invention.
 */

const euros = (v: number) =>
  v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'

function Grandeur({
  couleur,
  libelle,
  precision,
  valeur,
}: {
  couleur: string
  libelle: string
  precision?: string
  valeur: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1.5">
        <span className={'h-1.5 w-1.5 shrink-0 rounded-full ' + couleur} />
        <span className="truncate text-km-label font-bold text-km-muted">{libelle}</span>
        {precision && <span className="shrink-0 text-km-label text-km-faint">{precision}</span>}
      </div>
      <p className="mt-1 text-km-title font-extrabold tabular-nums text-km-text">{valeur}</p>
    </div>
  )
}

export function BandeauMarge({
  chiffres,
  chargement,
  objectif,
}: {
  chiffres: ChiffresTableauDeBord | undefined
  chargement: boolean
  /** Objectif d'équipe du mois — la somme des objectifs individuels. `null` : aucune barre. */
  objectif?: number | null
}) {
  const mois = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const c = chiffres

  const decidees = c ? c.nbAcceptees + c.nbRefusees + c.nbAbandonnees : 0
  const partAcceptees = decidees > 0 && c ? (c.nbAcceptees / decidees) * 100 : 0

  return (
    <div className="rounded-km-lg border border-km-green-line bg-km-green-tint px-5 py-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1px_minmax(0,1fr)] lg:gap-6">
        {/* ── LE CHIFFRE DU MOIS ── */}
        <div>
          <div className="flex items-center gap-2">
            {/* SON TITRE DU SOIR : « Performance globale Kiwee ». La maquette du matin disait
                simplement « Marge générée » ; en séparant l'échelle de l'équipe de la sienne, il a
                rendu le mot « globale » nécessaire — sans lui, un commercial lirait ce chiffre
                comme le sien. */}
            <p className="text-km-label font-bold text-km-muted">Performance globale Kiwee</p>
            <span className="rounded-km border border-km-green-line bg-white px-2 py-0.5 text-km-label font-bold capitalize text-km-muted">
              {mois}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-km-lg bg-km-green text-white">
              <Euro className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <p className="text-km-metric-lg font-bold leading-none tabular-nums text-km-text">
              {chargement || !c ? '—' : euros(c.margeMois)}
            </p>
          </div>
          {/* LA VARIATION SE TAIT QUAND ELLE N'A PAS DE SENS : un mois précédent à zéro ne donne pas
              une hausse « infinie », il donne l'absence de comparaison. */}
          <p className="mt-2 text-km-label text-km-muted">
            {c && c.variationPct != null ? (
              <>
                <span
                  className={
                    c.variationPct >= 0
                      ? 'font-extrabold text-km-green'
                      : 'font-extrabold text-km-red'
                  }
                >
                  {c.variationPct >= 0 ? '+' : ''}
                  {c.variationPct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                </span>{' '}
                par rapport au mois dernier ({euros(c.margeMoisPrecedent)})
              </>
            ) : (
              'Marge nette de toutes les recommandations acceptées ce mois.'
            )}
          </p>
        </div>

        <div className="hidden bg-km-green-line lg:block" />

        {/* ══ L'OBJECTIF MENSUEL, quand il est connu ══

            Sa maquette porte « Objectif mensuel 520 000 € » et « 93 % atteint ». Ses chiffres réels du
            26/08 : 115 000 € par mois pour l'équipe, somme des quatre objectifs individuels.

            IL PREND LA PLACE DES TROIS GRANDEURS que j'avais mises faute d'objectif. Elles répondaient
            à la même question par défaut — « ce chiffre est-il bon ? » — et l'objectif y répond
            mieux, parce que c'est LUI qui l'a fixé. Les trois grandeurs restent dessous : elles
            expliquent le comment, l'objectif dit le combien. */}
        <div>
          {objectif != null && objectif > 0 && (
            <div className="mb-4 border-b border-km-green-line pb-3.5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-km-label font-bold text-km-muted">Objectif mensuel</p>
                  <p className="mt-0.5 text-km-metric font-extrabold tabular-nums text-km-text">
                    {euros(objectif)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-km-metric font-extrabold tabular-nums text-km-green">
                    {c ? Math.round((c.margeMois / objectif) * 100) : 0} %
                  </p>
                  <p className="text-km-label text-km-faint">atteint</p>
                </div>
              </div>
              {/* La barre se plafonne à 100 % : au-delà, ce qui compte est le pourcentage affiché,
                  pas une barre qui déborderait de son cadre. */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-km-pill bg-white">
                <span
                  className="block h-full bg-km-green"
                  style={{ width: Math.min(100, c ? (c.margeMois / objectif) * 100 : 0) + '%' }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Grandeur
              couleur="bg-km-green"
              libelle="Recommandations acceptées"
              precision={c ? `sur ${decidees} décidées` : undefined}
              valeur={chargement || !c ? '—' : String(c.nbAcceptees)}
            />
            <Grandeur
              couleur="bg-km-green/40"
              libelle="Marge moyenne"
              precision="par affaire"
              valeur={chargement || !c || c.margeMoyenne == null ? '—' : euros(c.margeMoyenne)}
            />
            <Grandeur
              couleur="bg-km-blue"
              libelle="Taux d'acceptation"
              precision="du mois"
              valeur={
                chargement || !c || c.tauxAcceptation == null
                  ? '—'
                  : c.tauxAcceptation.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' %'
              }
            />
          </div>

          <div
            className="mt-4 flex h-1.5 overflow-hidden rounded-km-pill bg-km-green/25"
            title={
              c
                ? `${c.nbAcceptees} acceptées · ${c.nbRefusees} refusées · ${c.nbAbandonnees} abandonnées`
                : undefined
            }
          >
            <span className="bg-km-green" style={{ width: partAcceptees + '%' }} />
          </div>
          <p className="mt-1.5 text-km-label text-km-faint">
            {c
              ? `${c.nbAcceptees} acceptées, ${c.nbRefusees} refusées, ${c.nbAbandonnees} abandonnées ce mois.`
              : 'Répartition des décisions du mois.'}
          </p>
        </div>
      </div>
    </div>
  )
}
