/**
 * LA DISTANCE D'UNE DATE, EN FRANÇAIS — « dans 3 mois », « il y a 8 jours », « aujourd'hui ».
 *
 * Michel, 01/09/2026 : « qu'on mette des dates relatives en interligne ». La demande vient de la
 * lecture des cartes de recommandation : une carte annonçait « Clôture prévue 21/04/2026 » et il
 * fallait compter de tête pour savoir si c'était demain ou dans un an — sur un tableau de 1 700
 * dossiers, personne ne compte.
 *
 * LA DATE EXACTE RESTE, LA DISTANCE S'AJOUTE EN DESSOUS. Remplacer l'une par l'autre aurait été un
 * mauvais échange : « dans 3 mois » ne permet pas de préparer un rendez-vous, et une date seule ne
 * dit pas l'urgence. Les deux lignes disent deux choses différentes.
 *
 * ══ POURQUOI PAS `Intl.RelativeTimeFormat` SEUL ══
 *
 * Il sait écrire « dans 92 jours » mais pas choisir l'unité : c'est à l'appelant de décider s'il
 * parle en jours, en mois ou en années. Et son choix par défaut sur un nombre de jours donne
 * « dans 92 jours », qu'aucun commercial ne convertit en « trois mois » en lisant. On choisit donc
 * l'unité ici, et on lui laisse l'accord et le vocabulaire — c'est ce qu'il fait de mieux.
 *
 * ══ LE PIÈGE DES DATES SANS HEURE ══
 *
 * `recommandations.date_cloture` est un `date` : PostgREST le rend « 2026-04-21 ». `new Date()` lit
 * cette chaîne en UTC, et une comparaison en heure locale d'été décale d'un jour — le bug qui avait
 * fait lire 20/08 là où la base portait 21/08 (voir `echeance.ts`, même précaution). On découpe donc
 * la chaîne et on compare des jours entiers en UTC : à minuit près, personne ne verra jamais
 * « il y a 1 jour » sur la date du jour.
 */

const FORMAT = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

/** Le jour d'une date ISO, en millisecondes UTC, l'heure jetée. */
function jourUtc(iso: string): number {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(a, (m ?? 1) - 1, j ?? 1)
}

/** Le jour courant, même échelle — pour que la soustraction porte sur des jours entiers. */
function aujourdhuiUtc(): number {
  const n = new Date()
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
}

/**
 * Le nombre de jours entre aujourd'hui et la date donnée. Positif dans le futur.
 * Exporté parce qu'un écran a parfois besoin du signe, pas de la phrase — une couleur d'alerte.
 */
export function joursJusqua(iso: string | null | undefined): number | null {
  if (!iso) return null
  const j = jourUtc(iso)
  if (Number.isNaN(j)) return null
  return Math.round((j - aujourdhuiUtc()) / 86_400_000)
}

/**
 * La distance en français, unité choisie selon l'écart.
 *
 * Les seuils suivent la façon dont on parle, pas des puissances de dix : en dessous de trois
 * semaines on compte les jours, jusqu'à deux ans les mois, au-delà les années. « dans 18 mois » se
 * lit mieux que « dans 1 an », qui arrondirait six mois de travail à rien.
 *
 * Rend `null` quand il n'y a pas de date : l'appelant n'affiche rien, plutôt qu'un tiret qui
 * ressemble à une valeur.
 */
export function dateRelative(iso: string | null | undefined): string | null {
  const jours = joursJusqua(iso)
  if (jours == null) return null
  const abs = Math.abs(jours)
  if (abs <= 1) return FORMAT.format(jours, 'day') // hier · aujourd'hui · demain
  if (abs < 21) return FORMAT.format(jours, 'day')
  if (abs < 730) return FORMAT.format(Math.round(jours / 30.44), 'month')
  return FORMAT.format(Math.round(jours / 365.25), 'year')
}

/**
 * Le ton à donner à la distance — pour qu'un retard se voie sans avoir à lire.
 *
 * Trois tons seulement : ce qui est passé, ce qui arrive dans le mois, et le reste. Un quatrième
 * niveau ferait un dégradé que l'œil ne distinguerait plus.
 */
export type TonDate = 'passe' | 'proche' | 'loin'

export function tonDate(iso: string | null | undefined): TonDate | null {
  const jours = joursJusqua(iso)
  if (jours == null) return null
  if (jours < 0) return 'passe'
  if (jours <= 31) return 'proche'
  return 'loin'
}
