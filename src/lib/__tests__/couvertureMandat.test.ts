import { describe, expect, it } from 'vitest'
import { mandatKiweeCouvre } from '@/lib/couvertureMandat'
import type { Mandat } from '@/types/domain'

const mandat = (p: Partial<Mandat>): Mandat => ({
  id: 'm', reference: null, id_salesforce: null, compte_id: 'c', compte_nom: 'C', statut: 'ACTIF',
  date_signature: null, date_envoi: null, date_debut_validite: '2025-01-01', date_fin_validite: '2028-01-01',
  nb_sites_couverts: 1, site_ids: [], compteur_ids: ['x'], compteur_ids_caducs: [], proprietaire_id: null,
  cree_par_id: null, courtier_codes: ['KIWI'], ...p,
})
const J = '2026-09-30'

describe('mandatKiweeCouvre', () => {
  it('couvre avec un mandat KiWee actif et valide', () => {
    expect(mandatKiweeCouvre([mandat({})], 'x', J)).toBe(true)
  })
  it('ne couvre pas : autre compteur, lien caduc, statut non actif', () => {
    expect(mandatKiweeCouvre([mandat({})], 'y', J)).toBe(false)
    expect(mandatKiweeCouvre([mandat({ compteur_ids_caducs: ['x'] })], 'x', J)).toBe(false)
    expect(mandatKiweeCouvre([mandat({ statut: 'ENVOYE' })], 'x', J)).toBe(false)
  })
  it('ne couvre pas : Energix seul, ou validité passée', () => {
    expect(mandatKiweeCouvre([mandat({ courtier_codes: ['ENERGIX'] })], 'x', J)).toBe(false)
    expect(mandatKiweeCouvre([mandat({ date_fin_validite: '2026-09-29' })], 'x', J)).toBe(false)
    expect(mandatKiweeCouvre([mandat({ date_fin_validite: '2026-09-30' })], 'x', J)).toBe(true)
  })
  it('sans aucun mandat, rien', () => {
    expect(mandatKiweeCouvre(undefined, 'x', J)).toBe(false)
  })
})
