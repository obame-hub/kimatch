import { describe, expect, it } from 'vitest'
import { dureeMax, dureeMaxPerimetre, plusMois } from '@/lib/dureesFournisseur'

const d = (a: number, m: number, j: number) => new Date(a, m - 1, j, 12)

describe('les durées d’un fournisseur (William, 06/10/2026)', () => {
  it('Gaz Européen, début 01/03/2028, fin au plus tard 01/01/2032 : 46 mois au plus', () => {
    expect(dureeMax(d(2028, 3, 1), '2032-01-01')).toBe(46)
  })
  it('36 mois tiennent, 48 non', () => {
    expect(plusMois(d(2028, 3, 1), 36) <= d(2032, 1, 1)).toBe(true)
    expect(plusMois(d(2028, 3, 1), 48) <= d(2032, 1, 1)).toBe(false)
  })
  it('sans limite renseignée : 60 mois', () => {
    expect(dureeMax(d(2028, 3, 1), null)).toBe(60)
  })
  it('limite déjà passée : aucune durée', () => {
    expect(dureeMax(d(2032, 3, 1), '2032-01-01')).toBe(0)
  })
  it('multisite : le compteur le plus contraint décide', () => {
    expect(dureeMaxPerimetre([d(2028, 3, 1), d(2028, 9, 1)], '2032-01-01')).toBe(40)
  })
  it('un 31 sans équivalent recule au dernier jour du mois', () => {
    expect(plusMois(d(2027, 1, 31), 1).getDate()).toBe(28)
  })
})
