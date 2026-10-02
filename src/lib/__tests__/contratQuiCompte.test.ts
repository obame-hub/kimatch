import { describe, expect, it } from 'vitest'
import { contratCompte, echeanceDuCompteur } from '@/lib/echeance'

/* Le compteur de William, 02/10/2026 : échéance déclarée au 31/03/2028, un contrat créé du 01/04/2028
   au 01/04/2030, ni signé ni validé. Il ne doit pas déplacer l'échéance. */
const nouveau = { date_debut: '2028-04-01', date_fin: '2030-04-01', date_signature: null, avancement: null, date_validation: null, actif: true }

describe('un contrat client ne compte que signé ET validé', () => {
  it('ni signé ni validé, signé seul, validé seul : ne compte pas', () => {
    expect(contratCompte(nouveau)).toBe(false)
    expect(contratCompte({ ...nouveau, date_signature: '2026-10-02' })).toBe(false)
    expect(contratCompte({ ...nouveau, date_validation: '2026-10-02T10:00:00Z' })).toBe(false)
  })
  it('signé (par la date ou par le cycle de signature) et validé : compte, sauf retiré', () => {
    expect(contratCompte({ ...nouveau, date_signature: '2026-10-02', date_validation: '2026-10-02T10:00:00Z' })).toBe(true)
    expect(contratCompte({ ...nouveau, avancement: 'SIGNE', date_validation: '2026-10-02T10:00:00Z' })).toBe(true)
    expect(contratCompte({ ...nouveau, date_signature: '2026-10-02', date_validation: '2026-10-02T10:00:00Z', actif: false })).toBe(false)
  })
  it('l’échéance reste celle déclarée tant que le contrat n’est pas signé et validé', () => {
    const e = echeanceDuCompteur('2028-03-31', [nouveau].filter(contratCompte), [], new Date('2026-10-02T12:00:00'))
    expect(e.date).toBe('2028-03-31')
    expect(e.nature).toBe('ESTIMEE')
  })
})
