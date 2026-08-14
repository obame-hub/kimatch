import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge ne connaît pas l'échelle de taille de police custom "kw-*" (tailwind.config.js
// theme.extend.fontSize) : par défaut il classe "text-kw-xs" dans le même groupe que les couleurs
// de texte ("text-kw-green"...), puisque les deux ont la forme "text-{mot}". Résultat concret :
// dans tout cn('... text-kw-xs ...', 'text-kw-green'), twMerge élimine silencieusement text-kw-xs
// en le prenant pour une couleur de texte concurrente -- la taille retombe alors sur 16px par
// défaut au lieu de 10px. Bug découvert le 03/08/2026 (badges du header "deux fois trop gros").
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['kw-micro', 'kw-tiny', 'kw-xs', 'kw-sm', 'kw-base', 'kw-md', 'kw-lg', 'kw-xl', 'kw-h4', 'kw-h3', 'kw-h2', 'kw-h1', 'kw-display'] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}

/**
 * Retire les caracteres invisibles d'une saisie collee.
 *
 * Un copier-coller depuis Excel, un PDF ou un e-mail embarque regulierement des marques de
 * direction et des espaces sans largeur : U+200B a U+200F, U+202A a U+202E, U+2060, U+FEFF, plus
 * l'espace insecable. Ils ne se voient pas a l'ecran mais font partie de la valeur.
 *
 * Constate le 14/08/2026 : le PDL 21326772715289 de SDC LE FONTENAY avait ete colle avec deux
 * marques de direction (U+202D et U+202C). Il s'affichait correctement dans Kimatch, mais le
 * generateur de PDF les rendait comme un tiret et une virgule -- « - 21326772715289 , » sur le
 * mandat envoye au client. Ces caracteres cassent aussi toute comparaison : le meme numero saisi
 * a la main ne serait pas reconnu comme un doublon.
 */
export function nettoyerSaisie(valeur: string): string {
  return valeur
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
}
