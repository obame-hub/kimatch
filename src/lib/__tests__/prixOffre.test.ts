import { describe, expect, it } from 'vitest'
import { prixMoyenMWh } from '@/lib/prixOffre'

/**
 * LE PRIX AU MWH, C'EST CE QUI DÉSIGNE LE GAGNANT DEVANT LE CLIENT.
 *
 * Une erreur ici ne plante rien : elle recommande le mauvais fournisseur, avec l'aplomb d'un
 * chiffre. Les cas ci-dessous sont ceux qui peuvent la produire sans qu'on la voie.
 */
describe('prixMoyenMWh', () => {
  it('rend le prix annoncé par le fournisseur, sans recalculer', () => {
    // Le détail par PDL donnerait 100 €/MWh ; le fournisseur a écrit 92 dans son mail.
    // C'est le sien qui fait foi : c'est sur ce chiffre qu'on négocie.
    const offre = {
      prix_moyen_mwh: 92,
      details_par_compteur: [
        { consommation_annuelle_reference_mwh: 10, cout_fourniture_annuel_ht: 1000 },
      ],
    }
    expect(prixMoyenMWh(offre)).toBe(92)
  })

  it('pondère par les volumes, et non par le nombre de PDL', () => {
    // Un petit site très cher et un gros site bon marché.
    // Moyenne simple : (200 + 80) / 2 = 140 €/MWh — faux, et défavorable de 55 %.
    // Moyenne pondérée : (6 × 200 + 800 × 80) / 806 = 80,89 €/MWh.
    const offre = {
      prix_moyen_mwh: null,
      details_par_compteur: [
        { consommation_annuelle_reference_mwh: 6, cout_fourniture_annuel_ht: 1200 },
        { consommation_annuelle_reference_mwh: 800, cout_fourniture_annuel_ht: 64000 },
      ],
    }
    expect(prixMoyenMWh(offre)).toBeCloseTo(80.893, 3)
  })

  it('ignore un PDL sans coût plutôt que de le compter à zéro euro', () => {
    // Un coût absent veut dire « on ne sait pas », pas « c'est gratuit ». Le compter à zéro
    // ferait chuter la moyenne et donnerait l'avantage à l'offre la moins renseignée.
    const offre = {
      prix_moyen_mwh: null,
      details_par_compteur: [
        { consommation_annuelle_reference_mwh: 100, cout_fourniture_annuel_ht: 9000 },
        { consommation_annuelle_reference_mwh: 100, cout_fourniture_annuel_ht: null },
      ],
    }
    expect(prixMoyenMWh(offre)).toBe(90)
  })

  it('ignore un volume nul ou négatif', () => {
    const offre = {
      prix_moyen_mwh: null,
      details_par_compteur: [
        { consommation_annuelle_reference_mwh: 0, cout_fourniture_annuel_ht: 5000 },
        { consommation_annuelle_reference_mwh: -3, cout_fourniture_annuel_ht: 300 },
        { consommation_annuelle_reference_mwh: 50, cout_fourniture_annuel_ht: 4000 },
      ],
    }
    expect(prixMoyenMWh(offre)).toBe(80)
  })

  it('rend null plutôt que zéro quand rien n’est chiffrable', () => {
    // Zéro se lirait comme « gratuit » et gagnerait toutes les comparaisons.
    expect(prixMoyenMWh({ prix_moyen_mwh: null, details_par_compteur: [] })).toBeNull()
    expect(prixMoyenMWh(null)).toBeNull()
    expect(prixMoyenMWh(undefined)).toBeNull()
  })

  it('respecte un prix annoncé à zéro, qui n’est pas une absence de prix', () => {
    // `prix_moyen_mwh: 0` est une valeur saisie. Un test de vérité (`if (offre.prix_moyen_mwh)`)
    // la confondrait avec null et repartirait dans le calcul par PDL.
    const offre = {
      prix_moyen_mwh: 0,
      details_par_compteur: [
        { consommation_annuelle_reference_mwh: 10, cout_fourniture_annuel_ht: 1000 },
      ],
    }
    expect(prixMoyenMWh(offre)).toBe(0)
  })
})
