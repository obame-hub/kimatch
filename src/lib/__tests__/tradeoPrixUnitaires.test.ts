import { describe, expect, it } from 'vitest'
import { comparerMarges, lireOffresTradeo, rapprocherFournisseur } from '@/lib/tradeo/prixUnitaires'

/* Les trois réponses sont celles de la documentation EnergieX v1.4 (section 9), réduites aux champs
   que le module lit. Si Tradeo change sa forme, c'est ici que ça doit casser d'abord. */

const GAZ_SIMPLE = {
  GI110001: {
    result: true,
    resultatFinal: {
      dataCta: { CTA: 321.71 },
      result: {
        GI110001: [
          {
            fournisseur: 'Engie', typeFournisseur: 'actuel', typeOffre: 'Fixe',
            budgetHt: 6911.53, budgetTTC: 8293.836, DUREE: 24, prixMolucule: 53.46, marge: 0.0,
            dateDebut: '2026-08-01', dateFin: '2028-07-31', success: true, actuel: true,
          },
          { fournisseur: 'SaveEnergies', typeFournisseur: 'simple', budgetHt: 6043.61, budgetTTC: 7252.332, marge: 15.0, success: true, actuel: false },
          { fournisseur: 'Ekwateur', success: false, message: 'le score Ellipro minimum est 5.0', typeFournisseur: 'erreur', budgetHt: 0, BudgetTTC: 0 },
        ],
      },
    },
  },
}

const annee = (debut: string, fin: string, prixMolecule: number) => ({
  dataMoyenne: {
    lesPrixFinal: { preMarge: 0, margeAppliquer: 0, nomFournisseur: 'Alpiq', dateDebut: debut, dateFin: fin, prixMolecule, abo: 43.94, cee: 0 },
    margeAppliquer: 0,
  },
})

const GAZ_ANNUEL = {
  GI110001: {
    result: true,
    resultatFinal: {
      result: {
        GI110001: [
          {
            '2027-01-01->2027-12-31': annee('2027-01-01', '2027-12-31', 109.86),
            '2028-01-01->2028-12-31': annee('2028-01-01', '2028-12-31', 69.19),
            lesCleAnnuelleDesPeriode: ['2027-01-01->2027-12-31', '2028-01-01->2028-12-31'],
            typePrix: 'annuelle', budgetHt: 8169.144, budgetTTC: 9802.973,
            prixMolucule: 89.525, fournisseur: 'Alpiq', typeOffre: 'Fixe', success: true,
          },
        ],
      },
    },
  },
}

describe('lireOffresTradeo', () => {
  it('sort le prix de la molécule d’une offre simple, sous son vrai nom', () => {
    const { offres } = lireOffresTradeo(GAZ_SIMPLE)
    const engie = offres.find((o) => o.fournisseur === 'Engie')!
    expect(engie.actuel).toBe(true)
    expect(engie.periodes).toHaveLength(1)
    expect(engie.periodes[0].prix).toEqual({ prixMolecule: 53.46 })
    expect(engie.sansPrixUnitaire).toBe(false)
  })

  it('signale l’offre qui ne rend qu’un budget, au lieu de l’utiliser', () => {
    const save = lireOffresTradeo(GAZ_SIMPLE).offres.find((o) => o.fournisseur === 'SaveEnergies')!
    expect(save.budgetHt).toBe(6043.61)
    expect(save.periodes).toEqual([])
    expect(save.sansPrixUnitaire).toBe(true)
  })

  it('garde le refus d’un fournisseur et son motif', () => {
    const ekw = lireOffresTradeo(GAZ_SIMPLE).offres.find((o) => o.fournisseur === 'Ekwateur')!
    expect(ekw.succes).toBe(false)
    expect(ekw.message).toBe('le score Ellipro minimum est 5.0')
    expect(ekw.sansPrixUnitaire).toBe(false)
    expect(ekw.budgetTtc).toBe(0)
  })

  it('rend une période par année, sans y mêler la moyenne de la racine', () => {
    const [alpiq] = lireOffresTradeo(GAZ_ANNUEL).offres
    expect(alpiq.periodes.map((p) => [p.debut, p.prix.prixMolecule])).toEqual([
      ['2027-01-01', 109.86],
      ['2028-01-01', 69.19],
    ])
    expect(alpiq.periodes[0].prix.abo).toBe(43.94)
    expect(alpiq.periodes[0].margeAppliquee).toBe(0)
  })

  it('remonte le refus d’un compteur entier', () => {
    const { offres, erreurs } = lireOffresTradeo({ '07494934815891': { result: false, message: 'marge (1) doit être comprise entre 2 et 30' } })
    expect(offres).toEqual([])
    expect(erreurs[0].message).toContain('marge')
  })
})

describe('comparerMarges', () => {
  it('un résidu nul dit que la marge est entièrement dans le prix', () => {
    const a = lireOffresTradeo(GAZ_ANNUEL).offres
    const plus5 = JSON.parse(JSON.stringify(GAZ_ANNUEL))
    const liste = plus5.GI110001.resultatFinal.result.GI110001[0]
    liste['2027-01-01->2027-12-31'].dataMoyenne.lesPrixFinal.prixMolecule += 5
    liste['2028-01-01->2028-12-31'].dataMoyenne.lesPrixFinal.prixMolecule += 5
    const ecarts = comparerMarges(a, lireOffresTradeo(plus5).offres, 2, 7)
    expect(ecarts.map((e) => e.residu)).toEqual([0, 0])
    expect(ecarts.every((e) => e.champ === 'prixMolecule')).toBe(true)
  })
})

describe('rapprocherFournisseur', () => {
  const kimatch = [{ nom: 'GAZ DE BORDEAUX' }, { nom: 'LA BELLENERGIE' }, { nom: 'SAVE' }, { nom: 'PRIMEO ENERGIE' }, { nom: 'EDF' }, { nom: 'EDF ENR' }]
  it.each([
    ['Gaz_de_Bordeaux', 'GAZ DE BORDEAUX'],
    ['la_bellenergie', 'LA BELLENERGIE'],
    ['SaveEnergies', 'SAVE'],
    ['Primeo', 'PRIMEO ENERGIE'],
    ['EDF', 'EDF'],
  ])('%s → %s', (tradeo, attendu) => {
    expect(rapprocherFournisseur(tradeo, kimatch)?.nom).toBe(attendu)
  })
  it('ne devine pas quand le nom est trop court pour trancher', () => {
    expect(rapprocherFournisseur('ED', kimatch)).toBeNull()
  })
})
