/** Force un texte en MAJUSCULES (accents conservés) -- convention Kimatch pour tout ce qui est
 * envoye en base (noms de compte, adresses...), identique a la regle appliquee dans Tools. */
export function toUpperFR(value: string | null | undefined): string {
  if (!value) return ''
  return value.toLocaleUpperCase('fr-FR').trim()
}

/** Formate un numero de telephone francais vers +33XXXXXXXXX. Repli : renvoie la valeur nettoyee
 * (sans espaces/points/tirets) si elle n'est pas reconnaissable comme un numero francais -- ne
 * bloque jamais la saisie, juste une conversion best-effort (meme logique que Tools). */
export function formatPhoneFR(value: string): string {
  const cleaned = value.replace(/[\s.\-()/]/g, '')
  if (/^\+33\d{9}$/.test(cleaned)) return cleaned
  if (/^0033\d{9}$/.test(cleaned)) return '+33' + cleaned.slice(4)
  if (/^33\d{9}$/.test(cleaned)) return '+' + cleaned
  if (/^0\d{9}$/.test(cleaned)) return '+33' + cleaned.slice(1)
  if (cleaned.startsWith('+')) return cleaned
  return cleaned
}

export function isValidPhoneFR(value: string): boolean {
  if (!value) return true
  return /^\+\d{8,15}$/.test(value)
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/** Title-case sur blur pour les prénoms (gère les composés "jean-pierre" -> "Jean-Pierre"),
 * même règle que Tools. */
export function toTitleCaseFR(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toLocaleLowerCase('fr-FR')
    .split(/(\s|-)/)
    .map((part) => (part === ' ' || part === '-' ? part : part.charAt(0).toLocaleUpperCase('fr-FR') + part.slice(1)))
    .join('')
}
