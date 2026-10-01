import { describe, expect, it } from 'vitest'
import {
  ajouterMois, datesRetenues, debutDepuisFin, derniereFinConnue, dureeProposee, finDepuisDebut, moisEntre,
} from '@/lib/contratsProspects'
import { echeanceDuCompteur } from '@/lib/echeance'

const AUJOURDHUI = new Date(2026, 9, 1)

describe('les dates d’un contrat prospect', () => {
  it('le cas de William : fin client au 31/12/2027, EDF jusqu’au 31/12/2029 → 24 mois, début au 01/01/2028', () => {
    expect(dureeProposee('2027-12-31', '2029-12-31')).toBe(24)
    expect(datesRetenues({ fin: '2029-12-31', duree: 24, finPrecedente: '2027-12-31' }))
      .toEqual({ date_debut: '2028-01-01', date_fin: '2029-12-31', calculee: 'debut' })
  })

  it('compte les mois du début à la fin incluse', () => {
    expect(moisEntre('2028-01-01', '2029-12-31')).toBe(24)
    expect(moisEntre('2026-01-01', '2026-06-30')).toBe(6)
    expect(moisEntre('2026-07-15', '2027-07-14')).toBe(12)
  })

  it('déduit le début de la fin, et la fin du début', () => {
    expect(debutDepuisFin('2029-12-31', 24)).toBe('2028-01-01')
    expect(finDepuisDebut('2028-01-01', 24)).toBe('2029-12-31')
    expect(finDepuisDebut('2026-07-15', 12)).toBe('2027-07-14')
  })

  it('un 31 qui n’existe pas devient le dernier jour du mois', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('ne propose rien sans fin précédente, ni pour une échéance antérieure', () => {
    expect(dureeProposee(null, '2029-12-31')).toBeNull()
    expect(dureeProposee('2029-12-31', '2027-12-31')).toBeNull()
  })

  it('fin seule : le contrat prend la suite du précédent', () => {
    expect(datesRetenues({ fin: '2029-12-31', duree: null, finPrecedente: '2027-12-31' }))
      .toEqual({ date_debut: '2028-01-01', date_fin: '2029-12-31', calculee: 'debut' })
    expect(datesRetenues({ fin: '2029-12-31', duree: null, finPrecedente: null }))
      .toEqual({ date_debut: null, date_fin: '2029-12-31', calculee: null })
  })

  it('durée seule après un contrat connu : la fin se calcule', () => {
    expect(datesRetenues({ fin: null, duree: 36, finPrecedente: '2027-12-31' }))
      .toEqual({ date_debut: '2028-01-01', date_fin: '2030-12-31', calculee: 'fin' })
  })

  it('rien de connu : fin Indéterminée', () => {
    expect(datesRetenues({ fin: null, duree: null, finPrecedente: null })).toEqual({ date_debut: null, date_fin: null, calculee: null })
  })

  it('la fin précédente ignore ce qui finit après le contrat corrigé', () => {
    const contrats = [{ date_debut: null, date_fin: '2027-12-31' }, { date_debut: null, date_fin: '2031-12-31' }]
    expect(derniereFinConnue(contrats)).toBe('2031-12-31')
    expect(derniereFinConnue(contrats, '2029-12-31')).toBe('2027-12-31')
  })
})

describe('l’échéance du compteur, contrats prospects compris', () => {
  const client = { date_fin: '2027-12-31', date_creation: '2025-01-01' }

  it('sans contrat prospect, rien ne change : le contrat client en cours fait foi', () => {
    const e = echeanceDuCompteur('2027-06-30', [client], [], AUJOURDHUI)
    expect(e).toMatchObject({ nature: 'PROUVEE', date: '2027-12-31', source: 'REGLE_CLIENT', indeterminee: false })
  })

  it('sans aucun contrat, la date déclarée reste lue', () => {
    expect(echeanceDuCompteur('2027-01-01', [], [], AUJOURDHUI)).toMatchObject({ nature: 'ESTIMEE', date: '2027-01-01' })
  })

  it('un contrat prospect qui suit le contrat client donne la nouvelle échéance', () => {
    const e = echeanceDuCompteur('2027-12-31', [client], [{ id: 'p', date_fin: '2029-12-31', date_creation: '2026-10-01' }], AUJOURDHUI)
    expect(e).toMatchObject({ nature: 'ESTIMEE', date: '2029-12-31', source: 'CONTRAT_PROSPECT', prospectId: 'p', dateDeclaree: '2027-12-31' })
  })

  it('une fin Indéterminée passe devant tout et se dit « Indéterminée »', () => {
    const e = echeanceDuCompteur(null, [client], [{ id: 'p', date_fin: null }], AUJOURDHUI)
    expect(e).toMatchObject({ date: null, indeterminee: true, source: 'CONTRAT_PROSPECT' })
  })

  it('un contrat saisi ensuite qui démarre avec ou après l’Indéterminé le remplace', () => {
    const indetermine = { id: 'i', date_debut: '2030-01-01', date_fin: null, date_creation: '2026-09-01' }
    const suivant = { id: 's', date_debut: '2030-01-01', date_fin: '2031-12-31', date_creation: '2026-10-01' }
    expect(echeanceDuCompteur(null, [client], [indetermine, suivant], AUJOURDHUI)).toMatchObject({ date: '2031-12-31', prospectId: 's' })
  })

  it('un Indéterminé reste devant un contrat qui commence avant lui', () => {
    const indetermine = { id: 'i', date_debut: '2030-01-01', date_fin: null }
    const avant = { id: 'a', date_debut: '2028-01-01', date_fin: '2029-12-31' }
    expect(echeanceDuCompteur(null, [client], [avant, indetermine], AUJOURDHUI)).toMatchObject({ indeterminee: true, prospectId: 'i' })
  })

  it('un contrat prospect plus ancien que le contrat client ne le remplace pas', () => {
    const e = echeanceDuCompteur(null, [client], [{ id: 'p', date_fin: '2024-12-31' }], AUJOURDHUI)
    expect(e).toMatchObject({ nature: 'PROUVEE', date: '2027-12-31', source: 'REGLE_CLIENT' })
  })
})
