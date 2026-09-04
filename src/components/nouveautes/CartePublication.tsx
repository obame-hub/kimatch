import { Pencil, Trash2 } from 'lucide-react'
import { dateRelative } from '@/lib/dateRelative'
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
  /** Sur la page d'historique, la date est déjà portée par la colonne de gauche de la frise. */
  masquerDate?: boolean
}) {
  const brouillon = publication.date_publication === null
  const quand = dateRelative(publication.date_publication ?? publication.date_creation)
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
            {auteur && quand && !masquerDate && <span aria-hidden="true">·</span>}
            {quand && !masquerDate && (
              <span
                title={new Date(publication.date_publication ?? publication.date_creation).toLocaleString('fr-FR')}
              >
                {quand}
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
