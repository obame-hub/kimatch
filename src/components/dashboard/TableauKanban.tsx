import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * UN TABLEAU KANBAN, PAR STATUT.
 *
 * Michel, rappelé le 25/08/2026 : une vue kanban dans le tableau de bord, pour les objets de sa
 * diapositive 13 — et cette diapositive est justement la liste de ceux qui ONT des statuts :
 *
 *   SIGNAL          Nouveau · À qualifier · Converti · Écarté
 *   OPPORTUNITÉ     Nouvelle · En qualification · Mandat si requis · Prête à convertir ·
 *                   Convertie · Abandonnée
 *   RECOMMANDATION  Brouillon · Consultation · Offres reçues · À présenter · Présentée ·
 *                   Acceptée / Refusée
 *
 * ON NE DÉPLACE PAS LES CARTES, ET C'EST UN CHOIX, pas une facilité. Le statut d'une opportunité se
 * CALCULE à partir des objets réunis — « la maturité se fait si les objets sont valides » — donc
 * glisser une carte d'une colonne à l'autre ne voudrait rien dire : elle reviendrait à sa place au
 * rechargement. Et pour une recommandation, sa règle est « le statut évolue, il ne régresse jamais » :
 * un glisser-déposer permettrait précisément de le faire reculer. Le tableau sert à VOIR le pipeline.
 * Cliquer une carte ouvre l'objet, où les gestes qui font avancer existent déjà et vérifient leurs
 * conditions.
 *
 * LES CARTES SONT ORDONNÉES PAR URGENCE, pas par date de création : c'est un tableau de bord, il
 * répond à « par quoi je commence ». Chaque appelant fournit l'ordre qui vaut pour son objet.
 *
 * LES COLONNES TERMINALES SONT ÉCARTÉES par l'appelant, pas ici : « Converti », « Écarté »,
 * « Acceptée », « Refusée », « Abandonnée » sont des aboutissements. Les afficher remplirait l'écran
 * de dossiers finis — 1 573 recommandations closes contre 134 vivantes — et noierait le travail
 * restant.
 */

export interface ColonneKanban {
  code: string
  libelle: string
  /** Teinte du filet supérieur. Reprend la couleur du référentiel quand elle existe. */
  couleur?: string | null
}

export interface CarteKanban {
  id: string
  titre: string
  sousTitre?: string
  /** Mention de droite : une date, un nombre de jours, un palier. */
  mention?: string
  /** Vrai quand la carte mérite d'être traitée avant les autres de sa colonne. */
  urgent?: boolean
  to: string
}

/** Nombre de cartes montrées par colonne. Au-delà, on dit combien restent. */
const CARTES_PAR_COLONNE = 8

export function TableauKanban({
  colonnes,
  cartes,
  totaux,
  siVide,
}: {
  colonnes: ColonneKanban[]
  /** Cartes indexées par code de colonne, déjà ordonnées par urgence par l'appelant. */
  cartes: Record<string, CarteKanban[]>
  /**
   * Le vrai total par colonne, quand il ne se déduit PAS du nombre de cartes fournies.
   *
   * Sur une page dont la liste est paginée en base — les recommandations — l'appelant ne reçoit que
   * dix cartes par colonne et le total vient d'un `count` séparé. Sans ce paramètre, la colonne
   * annoncerait « 10 » sur 648 dossiers, et « et 2 autres » là où il en reste 640.
   */
  totaux?: Record<string, number>
  siVide: string
}) {
  const navigate = useNavigate()
  const compte = (code: string) => totaux?.[code] ?? cartes[code]?.length ?? 0
  const total = colonnes.reduce((n, c) => n + compte(c.code), 0)

  if (total === 0) {
    return (
      <p className="rounded-kw-lg border border-dashed border-kw-border-strong bg-kw-subtle px-4 py-3 text-kw-sm text-kw-meta">
        {siVide}
      </p>
    )
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {colonnes.map((col) => {
        const liste = cartes[col.code] ?? []
        const montrees = liste.slice(0, CARTES_PAR_COLONNE)
        return (
          <div
            key={col.code}
            style={{ borderTopColor: col.couleur ?? '#d5d7d2' }}
            className="flex w-[212px] shrink-0 flex-col rounded-kw-lg border-t-[3px] bg-kw-subtle/70 p-2.5"
          >
            <div className="mb-2 flex items-center gap-1.5 px-0.5">
              <p className="truncate text-kw-xs font-bold uppercase tracking-[0.06em] text-kw-meta">
                {col.libelle}
              </p>
              <span className="ml-auto shrink-0 rounded-kw-md bg-white px-1.5 py-px font-mono text-kw-micro font-extrabold text-kw-meta">
                {compte(col.code)}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              {montrees.length === 0 && <p className="px-0.5 text-kw-micro text-kw-faint">Vide</p>}
              {montrees.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(c.to)}
                  className={cn(
                    'group flex items-start gap-1.5 rounded-kw-md border bg-white px-2 py-1.5 text-left transition-colors hover:bg-kw-bg',
                    c.urgent ? 'border-kw-amber' : 'border-kw-border-faint',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-kw-sm font-bold text-kw-ink">{c.titre}</span>
                    {c.sousTitre && (
                      <span className="block truncate text-kw-micro text-kw-meta">{c.sousTitre}</span>
                    )}
                    {c.mention && (
                      <span
                        className={cn(
                          'mt-0.5 block font-mono text-kw-micro font-bold',
                          c.urgent ? 'text-kw-amber-dark' : 'text-kw-faint',
                        )}
                      >
                        {c.mention}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-kw-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
              {/* On dit ce qu'on ne montre pas — une colonne coupée en silence se lit comme une
                  colonne vidée. */}
              {compte(col.code) > montrees.length && (
                <p className="px-0.5 pt-0.5 text-kw-micro text-kw-faint">
                  et {compte(col.code) - montrees.length} autre{compte(col.code) - montrees.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
