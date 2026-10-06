import { describe, expect, it } from 'vitest'
import { depuisBrouillon, versBrouillon } from '@/lib/pricing/brouillon'
import type { SaisieLigne } from '@/lib/data/chiffrage'

const vide: SaisieLigne = { abonnementMois: null, marge: null, p0: null, cee: null, cpb: null, p0Postes: {}, capacite: null, inclus: [] }
const POSTES = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE']

describe('les cases P0 du Pricer se saisissent marge incluse (William, 06/10/2026)', () => {
  it('115 €/MWh avec 12 de marge : le P0 hors marge est 103', () => {
    const initial = versBrouillon(vide, [])
    const s = depuisBrouillon({ ...initial, p0: '115', marge: '12' }, [], vide, initial)
    expect(s.p0).toBe(103)
    expect(s.marge).toBe(12)
  })

  it('en électricité, chaque poste perd la marge', () => {
    const initial = versBrouillon(vide, POSTES)
    const s = depuisBrouillon({ ...initial, p0_HPH: '120,50', p0_HCE: '80', marge: '10' }, POSTES, vide, initial)
    expect(s.p0Postes.HPH).toBe(110.5)
    expect(s.p0Postes.HCE).toBe(70)
    expect(s.p0Postes.POINTE).toBeNull()
  })

  it('un prix en base se montre marge incluse, et revient intact sans retouche', () => {
    const enBase: SaisieLigne = { ...vide, p0: 103.4567, marge: 12 }
    const initial = versBrouillon(enBase, [])
    expect(initial.p0).toBe('115,46')
    expect(depuisBrouillon({ ...initial, abonnementMois: '30' }, [], enBase, initial).p0).toBe(103.4567)
  })

  it('changer la marge garde le prix coté : c’est le P0 hors marge qui bouge', () => {
    const enBase: SaisieLigne = { ...vide, p0: 103.4567, marge: 12 }
    const initial = versBrouillon(enBase, [])
    const s = depuisBrouillon({ ...initial, marge: '10' }, [], enBase, initial)
    expect(s.p0).toBe(105.4567)
    expect(s.marge).toBe(10)
  })

  it('sans marge, le prix saisi est le P0', () => {
    const initial = versBrouillon(vide, [])
    expect(depuisBrouillon({ ...initial, p0: '42' }, [], vide, initial).p0).toBe(42)
  })
})

describe('la colonne Pointe se retire (William, 06/10/2026)', async () => {
  const { postesAffiches, saisieComplete } = await import('@/lib/data/chiffrage')
  const compteur = (sansPointe: boolean, conso: Record<string, number>) => ({
    vcId: 'v', compteurId: 'c', numero: '1', libelle: '', energie: 'electricite' as const, car: null, profil: null, tarif: null, segment: 'C4', conso,
    fournisseurActuelId: null, fournisseurActuelNom: null, site: null, codePostal: null, sansPointe, reglementaire: null,
  })
  const saisie: SaisieLigne = { ...vide, abonnementMois: 10, marge: 5, capacite: 1, cee: 2, p0Postes: { HPH: 90, HCH: 70, HPE: 80, HCE: 60 } }

  it('un compteur sans pointe n’en montre plus la colonne', () => {
    expect(postesAffiches(compteur(true, { HPH: 1, HCH: 1, HPE: 1, HCE: 1 }))).toEqual(['HPH', 'HCH', 'HPE', 'HCE'])
    expect(postesAffiches(compteur(false, { HPH: 1 }))).toEqual(POSTES)
  })

  it('un compteur qui consomme en pointe la garde', () => {
    expect(postesAffiches(compteur(true, { POINTE: 2, HPH: 1 }))).toContain('POINTE')
  })

  it('sans consommation connue, la ligne est complète sans prix de pointe', () => {
    expect(saisieComplete(compteur(true, {}), saisie)).toBe(true)
    expect(saisieComplete(compteur(false, {}), saisie)).toBe(false)
  })
})
