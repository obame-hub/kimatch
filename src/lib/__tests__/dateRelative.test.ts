import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dateRelative, joursJusqua, tonDate } from '@/lib/dateRelative'

/**
 * CES TESTS ÉPINGLENT LE PIÈGE DES DATES SANS HEURE.
 *
 * `recommandations.date_cloture` est un `date` : PostgREST le rend « 2026-04-21 », sans heure.
 * `new Date('2026-04-21')` lit cette chaîne à minuit UTC, et une comparaison en heure locale d'été
 * (UTC+2) recule d'un jour — le bug qui avait fait afficher 20/08 là où la base portait 21/08.
 *
 * L'HEURE DE RÉFÉRENCE EST DONC FIGÉE À 23 H LOCALES, exprès : c'est le moment de la journée où le
 * décalage se manifeste. Un test posé à midi passerait même avec le bug.
 */
describe('dateRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 1er septembre 2026, 23 h heure de Paris — soit 21 h UTC le même jour.
    vi.setSystemTime(new Date('2026-09-01T21:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('la date du jour est « aujourd’hui », même à 23 h', () => {
    expect(joursJusqua('2026-09-01')).toBe(0)
    // L'apostrophe est typographique : c'est celle qu'`Intl` écrit, pas celle du clavier.
    expect(dateRelative('2026-09-01')).toBe('aujourd’hui')
  })

  it('compte les jours entiers, pas les heures', () => {
    expect(joursJusqua('2026-09-02')).toBe(1)
    expect(joursJusqua('2026-08-31')).toBe(-1)
    expect(dateRelative('2026-09-02')).toBe('demain')
    expect(dateRelative('2026-08-31')).toBe('hier')
  })

  it('accepte un horodatage complet et n’en garde que le jour', () => {
    expect(joursJusqua('2026-09-05T22:00:00.000Z')).toBe(4)
  })

  /* L'unité suit la façon dont on parle : en dessous de trois semaines les jours, jusqu'à deux ans
     les mois, au-delà les années. « dans 92 jours » ne se convertit pas en lisant. */
  it('passe aux mois au-delà de trois semaines', () => {
    expect(dateRelative('2026-09-15')).toBe('dans 14 jours')
    expect(dateRelative('2026-12-01')).toBe('dans 3 mois')
    expect(dateRelative('2026-04-21')).toBe('il y a 4 mois')
  })

  it('passe aux années au-delà de deux ans', () => {
    expect(dateRelative('2028-10-31')).toBe('dans 2 ans')
  })

  it('ne rend rien sans date', () => {
    expect(dateRelative(null)).toBeNull()
    expect(dateRelative(undefined)).toBeNull()
    expect(joursJusqua(null)).toBeNull()
  })

  /* Le ton n'a que trois niveaux : ce qui est passé, ce qui tombe dans le mois, le reste. Un
     quatrième ferait un dégradé que l'œil ne distinguerait plus. */
  it('donne le ton d’une échéance', () => {
    expect(tonDate('2026-08-31')).toBe('passe')
    expect(tonDate('2026-09-01')).toBe('proche')
    expect(tonDate('2026-10-01')).toBe('proche')
    expect(tonDate('2026-10-03')).toBe('loin')
  })
})
