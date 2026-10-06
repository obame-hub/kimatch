import { describe, expect, it } from 'vitest'
import { dateClotureSuggereePour } from '@/components/opportunite/CreationRecommandationWizard'

const contrat = (preavis: number | null) => [{ date_fin: '2099-12-31', preavis_resiliation_jours: preavis, compteurs: [{ id: 'k1' }] }]

describe('la date de clôture conseillée (William, 06/10/2026 : jamais un week-end)', () => {
  it('échéance moins le préavis, un jour ouvré', () => {
    // 31/03/2027 − 60 j = samedi 30/01/2027 : elle recule au vendredi 29.
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-03-31' }], contrat(60))).toBe('2027-01-29')
  })
  it('un jour férié recule aussi', () => {
    // 23/02/2027 − 60 j = vendredi 25/12/2026, Noël : jeudi 24.
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-02-23' }], contrat(60))).toBe('2026-12-24')
  })
  it('un jour ouvré reste tel quel, préavis par défaut 60 j', () => {
    // 30/06/2027 − 60 j = vendredi 30/04/2027.
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: '2027-06-30' }], [])).toBe('2027-04-30')
  })
  it('sans échéance, rien n’est inventé', () => {
    expect(dateClotureSuggereePour([{ id: 'k1', date_echeance: null }], [])).toBe('')
  })
})
