import { describe, expect, it } from 'vitest'
import { dateDebutProposee, dateFinPour, manquesDemande, type CompteurTradeo, type ResponsableTradeo } from '@/lib/tradeo/dossier'

const AUJ = new Date('2026-09-28T10:00:00Z')

describe('dates proposées à Tradeo', () => {
  it('commence au lendemain d’une échéance à venir', () => {
    expect(dateDebutProposee('2026-12-31', AUJ)).toBe('2027-01-01')
  })
  it('commence le 1er du mois prochain si l’échéance est passée ou inconnue', () => {
    expect(dateDebutProposee('2025-06-30', AUJ)).toBe('2026-10-01')
    expect(dateDebutProposee(null, AUJ)).toBe('2026-10-01')
  })
  it('finit la veille de l’anniversaire', () => {
    expect(dateFinPour('2027-01-01', 12)).toBe('2027-12-31')
    expect(dateFinPour('2026-10-01', 36)).toBe('2029-09-30')
  })
})

describe('manquesDemande', () => {
  const resp: ResponsableTradeo = { sex: 'M.', nom: 'Martin', prenom: 'Luc', email: 'l@x.fr', tele: '0600000000', fonction: 'gérant' }
  const elec: CompteurTradeo = { num_compteur: '07494934815891', site: '', type: 'ELEC', regie: 'non', dateDebut: '2027-01-01', dateFin: '2027-12-31' }

  it('ne dit rien d’une demande conforme à la documentation', () => {
    expect(manquesDemande('94715123900037', resp, [elec, { ...elec, type: 'GAZ', num_compteur: 'GI110001' }], AUJ)).toEqual([])
  })
  it('nomme chaque manque, sans en inventer la valeur', () => {
    const m = manquesDemande('9471512', { ...resp, sex: '', fonction: '' }, [{ ...elec, num_compteur: '123', dateDebut: '2026-01-01' }], AUJ)
    expect(m).toContain('Le SIRET doit contenir 14 chiffres.')
    expect(m).toContain('Responsable : civilité (M. ou Mme).')
    expect(m).toContain('Responsable : fonction.')
    expect(m.some((x) => x.includes('14 chiffres') && x.startsWith('123'))).toBe(true)
    expect(m.some((x) => x.includes('date de début'))).toBe(true)
  })
  it('laisse passer un numéro libre en régie', () => {
    expect(manquesDemande('94715123900037', resp, [{ ...elec, regie: 'oui', num_compteur: 'REGIE-42' }], AUJ)).toEqual([])
  })
})
