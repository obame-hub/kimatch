import { describe, expect, it } from 'vitest'
import { auCentime, budgetElec, budgetGaz, lireNombre, postesAPricer, postesDuCompteur, ttcDuBudget } from '@/lib/pricing/budget'

/* Les chiffres viennent des deux comparatifs de William du 01/10/2026 : ils doivent tomber à l'euro. */

describe('budget gaz (AO-2026-0418, CAR 285 MWh)', () => {
  const communs = { car: 285, tqd: 10.62, accise: 16.39, cta: 318 }

  it('GME fixe 24 mois : 22 174 € HTVA', () => {
    // Molécule présentée 39,45 = P0 37,45 + marge 2,00.
    // Le CPB (1,85) vient des communs et compte dans l'énergie (06/10/2026) ; le total ne bouge pas.
    const b = budgetGaz({ ...communs, cpb: 1.85 }, { abonnementMois: 28, p0: 37.45, marge: 2, cee: 7.2, cpb: null })!
    expect(Math.round(b.abonnement)).toBe(336)
    expect(Math.round(b.energie)).toBe(13823)
    expect(Math.round(b.acheminement)).toBe(3027)
    expect(Math.round(b.taxes)).toBe(4989)
    expect(Math.round(b.total)).toBe(22174)
    expect(b.totalMwh).toBeCloseTo(48.5, 6)
  })

  it('ENGIE actuel : 24 370 €', () => {
    const b = budgetGaz(communs, { abonnementMois: 40, p0: 49.2, marge: 0, cee: 6.5, cpb: 0 })!
    expect(Math.round(b.total)).toBe(24370)
  })

  it('une case vide compte pour zéro, et le budget n’est pas complet', () => {
    const b = budgetGaz(communs, { abonnementMois: 28, p0: null, marge: 2, cee: 7.2, cpb: 1.85 })!
    expect(b.complet).toBe(false)
    expect(b.totalMwh).toBeCloseTo(11.05, 6)
    expect(budgetGaz(communs, { abonnementMois: null, p0: null, marge: null, cee: null, cpb: null })).toBeNull()
  })

  it('sans communs, le budget s’entend hors acheminement et taxes', () => {
    const b = budgetGaz({ car: 285, tqd: null, accise: null, cta: null }, { abonnementMois: 28, p0: 37.45, marge: 2, cee: 7.2, cpb: 1.85 })!
    expect(b.complet).toBe(true)
    expect(b.total).toBe(14158.5)
  })
})

describe('budget électricité (AO-2026-0419, 510 MWh sur 5 postes)', () => {
  const communs = { conso: { POINTE: 18, HPH: 142, HCH: 86, HPE: 168, HCE: 96 }, turpe: 14280, accise: 22.5, cta: 1240 }

  it('GME 24 mois : 90 702 € HTVA', () => {
    const b = budgetElec(communs, {
      abonnementMois: 55, marge: 2, capacite: 5.1, cee: 10.2,
      p0: { POINTE: 166.4, HPH: 139.2, HCH: 102.6, HPE: 94.3, HCE: 70.8 },
    })!
    expect(Math.round(b.abonnement)).toBe(660)
    expect(Math.round(b.energie)).toBe(63047)
    expect(Math.round(b.taxes)).toBe(12715)
    expect(Math.round(b.total)).toBe(90702)
  })

  it('un poste sans prix : le budget se construit, sans être complet', () => {
    const b = budgetElec(communs, { abonnementMois: 55, marge: 2, capacite: 5.1, cee: 10.2, p0: { POINTE: 166.4 } })!
    expect(b.complet).toBe(false)
    expect(b.energie).toBeCloseTo(18 * 168.4 + 492 * 2 + 510 * 15.3, 2)
  })

  it('les montants tombent au centime', () => {
    const b = budgetElec({ conso: { BASE: 1 / 3 }, turpe: null, accise: null, cta: null }, { abonnementMois: null, marge: 0, capacite: 0, cee: 0, p0: { BASE: 1 } })!
    expect(b.total).toBe(0.33)
  })

  it('les cinq postes se montrent toujours, Base / HP / HC seulement quand ils consomment', () => {
    expect(postesDuCompteur({})).toEqual(['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'])
    expect(postesDuCompteur({ HPH: 0.042, HCH: 0, HPE: 4.361, HCE: 1.23 })).toEqual(['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'])
    expect(postesDuCompteur({ BASE: 12 })).toEqual(['POINTE', 'HPH', 'HCH', 'HPE', 'HCE', 'BASE'])
  })

  it('un poste à 0 MWh ne bloque pas la ligne', () => {
    expect(postesAPricer({ HPH: 0.042, HCH: 0, HPE: 4.361, HCE: 1.23 })).toEqual(['HPH', 'HPE', 'HCE'])
    expect(postesAPricer({})).toEqual(['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'])
    const b = budgetElec({ conso: { HPH: 1, HPE: 2 }, turpe: null, accise: null, cta: null }, { abonnementMois: 10, marge: 1, capacite: 1, cee: 1, p0: { HPH: 100, HPE: 50 } })!
    expect(b.complet).toBe(true)
  })
})

describe('la TVA : 20 % sur tout, CTA comprise', () => {
  it('un budget de 1 000 € HT, CTA comprise', () => {
    expect(ttcDuBudget({ total: 1000 })).toBe(1200)
  })
  it('en gaz, la CTA entre dans le budget comme le reste', () => {
    const b = budgetGaz({ car: 100, tqd: 12.79, accise: 16.66, cta: 48.62, cpb: 2.6325 }, { abonnementMois: 30, p0: 40, marge: 2, cee: 7, cpb: null })!
    // 360 + 100 × 49 + 100 × 12,79 + 100 × (16,66 + 2,6325) + 48,62
    expect(b.total).toBe(auCentime(360 + 4900 + 1279 + 1929.25 + 48.62))
  })
})

describe('la marge s’ajoute aux P0, une seule fois', () => {
  it('gaz : P0 50 + marge 10 = 60 €/MWh présenté, sur 100 MWh', () => {
    const b = budgetGaz({ car: 100, tqd: null, accise: null, cta: null }, { abonnementMois: 0, p0: 50, marge: 10, cee: 0, cpb: null })!
    expect(b.energie).toBe(6000)
    expect(b.total).toBe(6000)
  })

  it('électricité : chaque poste à P0 + marge, capacité et CEE sans marge', () => {
    const b = budgetElec({ conso: { HPH: 10, HPE: 20 }, turpe: null, accise: null, cta: null }, { abonnementMois: 0, marge: 10, capacite: 1, cee: 2, p0: { HPH: 50, HPE: 40 } })!
    // 10 × (50 + 10) + 20 × (40 + 10) + 30 × (1 + 2) = 600 + 1 000 + 90
    expect(b.energie).toBe(1690)
  })
})

describe('lecture des nombres saisis', () => {
  it('accepte la virgule et les espaces', () => {
    expect(lireNombre('1 240,50')).toBe(1240.5)
    expect(lireNombre('')).toBeNull()
    expect(lireNombre('abc')).toBeNull()
  })
})
