import { describe, it, expect } from 'vitest'
import { euros, eurosOu, montantAvecUnite } from '@/lib/euros'

/**
 * Ces tests existent pour une raison précise : la règle « jamais d'arrondi sur un prix » a déjà été
 * perdue une fois, en se dispersant dans douze formateurs locaux aux comportements divergents. Un
 * test la rend impossible à reperdre en silence — quelqu'un qui repasse à
 * `maximumFractionDigits: 0` casse la suite, pas un écran de production.
 *
 * ON COMPARE SUR DES ESPACES NORMALISÉES, ET C'EST VOLONTAIRE. `toLocaleString('fr-FR')` sépare les
 * milliers par une espace fine insécable (U+202F) sur les ICU récents, par une insécable normale
 * (U+00A0) sur les plus anciens. Coder l'une des deux en dur ferait passer les tests ici et échouer
 * la CI sur une autre version de Node — un échec incompréhensible pour un détail invisible à l'œil.
 * Ce qu'on vérifie, ce sont les DÉCIMALES, pas la fonte d'espacement d'ICU.
 */
const normal = (s: string) => s.replace(/[\u202f\u00a0\u2009]/g, ' ')

describe('euros', () => {
  it('rend toujours deux décimales, même sur un compte rond', () => {
    expect(normal(euros(1234))).toBe('1 234,00 €')
  })

  it('n’arrondit pas le centime', () => {
    expect(normal(euros(30087.71))).toBe('30 087,71 €')
    expect(normal(euros(1038667.57))).toBe('1 038 667,57 €')
  })

  it('garde le signe : une différence budgétaire négative est un gain pour le client', () => {
    expect(normal(euros(-836125.61))).toBe('-836 125,61 €')
  })

  it('arrondit la troisième décimale au lieu de la tronquer', () => {
    expect(normal(euros(2.345))).toBe('2,35 €')
    expect(normal(euros(0.004))).toBe('0,00 €')
  })

  it('ne laisse pas le symbole partir seul à la ligne', () => {
    expect(euros(1)).toMatch(/[\u202f\u00a0\u2009]€$/)
  })
})

describe('eurosOu', () => {
  it('remplace une valeur absente par un tiret, par défaut', () => {
    expect(eurosOu(null)).toBe('—')
    expect(eurosOu(undefined)).toBe('—')
  })

  it('laisse l’écran choisir son texte de remplacement', () => {
    expect(eurosOu(null, 'à vérifier')).toBe('à vérifier')
  })

  it('ne confond pas zéro avec l’absence — un zéro est un montant', () => {
    expect(normal(eurosOu(0))).toBe('0,00 €')
  })
})

describe('montantAvecUnite', () => {
  it('garde deux décimales sur un prix unitaire, qui se multiplie ensuite par un volume', () => {
    expect(normal(montantAvecUnite(4.5, '€/MWh'))).toBe('4,50 €/MWh')
  })
})
