import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * LES CONTROLES DE FORMULAIRE, dans la palette de la maquette de Michel (31/08/2026).
 *
 * Le style est ecrit UNE FOIS et partage par le champ, la zone de texte et la liste deroulante.
 * Il etait recopie trois fois a l'identique : la premiere fois qu'on aurait touche a l'un, les
 * trois auraient divergé sans que personne s'en apercoive — un formulaire ne se relit pas champ
 * par champ.
 *
 * L'ANNEAU DE FOCUS EST VERT, et c'est un des rares emplois du vert que son dossier autorise :
 * « le vert KiWee reserve aux actions positives, SELECTIONS et reperes importants ». Le champ ou
 * l'on ecrit est une selection.
 *
 * 32 px de haut au lieu de 36 : la hauteur de son bouton, pour qu'un champ et un bouton posés
 * cote a cote dans une barre de travail s'alignent au pixel.
 */
/* LE PLACEHOLDER EST PLUS PETIT QUE LA VALEUR, ET C'EST VOULU.
 *
 * Naoelle, 31/08/2026 : « meme les placeholders dans les barres de recherche sont super grands,
 * j'aime pas du tout ». Il etait a la taille du texte saisi — donc une invite grise occupait
 * exactement la place d'une vraie donnee, et un champ vide pesait autant qu'un champ rempli.
 *
 * `::placeholder` accepte sa propre taille sans toucher a celle de la valeur : le champ ne saute
 * pas a la frappe. Un point de moins et un gris plus clair suffisent a le faire reculer.
 *
 * Le champ passe de 32 a 34 px de haut pour la meme raison que les interlignes : le texte y etait
 * colle aux bords. */
const CONTROLE_BASE =
  'h-[34px] w-full rounded-km border border-km-line bg-km-surface px-2.5 text-km-body text-km-text ' +
  'placeholder:text-km-label placeholder:text-km-faint ' +
  'focus:border-km-green focus:outline-none focus:ring-1 focus:ring-km-green'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-km-label font-semibold text-km-muted', className)} {...props} />
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        CONTROLE_BASE,
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        CONTROLE_BASE, 'h-auto py-2',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    /* LE CHEVRON DU SYSTÈME LAISSE LA PLACE AU NÔTRE.
       `appearance-none` retire la flèche que le navigateur dessine — grise, pixelisée, différente
       sur chaque plateforme — et l'image de fond la remplace par un chevron aux traits de
       l'application. La liste, elle, reste dessinée par le navigateur hors de la page : c'est
       pourquoi les sélecteurs des barres de travail passent par `MenuChoix`, où tout nous
       appartient. Ici, dans un formulaire de dialogue, le natif garde sa valeur — clavier, saisie
       au premier caractère, sélecteur roulant sur mobile — et ne se montre qu'un instant. */
    <select
      ref={ref}
      className={cn(
        CONTROLE_BASE,
        'cursor-pointer appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'

export function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{required && <span className="ml-0.5 text-red-500">*</span>}</Label>
      {children}
    </div>
  )
}
