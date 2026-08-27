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
  /**
   * LA PASTILLE DE TOTAL, collée au titre de colonne — maquettes 5 et 6 du dossier UX du 26/08/2026 :
   * « afficher le volume de consommation par statut PRÈS DU TITRE DE COLONNE et le total près du titre
   * de page », « afficher la marge par statut près du titre de chaque colonne ».
   *
   * ELLE REMPLACE LE BANDEAU que j'avais livré le matin même, et sa version est meilleure : le chiffre
   * est là où on lit la colonne, pas dans un tableau récapitulatif au-dessus qu'il faut mettre en
   * correspondance de tête. Un bandeau séparé oblige à faire le lien ; une pastille le fait pour vous.
   *
   * Déjà formatée, unité comprise : le tableau ne sait pas s'il montre des euros ou des GWh.
   */
  total?: string | null
}

/**
 * LA CARTE, TELLE QUE MICHEL LA DESSINE dans ses six maquettes du 25/08/2026.
 *
 * Quatre étages, du haut vers le bas : l'étiquette de NATURE, le titre et son client, le MOTIF dans
 * son cadre, et les CHIFFRES en pied. Chacun répond à une question que le commercial se pose avant
 * d'ouvrir la fiche : de quoi il s'agit, chez qui, pourquoi c'est là, et combien ça pèse.
 *
 * TOUS LES ÉTAGES SONT OPTIONNELS et se replient s'ils sont absents : les six pages ne portent pas
 * les mêmes informations, et une carte de recommandation n'a pas de nature à annoncer là où une carte
 * de signal en a une. Une carte qui n'a que son titre reste une carte correcte.
 */
export interface CarteKanban {
  id: string
  titre: string
  sousTitre?: string
  /** Mention de droite : une date, un nombre de jours, un palier. */
  mention?: string
  /** Vrai quand la carte mérite d'être traitée avant les autres de sa colonne. */
  urgent?: boolean
  /** L'étiquette de nature, en tête de carte — le type de signal, l'origine d'une piste. */
  nature?: string
  /**
   * La phrase qui dit POURQUOI la carte existe, dans son cadre — « l'échéance tombe dans 4 mois ».
   *
   * C'est l'apport de ses maquettes : sur un kanban, la colonne dit l'état et le titre dit l'objet,
   * mais rien ne disait le motif. Le commercial devait ouvrir la fiche pour savoir s'il devait s'en
   * occuper maintenant.
   */
  motif?: string
  /** Chiffres en pied de carte, deux au plus pour rester lisibles — un volume, un montant. */
  chiffres?: { libelle: string; valeur: string }[]
  /**
   * UNE ÉCHÉANCE EN DATE RELATIVE, à la place d'une date brute.
   *
   * Michel, 27/08/2026 : afficher la date de cotation souhaitée sur la tuile « pour que ce soit
   * visible sans cliquer dessus », en dates relatives — « dans 3 jours », « en retard »,
   * « aujourd'hui ».
   *
   * POURQUOI RELATIF PLUTÔT QUE « 26/08/2026 » : une date absolue demande un calcul mental à chaque
   * lecture, et sur une colonne de quinze tuiles ce calcul se fait quinze fois. « En retard de
   * 1 jour » se lit sans réfléchir. La date exacte reste sur la fiche, où l'on va quand on agit.
   *
   * `ton` porte la gravité, pas la couleur : c'est la tuile qui décide de l'apparence.
   */
  echeance?: { texte: string; ton: 'retard' | 'jour' | 'proche' | 'loin' }
  to: string
}

/** Nombre de cartes montrées par colonne. Au-delà, on dit combien restent. */
const CARTES_PAR_COLONNE = 8

export function TableauKanban({
  colonnes,
  cartes,
  totaux,
  onCarte,
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
  /**
   * Que faire au clic, quand ouvrir une page ne convient pas.
   *
   * Les pistes n'ont pas de fiche : leurs actions — cocher les cinq validations, convertir, joindre
   * un fichier — vivaient dans la carte de liste. Sans ce rappel, retirer la liste rendrait la page
   * inutilisable. Fourni, il l'emporte sur `to`.
   */
  onCarte?: (id: string) => void
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
            className="flex w-[236px] shrink-0 flex-col rounded-kw-lg border-t-[3px] bg-kw-subtle/70 p-2.5"
          >
            <div className="mb-2 flex items-center gap-1.5 px-0.5">
              <p className="truncate text-kw-xs font-bold uppercase tracking-[0.06em] text-kw-meta">
                {col.libelle}
              </p>
              {/* Le total d'abord, le nombre de cartes ensuite : c'est le chiffre qui porte
                  l'information, le compte n'est qu'une indication de volume. */}
              {col.total && (
                <span className="shrink-0 rounded-kw-md bg-kw-green-light px-1.5 py-px font-mono text-kw-micro font-extrabold tabular-nums text-kw-green">
                  {col.total}
                </span>
              )}
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
                  onClick={() => (onCarte ? onCarte(c.id) : navigate(c.to))}
                  className={cn(
                    'group flex items-start gap-1.5 rounded-kw-md border bg-white px-2 py-1.5 text-left transition-colors hover:bg-kw-bg',
                    c.urgent ? 'border-kw-amber' : 'border-kw-border-faint',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    {/* ── L'étiquette de nature et l'échéance, sur la même ligne ──
                           L'échéance passe DEVANT le nom du fournisseur : sur une tuile « à
                           demander », ce qui décide de l'ordre de traitement est le retard, pas
                           l'identité du fournisseur. ── */}
                    {(c.nature || c.echeance) && (
                      <span className="mb-1 flex flex-wrap items-center gap-1">
                        {c.nature && (
                          <span className="max-w-full truncate rounded-[3px] bg-kw-bloc px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em] text-kw-meta">
                            {c.nature}
                          </span>
                        )}
                        {c.echeance && (
                          <span
                            className={cn(
                              'shrink-0 rounded-[3px] border px-1.5 py-px font-mono text-kw-micro font-bold',
                              c.echeance.ton === 'retard'
                                ? 'border-kw-red bg-kw-red-light text-kw-red'
                                : c.echeance.ton === 'jour'
                                  ? 'border-kw-amber bg-kw-amber-light text-kw-amber-dark'
                                  : c.echeance.ton === 'proche'
                                    ? 'border-kw-amber-border bg-kw-amber-light text-kw-amber'
                                    : 'border-kw-border bg-kw-bloc text-kw-meta',
                            )}
                          >
                            {c.echeance.texte}
                          </span>
                        )}
                      </span>
                    )}

                    <span className="block truncate text-kw-sm font-bold text-kw-ink">{c.titre}</span>
                    {c.sousTitre && (
                      <span className="block truncate text-kw-micro text-kw-meta">{c.sousTitre}</span>
                    )}

                    {/* ── Le motif, dans son cadre. Deux lignes au plus : au-delà, ce n'est plus un
                           motif, c'est un commentaire, et il a sa place sur la fiche. ── */}
                    {c.motif && (
                      <span className="mt-1 block rounded-[4px] bg-kw-bloc px-1.5 py-1 text-kw-micro leading-snug text-kw-body line-clamp-2">
                        {c.motif}
                      </span>
                    )}

                    {/* ── Les chiffres en pied ── */}
                    {c.chiffres && c.chiffres.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        {c.chiffres.map((n) => (
                          <span key={n.libelle} className="block">
                            <span className="block text-kw-micro text-kw-faint">{n.libelle}</span>
                            <span className="block font-mono text-kw-xs font-extrabold tabular-nums text-kw-ink">
                              {n.valeur}
                            </span>
                          </span>
                        ))}
                      </span>
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
