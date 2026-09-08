import { Pencil, Trash2 } from 'lucide-react'
import { dateEtHeure, dateRelative } from '@/lib/dateRelative'
import { ouvrirPieceJointe, useContenuAffichable, type Publication } from '@/lib/data/publications'
import { cn } from '@/lib/utils'

/**
 * UNE NOUVEAUTÉ, TELLE QU'ELLE SE LIT.
 *
 * Le même composant sert la popup et la page d'historique : ce qui change entre les deux, c'est ce
 * qui les entoure, pas la publication elle-même. Deux rendus séparés auraient divergé au premier
 * ajustement — et c'est le genre d'écart qu'on ne voit pas, puisqu'on ne regarde jamais les deux
 * écrans côte à côte.
 */

/** La pastille de catégorie, dans la teinte que porte le référentiel. */
function PastilleCategorie({ libelle, couleur }: { libelle: string; couleur: string | null }) {
  const teinte = couleur ?? '#64748B'
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-km-pill px-[7px] py-[3px] text-km-label font-semibold uppercase tracking-[0.03em]"
      /* Fond pâle et texte de la même teinte, comme le composant `Badge` de la maison : « le fond
         plein n'existe pas ici — une pastille dit un état, elle ne réclame pas l'attention comme un
         bouton ». Les huit derniers chiffres du fond sont son alpha. */
      style={{ backgroundColor: `${teinte}1F`, color: teinte }}
    >
      {libelle}
    </span>
  )
}

function Contenu({ html }: { html: string }) {
  const propre = useContenuAffichable(html)

  return (
    <div
      className="contenu-riche mt-2.5"
      // Un clic sur une pièce jointe ne suit pas son adresse enregistrée — elle a expiré. Le chemin
      // se resigne au moment du clic, ce qui est aussi ce qui garde le fichier privé.
      onClick={(e) => {
        const lien = (e.target as HTMLElement).closest('a[data-chemin]')
        if (!lien) return
        e.preventDefault()
        const chemin = lien.getAttribute('data-chemin')
        if (chemin) void ouvrirPieceJointe(chemin)
      }}
      dangerouslySetInnerHTML={{ __html: propre }}
    />
  )
}

export function CartePublication({
  publication,
  onModifier,
  onSupprimer,
  className,
  masquerDate,
}: {
  publication: Publication
  onModifier?: (publication: Publication) => void
  onSupprimer?: (publication: Publication) => void
  className?: string
  /**
   * Sur la page d'historique, la colonne de gauche de la frise porte déjà la date — MAIS SEULEMENT
   * À PARTIR DE `sm` : elle est en `hidden sm:block`. Cette option masque donc la date de la carte
   * aux mêmes tailles, et non partout. Elle la retirait complètement jusqu'au 07/09/2026, si bien
   * que sur un téléphone la page Nouveautés n'affichait AUCUNE date — ni jour, ni heure, ni
   * distance. Constaté en ajoutant l'heure à la demande de Naoëlle.
   */
  masquerDate?: boolean
}) {
  const brouillon = publication.date_publication === null
  const instant = publication.date_publication ?? publication.date_creation
  const quand = dateRelative(instant)
  const exact = dateEtHeure(instant)
  const auteur = publication.auteur
    ? `${publication.auteur.prenom} ${publication.auteur.nom}`.trim()
    : null

  return (
    <article className={cn('min-w-0', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-km-title font-semibold text-km-text">{publication.titre}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-km-label text-km-faint">
            {auteur && <span>par {auteur}</span>}
            {auteur && exact && (
              <span aria-hidden="true" className={cn(masquerDate && 'sm:hidden')}>·</span>
            )}
            {exact && (
              /* LA DATE, L'HEURE, PUIS LA DISTANCE. « il y a 2 heures » seul ne départageait pas
                 quatre publications parues le même jour, et l'ordre compte : une correction qui
                 suit la fonctionnalité qu'elle répare ne se lit que par l'heure. */
              <span className={cn('tabular-nums', masquerDate && 'sm:hidden')}>
                {exact}
                {quand && ` · ${quand}`}
              </span>
            )}
          </p>
        </div>
        {(onModifier || onSupprimer) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onModifier && (
              <button
                type="button"
                onClick={() => onModifier(publication)}
                aria-label={`Modifier « ${publication.titre} »`}
                className="flex h-7 w-7 items-center justify-center rounded-km-sm text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onSupprimer && (
              <button
                type="button"
                onClick={() => onSupprimer(publication)}
                aria-label={`Supprimer « ${publication.titre} »`}
                className="flex h-7 w-7 items-center justify-center rounded-km-sm text-km-faint transition-colors hover:bg-km-red-soft hover:text-km-red"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PastilleCategorie libelle={publication.type_libelle} couleur={publication.type_couleur} />
        {/* Le brouillon se signale : il n'est visible que des administrateurs, et rien d'autre à
            l'écran ne dit que l'équipe ne l'a pas encore reçu. */}
        {brouillon && (
          <span className="inline-flex shrink-0 items-center rounded-km-pill bg-km-soft px-[7px] py-[3px] text-km-label font-semibold uppercase tracking-[0.03em] text-km-muted">
            Brouillon
          </span>
        )}
      </div>

      <Contenu html={publication.contenu_html} />
    </article>
  )
}
