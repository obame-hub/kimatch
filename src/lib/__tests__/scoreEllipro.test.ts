import { describe, expect, it } from 'vitest'
import { palierScoreEllipro, scoreEnNombre } from '@/lib/scoreEllipro'

/**
 * Les trois bandes de William, 24/09/2026 : 0-2 rouge, 3-6 jaune, 7-10 vert.
 * Ce sont les BORNES qui comptent — c'est là que se joue « on y va » ou « on regarde à deux fois ».
 */
describe('palierScoreEllipro', () => {
  it('met 0, 1 et 2 en rouge', () => {
    for (const n of [0, 1, 2]) expect(palierScoreEllipro(n).bande).toBe('rouge')
  })

  it('met 3 à 6 en jaune', () => {
    for (const n of [3, 4, 5, 6]) expect(palierScoreEllipro(n).bande).toBe('jaune')
  })

  it('met 7 à 10 en vert', () => {
    for (const n of [7, 8, 9, 10]) expect(palierScoreEllipro(n).bande).toBe('vert')
  })

  it('arrondit avant de comparer, pour coller au chiffre affiché', () => {
    // 6,5 s'affiche « 7 » : il doit être vert, pas jaune.
    expect(palierScoreEllipro(6.5).bande).toBe('vert')
    expect(palierScoreEllipro(6.4).bande).toBe('jaune')
    expect(palierScoreEllipro(2.5).bande).toBe('jaune')
  })
})

describe('scoreEnNombre', () => {
  it('lit ce qu’Ellisphere rend, y compris avec une virgule', () => {
    expect(scoreEnNombre('7')).toBe(7)
    expect(scoreEnNombre('6,5')).toBe(6.5)
    expect(scoreEnNombre(8)).toBe(8)
  })

  it('rend null quand il n’y a rien à lire', () => {
    expect(scoreEnNombre(null)).toBeNull()
    expect(scoreEnNombre('')).toBeNull()
    expect(scoreEnNombre('n/a')).toBeNull()
  })
})
