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
