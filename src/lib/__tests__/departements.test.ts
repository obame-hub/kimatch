import { describe, expect, it } from 'vitest'
import { departementFromCodePostal } from '@/lib/departements'

describe('departementFromCodePostal', () => {
  it('les deux premiers chiffres', () => {
    expect(departementFromCodePostal('68280')).toEqual({ code: '68', nom: 'Haut-Rhin' })
    expect(departementFromCodePostal('01000')).toEqual({ code: '01', nom: 'Ain' })
    expect(departementFromCodePostal('75008')).toEqual({ code: '75', nom: 'Paris' })
  })
  it('la Corse et l’outre-mer', () => {
    expect(departementFromCodePostal('20000')?.code).toBe('2A')
    expect(departementFromCodePostal('20100')?.code).toBe('2A')
    expect(departementFromCodePostal('20200')?.code).toBe('2B')
    expect(departementFromCodePostal('97400')).toEqual({ code: '974', nom: 'La Réunion' })
  })
  it('rien pour un code postal invalide', () => {
    expect(departementFromCodePostal('6828')).toBeNull()
    expect(departementFromCodePostal(null)).toBeNull()
    expect(departementFromCodePostal('00000')).toBeNull()
  })
})
