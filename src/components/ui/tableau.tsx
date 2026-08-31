import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * LE TABLEAU DES ÉCRANS DE LISTE, d'après la maquette de Michel (31/08/2026).
 *
 * Son dossier : « Tableaux sans quadrillage lourd, en-tête doux et survol discret. » Concrètement,
 * relevé dans son code :
 *
 *   en-tête   fond `km-soft`, texte `km-muted`, coins arrondis au premier et au dernier
 *   cellules  pas de bordure verticale, une seule ligne horizontale sous chaque rangée
 *   survol    le fond `km-soft` de l'en-tête, rien de plus
 *
 * PAS DE QUADRILLAGE, ET C'EST CE QUI CHANGE LE PLUS. Un tableau quadrillé fait lire chaque case
 * comme une boîte ; sans lignes verticales, l'œil suit la rangée — ce qu'on cherche à faire quand
 * on compare des dossiers.
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────────────────────────
 *
 * Cinq écrans écrivaient leur tableau à la main, avec les mêmes classes recopiées. Elles avaient
 * déjà divergé : `min-w-[640px]` sur Comptes, `[720px]` sur Versions, `[820px]` sur Compteurs.
 * Une décision de design appliquée à un tableau ne se propageait donc pas aux quatre autres, et
 * personne ne relit cinq écrans pour vérifier une bordure.
 */

/** L'enveloppe : c'est elle qui défile latéralement, jamais la page. */
export function Tableau({
  minWidth = 720,
  children,
  className,
}: {
  /**
   * Largeur en dessous de laquelle le tableau défile plutôt que de se comprimer. Un tableau
   * comprimé coupe les mots au milieu et devient illisible bien avant d'être étroit.
   */
  minWidth?: number
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

/** La rangée d'en-tête. Les coins arrondis se posent sur la première et la dernière colonne. */
export function TableauTete({ children }: { children: ReactNode }) {
  return (
    <thead className="[&_th]:bg-km-soft [&_th]:px-2.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-km-label [&_th]:font-semibold [&_th]:text-km-muted [&_th:first-child]:rounded-l-km [&_th:last-child]:rounded-r-km">
      {children}
    </thead>
  )
}

/**
 * Le corps. Le survol et la bordure du bas sont posés ici, sur les descendants, plutôt que sur
 * chaque cellule : un écran qui ajoute une colonne n'a rien à penser.
 */
export function TableauCorps({ children }: { children: ReactNode }) {
  return (
    <tbody className="[&_td]:border-b [&_td]:border-km-line [&_td]:px-2.5 [&_td]:py-3 [&_td]:align-middle [&_td]:text-km-body [&_tr]:transition-colors [&_tr:hover]:bg-km-soft">
      {children}
    </tbody>
  )
}

/**
 * LE NOM D'UNE LIGNE, avec sa précision en dessous.
 *
 * C'est le motif de sa maquette (`.km-name` + `.km-sub`) et il vaut mieux qu'une colonne de plus :
 * « Groupe Solstice / 6 sites · 18 compteurs » se lit d'un bloc, là où deux colonnes obligent l'œil
 * à faire l'aller-retour pour rapprocher deux informations qui vont ensemble.
 */
export function NomDeLigne({ children, precision }: { children: ReactNode; precision?: ReactNode }) {
  return (
    <>
      <span className="text-km-name font-semibold text-km-text">{children}</span>
      {precision && <span className="mt-0.5 block text-km-label text-km-muted">{precision}</span>}
    </>
  )
}

/**
 * LA SUGGESTION, telle qu'elle apparaît dans une cellule de sa maquette : un filet vert à gauche,
 * un fond vert pâle, et la raison en dessous.
 *
 * Son dossier insiste sur la forme autant que sur le fond : « les suggestions sont présentées
 * comme une aide contextualisée, pas comme un chatbot séparé ». D'où le filet et non une bulle :
 * une bulle se lit comme quelqu'un qui parle, un filet comme une note dans la marge.
 *
 * ET LA RAISON N'EST PAS FACULTATIVE. « Relancer le décisionnaire » sans « sans retour depuis
 * 3 jours » est un ordre ; avec, c'est un constat qu'on peut contredire.
 */
export function Suggestion({ children, raison }: { children: ReactNode; raison: ReactNode }) {
  return (
    <div className="rounded-km-sm border-l-2 border-km-green bg-km-green-soft px-2.5 py-1.5">
      <span className="text-km-body text-km-text">{children}</span>
      <small className="mt-0.5 block text-km-label text-km-muted">{raison}</small>
    </div>
  )
}

/** Le bouton discret de fin de rangée. Il verdit au survol, seul signe qu'il mène ailleurs. */
export function BoutonOuvrir({ children = 'Ouvrir', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-km-sm bg-km-soft px-2.5 py-1 text-km-label font-semibold text-km-text transition-colors hover:bg-km-green-soft hover:text-km-green"
      {...props}
    >
      {children}
    </button>
  )
}
