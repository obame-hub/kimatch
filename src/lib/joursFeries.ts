/** Jours fériés français, calculés plutôt que listés (Lundi de Pâques, Ascension et Pentecôte
 * dépendent de la date de Pâques — algorithme de Meeus/Jones/Butcher).
 *
 * Pourquoi ça compte : William, en réunion — « désactiver les jours fériés et tout le bordel,
 * parce que si tu demandes quelque chose le 15 août, aucun fournisseur ne bosse le 15 août, donc
 * tu ne pourras pas recevoir le 15 août. Ça peut paraître optionnel, mais ça ne l'est pas du
 * tout. » Une date de réception tombant un férié rend la demande intenable. */
function paques(annee: number): Date {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(annee, mois - 1, jour)
}

function cle(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const cache = new Map<number, Map<string, string>>()

/** Fériés légaux de France métropolitaine pour une année, indexés par date → libellé. */
export function joursFeriesFR(annee: number): Map<string, string> {
  const enCache = cache.get(annee)
  if (enCache) return enCache

  const p = paques(annee)
  const decale = (jours: number) => {
    const d = new Date(p)
    d.setDate(d.getDate() + jours)
    return d
  }

  const paires: [Date, string][] = [
    [new Date(annee, 0, 1), "Jour de l'an"],
    [decale(1), 'Lundi de Pâques'],
    [new Date(annee, 4, 1), 'Fête du travail'],
    [new Date(annee, 4, 8), 'Victoire 1945'],
    [decale(39), 'Ascension'],
    [decale(50), 'Lundi de Pentecôte'],
    [new Date(annee, 6, 14), 'Fête nationale'],
    [new Date(annee, 7, 15), 'Assomption'],
    [new Date(annee, 10, 1), 'Toussaint'],
    [new Date(annee, 10, 11), 'Armistice 1918'],
    [new Date(annee, 11, 25), 'Noël'],
  ]

  const map = new Map(paires.map(([date, nom]) => [cle(date), nom]))
  cache.set(annee, map)
  return map
}

/** Libellé du férié si la date en est un, sinon null. */
export function nomJourFerieFR(d: Date): string | null {
  return joursFeriesFR(d.getFullYear()).get(cle(d)) ?? null
}

/** Jour ouvré = ni week-end, ni férié. */
export function estJourOuvreFR(d: Date): boolean {
  const jour = d.getDay()
  if (jour === 0 || jour === 6) return false
  return nomJourFerieFR(d) === null
}
