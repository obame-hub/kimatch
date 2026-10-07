import { describe, expect, it } from 'vitest'
import { dateClotureSuggereePour } from '@/components/opportunite/CreationRecommandationWizard'

/* Le plafond J+60 se teste à part : ici, un « aujourd'hui » lointain le met hors jeu. */
const loin = { aujourdhui: new Date(2026, 0, 1, 12), plafondJours: null }
const contrat = (preavis: number | null) => [{ date_fin: '2099-12-31', preavis_resiliation_jours: preavis, compteurs: [{ id: 'k1' }] }]

describe('la date de clôture conseillée (William, 06/10/2026 : jamais un week-end)', () => {
  it('échéance moins le préavis, un jour ouvré', () => {
    // 31/03/2027 − 60 j = samedi 30/01/2027 : elle recule au vendredi 29.
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-03-31' }], contrat(60), loin)).toBe('2027-01-29')
  })
  it('un jour férié recule aussi', () => {
    // 23/02/2027 − 60 j = vendredi 25/12/2026, Noël : jeudi 24.
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-02-23' }], contrat(60), loin)).toBe('2026-12-24')
  })
  it('un jour ouvré reste tel quel, préavis par défaut 60 j', () => {
    // 30/06/2027 − 60 j = vendredi 30/04/2027.
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-06-30' }], [], loin)).toBe('2027-04-30')
  })
  it('sans échéance, J+60 au jour ouvré (William, 07/10/2026) ; pas de date de préavis', () => {
    // 07/10/2026 + 60 j = dimanche 06/12/2026 → vendredi 04/12/2026.
    const auj = new Date(2026, 9, 7, 12)
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: null }], [], { aujourdhui: auj })).toBe('2026-12-04')
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: null }], [], { plafondJours: null })).toBe('')
  })
  it('au plus tard à J+60 : 31/08/2028 devient le 04/12/2026 un 06/10/2026 (le 05/12 est un samedi)', () => {
    const auj = new Date(2026, 9, 6, 12)
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2028-10-30' }], contrat(60), { aujourdhui: auj })).toBe('2026-12-04')
  })
  it('plus tôt que J+60, la règle du préavis reste', () => {
    const auj = new Date(2026, 9, 6, 12)
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-01-15' }], contrat(60), { aujourdhui: auj })).toBe('2026-11-16')
  })
})
