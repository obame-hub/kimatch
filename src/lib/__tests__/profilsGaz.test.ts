import { describe, expect, it } from 'vitest'
import { PROFILS_GAZ, partMensuelleCar, partsDuProfil } from '@/lib/profilsGaz'

describe('répartition mensuelle de la CAR par profil gaz', () => {
  it.each(PROFILS_GAZ)('%s fait 100 % sur l’année', (p) => {
    const total = partsDuProfil(p).reduce((s, v) => s + v, 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.05)
  })

  it('lit le tableau de William au bon mois (janvier P019 = 21,3 %, août P019 = 0,1 %)', () => {
    expect(partMensuelleCar('P019', 0)).toBe(21.3)
    expect(partMensuelleCar('p019', 7)).toBe(0.1)
    expect(partMensuelleCar('P013', 9)).toBe(12.7)
  })

  it('un profil inconnu ne donne rien', () => {
    expect(partMensuelleCar('P020', 0)).toBeNull()
    expect(partMensuelleCar(null, 0)).toBeNull()
  })
})
