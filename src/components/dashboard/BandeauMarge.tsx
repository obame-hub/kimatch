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
        <span className="truncate text-kw-xs font-bold text-kw-body">{libelle}</span>
        {precision && <span className="shrink-0 text-kw-micro text-kw-faint">{precision}</span>}
      </div>
      <p className="mt-1 font-mono text-kw-h2 font-extrabold tabular-nums text-kw-ink">{valeur}</p>
    </div>
  )
}

export function BandeauMarge({
  chiffres,
  chargement,
}: {
  chiffres: ChiffresTableauDeBord | undefined
  chargement: boolean
}) {
  const mois = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const c = chiffres

  const decidees = c ? c.nbAcceptees + c.nbRefusees + c.nbAbandonnees : 0
  const partAcceptees = decidees > 0 && c ? (c.nbAcceptees / decidees) * 100 : 0

  return (
    <div className="rounded-kw-3xl border border-kw-green-border bg-kw-green-tint px-5 py-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1px_minmax(0,1fr)] lg:gap-6">
        {/* ── LE CHIFFRE DU MOIS ── */}
        <div>
          <div className="flex items-center gap-2">
            {/* SON TITRE DU SOIR : « Performance globale Kiwee ». La maquette du matin disait
                simplement « Marge générée » ; en séparant l'échelle de l'équipe de la sienne, il a
                rendu le mot « globale » nécessaire — sans lui, un commercial lirait ce chiffre
                comme le sien. */}
            <p className="text-kw-xs font-bold text-kw-body">Performance globale Kiwee</p>
            <span className="rounded-kw-md border border-kw-green-border bg-white px-2 py-0.5 text-kw-micro font-bold capitalize text-kw-meta">
              {mois}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-kw-xl bg-kw-green text-white">
              <Euro className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <p className="font-mono text-[27px] font-extrabold leading-none tabular-nums text-kw-ink">
              {chargement || !c ? '—' : euros(c.margeMois)}
            </p>
          </div>
          {/* LA VARIATION SE TAIT QUAND ELLE N'A PAS DE SENS : un mois précédent à zéro ne donne pas
              une hausse « infinie », il donne l'absence de comparaison. */}
          <p className="mt-2 text-kw-xs text-kw-meta">
            {c && c.variationPct != null ? (
              <>
                <span
                  className={
                    c.variationPct >= 0
                      ? 'font-extrabold text-kw-green'
                      : 'font-extrabold text-kw-red'
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

        <div className="hidden bg-kw-green-border lg:block" />

        {/* ── LES TROIS GRANDEURS, ET LA BARRE ── */}
        <div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Grandeur
              couleur="bg-kw-green"
              libelle="Recommandations acceptées"
              precision={c ? `sur ${decidees} décidées` : undefined}
              valeur={chargement || !c ? '—' : String(c.nbAcceptees)}
            />
            <Grandeur
              couleur="bg-kw-green/40"
              libelle="Marge moyenne"
              precision="par affaire"
              valeur={chargement || !c || c.margeMoyenne == null ? '—' : euros(c.margeMoyenne)}
            />
            <Grandeur
              couleur="bg-kw-blue"
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
            className="mt-4 flex h-1.5 overflow-hidden rounded-kw-pill bg-kw-green/25"
            title={
              c
                ? `${c.nbAcceptees} acceptées · ${c.nbRefusees} refusées · ${c.nbAbandonnees} abandonnées`
                : undefined
            }
          >
            <span className="bg-kw-green" style={{ width: partAcceptees + '%' }} />
          </div>
          <p className="mt-1.5 text-kw-micro text-kw-faint">
            {c
              ? `${c.nbAcceptees} acceptées, ${c.nbRefusees} refusées, ${c.nbAbandonnees} abandonnées ce mois.`
              : 'Répartition des décisions du mois.'}
          </p>
        </div>
      </div>
    </div>
  )
}
