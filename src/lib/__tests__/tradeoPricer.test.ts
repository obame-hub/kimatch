import { describe, expect, it } from 'vitest'
import { etapeTradeo, etatsDepuisDemandes, fournisseursTradeo, laMoinsChereParLigne, offreLueDepuisTradeo } from '@/lib/tradeo/pricer'
import { lireOffresTradeo, rapprocherFournisseur } from '@/lib/tradeo/prixUnitaires'
import { lignesProposables, saisieDepuisLecture } from '@/lib/pricing/lectureOffre'
import type { CommandeFournisseur, CompteurChiffrage } from '@/lib/data/chiffrage'

/* ── Les règles de la réunion du 05/10/2026 ─────────────────────────────────────────────────── */

const commande = (nom: string, modeReponse: string | null): CommandeFournisseur => ({ id: nom, fournisseurId: nom, nom, modeReponse, durees: [24, 36], types: ['Fixe'] })

describe('quand demander l’homologation', () => {
  it('seulement si un fournisseur commandé répond par Tradeo', () => {
    expect(fournisseursTradeo([commande('Gaz Européen', 'MAIL'), commande('Alpiq', 'TRADEO')]).map((f) => f.nom)).toEqual(['Alpiq'])
    expect(etapeTradeo(0, [{ etat: 'NON_ENVOYE' }])).toBe('HORS_TRADEO')
  })
  it('jamais sans mandat Energix', () => {
    expect(etapeTradeo(1, [])).toBe('SANS_MANDAT')
  })
  it('à demander tant qu’un compteur couvert n’est pas parti, homologué dès qu’un est accepté', () => {
    expect(etapeTradeo(1, [{ etat: 'NON_ENVOYE' }, { etat: 'EN_ATTENTE' }])).toBe('A_DEMANDER')
    expect(etapeTradeo(1, [{ etat: 'EN_ATTENTE' }])).toBe('DEMANDEE')
    expect(etapeTradeo(1, [{ etat: 'ACCEPTE' }, { etat: 'NON_ENVOYE' }])).toBe('HOMOLOGUE')
  })
})

describe('ce que Tradeo sait des compteurs', () => {
  const demandes = [
    { id: 3000, societe: { siret: '38257702100407' }, compteurs: [{ status: 0, numCompteur: '21159768442368' }] },
    // La plus récente a le dernier mot ; le numéro est sur le compteur, objetConsommation est vide.
    { id: 3099, societe: { siret: '38257702100407' }, compteurs: [{ status: 1, numCompteur: '21159768442368', objetConsommation: null }] },
    { id: 3100, societe: { siret: '00000000000000' }, compteurs: [{ status: 1, numCompteur: '99999999999999' }] },
  ]
  it('lit le dernier statut par compteur, sur ce SIRET seulement', () => {
    const e = etatsDepuisDemandes(demandes, '38257702100407', ['21159768442368', '30001441765303'])
    expect(e.get('21159768442368')).toEqual({ etat: 'ACCEPTE', demandeId: 3099 })
    expect(e.get('30001441765303')).toEqual({ etat: 'NON_ENVOYE', demandeId: null })
    expect(e.has('99999999999999')).toBe(false)
  })
})

/* ── D'une réponse Tradeo à une ligne du Pricer ─────────────────────────────────────────────── */

const compteurGaz = { vcId: 'vc1', compteurId: 'c1', numero: 'GI110001', libelle: '', energie: 'gaz', car: 100, profil: null, tarif: null, segment: null, conso: {}, fournisseurActuelId: null, fournisseurActuelNom: null, site: null, reglementaire: null } as CompteurChiffrage
const compteurElec = { ...compteurGaz, vcId: 'vc2', numero: '07494934815891', energie: 'electricite', conso: { HPH: 6, HCH: 4 } } as CompteurChiffrage

describe('offreLueDepuisTradeo', () => {
  const gaz = lireOffresTradeo({ GI110001: { result: true, resultatFinal: {
    dataCta: { CTA: 321.71, ARTD: 8.69, TICGN: 16.39 },
    result: { GI110001: [{ fournisseur: 'Alpiq', typeOffre: 'Fixe', success: true, marge: 2, prixMolucule: 53.46, cee: 0.5, abo: 43.94 }] },
  } } }).offres[0]

  it('gaz : le prix margé comme sur une proposition, l’abonnement à l’année, sans les communs', () => {
    const lue = offreLueDepuisTradeo(gaz, true, 36)!
    expect(lue).toMatchObject({ numero_point: 'GI110001', duree_mois: 36, type_prix: 'Fixe', p0_mwh: 53.46, cee_mwh: 0.5, abonnement_annuel: 527.28 })
    expect(lue.abonnement_imprime).toEqual({ montant: 43.94, periode: 'mois' })
  })

  it('la marge de la calculatrice est retirée du P0 ; l’abonnement revient au mois dans la case', () => {
    const s = saisieDepuisLecture(compteurGaz, offreLueDepuisTradeo(gaz, true, 36)!, 2)
    expect(s.p0).toBe(51.46)
    expect(s.marge).toBe(2)
    expect(s.abonnementMois).toBeCloseTo(43.94, 6)
    expect(s.cee).toBe(0.5)
  })

  it('élec : les postes, et la capacité seulement en valeur', () => {
    const lire = (typeCapa: string) => lireOffresTradeo({ X: { result: true, resultatFinal: { result: { X: [{
      fournisseur: 'Alpiq', success: true, typeCapa, prixHph: 120, prixHch: 90, prixCapaHph: 5.1, abo: 3,
    }] } } } }).offres[0]
    const enValeur = offreLueDepuisTradeo(lire('Valeur'), false, 24)!
    expect(enValeur).toMatchObject({ prix_postes_mwh: { HPH: 120, HCH: 90 }, capacite_mwh: 5.1, abonnement_annuel: 36 })
    expect(offreLueDepuisTradeo(lire('Coef'), false, 24)!.capacite_mwh).toBeNull()
    const s = saisieDepuisLecture(compteurElec, enValeur, 2)
    expect(s.p0Postes).toEqual({ HPH: 118, HCH: 88 })
    // William, 06/10/2026 : la capacité lue n'est plus reprise, 2 €/MWh pour tout le monde.
    expect(s.capacite).toBe(2)
  })

  it('un indexé reste indexé, pour aller sur la bonne ligne', () => {
    const o = lireOffresTradeo({ GI110001: { result: true, resultatFinal: { result: { GI110001: [{ fournisseur: 'Alpiq', typeOffre: 'Indexé PEG', success: true, prixMolucule: 40 }] } } } }).offres[0]
    expect(offreLueDepuisTradeo(o, true, 12)!.type_prix).toBe('Indexé')
  })

  it('rien sans prix d’énergie', () => {
    const o = lireOffresTradeo({ GI110001: { result: true, resultatFinal: { result: { GI110001: [{ fournisseur: 'Alpiq', success: true, abo: 40 }] } } } }).offres[0]
    expect(offreLueDepuisTradeo(o, true, 12)).toBeNull()
  })

  it('CEE « Non Soumis » (LA MARMOTTE GOURMANDE, 05/10/2026) : un prix de 0, pas une case vide', () => {
    const o = lireOffresTradeo({ X: { result: true, resultatFinal: [{
      fournisseur: 'Primeo', success: true, typeOffre: 'Fixe', typeCapa: 'Valeur', marge: 2, abo: 0,
      lesPrix: { abo: 0, cee: 'Non Soumis', prixHph: 137.53, prixHce: 56.89, prixCapaHph: 4.1 },
    }] } }).offres[0]
    const lue = offreLueDepuisTradeo(o, false, 36)!
    expect(lue.cee_mwh).toBe(0)
    expect(lue.prix_postes_mwh).toMatchObject({ HPH: 137.53, HCE: 56.89 })
  })

  it('« Primeo » chez Tradeo est « PRIMEO ENERGIE » dans Kimatch', () => {
    expect(rapprocherFournisseur('Primeo', [{ nom: 'PRIMEO ENERGIE' }])).not.toBeNull()
  })
})

describe('les lignes où une proposition peut s’écrire', () => {
  const ligne = (id: string, fournisseurNom: string) => ({ id, fournisseurNom } as never)
  const chiffrage = { offres: [ligne('e36', 'ENERGEM'), ligne('p36', 'PRIMEO ENERGIE'), ligne('p48', 'PRIMEO ENERGIE'), ligne('g36', 'GEDIA')] } as never
  it('Tradeo : seulement les lignes de son fournisseur', () => {
    expect(lignesProposables(chiffrage, { fournisseur_nom: 'PRIMEO ENERGIE', source: 'TRADEO' } as never).map((o) => o.id)).toEqual(['p36', 'p48'])
  })
  it('un document lu par l’IA : toutes, il peut s’être trompé de fournisseur', () => {
    expect(lignesProposables(chiffrage, { fournisseur_nom: 'PRIMEO ENERGIE' } as never)).toHaveLength(4)
  })
})

describe('les noms Tradeo retrouvent les fiches Kimatch (réponses du 05/10/2026)', () => {
  it.each([['Ekwateur', 'EKWATEUR'], ['mint-energie', 'MINT ENERGIE'], ['Total', 'TOTAL ENERGIES'], ['GEG', 'GEG'], ['Primeo', 'PRIMEO ENERGIE']])('%s → %s', (tradeo, kimatch) => {
    expect(rapprocherFournisseur(tradeo, [{ nom: kimatch }])).not.toBeNull()
  })
  it('sans confondre deux fournisseurs', () => {
    expect(rapprocherFournisseur('GEG', [{ nom: 'GEDIA' }])).toBeNull()
    expect(rapprocherFournisseur('Total', [{ nom: 'EKWATEUR' }])).toBeNull()
  })
})

/* ── Réunion du 07/10/2026 : toujours l'offre la moins chère au budget TTC ───────────────────── */

describe('deux offres pour la même ligne', () => {
  // FONCIA BORDEAUX TALENCE, Ekwateur 36 mois, lu sur prod.energix-pro.fr le 07/10/2026.
  const semaine = { offre: { budgetTtc: 20315.429 }, lue: { numero_point: '50084515146145', duree_mois: 36, type_prix: 'Fixe' as const }, nom: 'Fixe semaine' }
  const journalier = { offre: { budgetTtc: 20588.566 }, lue: { numero_point: '50084515146145', duree_mois: 36, type_prix: 'Fixe' as const }, nom: 'Fixe journalier' }

  it('garde la moins chère au budget TTC, quel que soit l’ordre de la réponse', () => {
    expect(laMoinsChereParLigne([journalier, semaine]).map((c) => c.nom)).toEqual(['Fixe semaine'])
    expect(laMoinsChereParLigne([semaine, journalier]).map((c) => c.nom)).toEqual(['Fixe semaine'])
  })
  it('ne départage pas deux durées, deux compteurs ou deux types de prix', () => {
    const autreDuree = { ...journalier, lue: { ...journalier.lue, duree_mois: 24 } }
    const indexe = { ...journalier, lue: { ...journalier.lue, type_prix: 'Indexé' as const } }
    expect(laMoinsChereParLigne([semaine, autreDuree, indexe])).toHaveLength(3)
  })
  it('une offre sans budget TTC ne passe devant aucune autre', () => {
    const sansBudget = { ...journalier, offre: { budgetTtc: null }, nom: 'sans budget' }
    expect(laMoinsChereParLigne([sansBudget, journalier]).map((c) => c.nom)).toEqual(['Fixe journalier'])
  })
})

/* ── La forme réelle de la production, mesurée le 10/10/2026 ─────────────────────────────────── */

describe('la réponse réelle de calculer-budget-energie (production, 10/10/2026)', () => {
  // FONCIA BORDEAUX TALENCE, PDL 50084515146145, calcul demandé sur 36 mois avec une marge de 2.
  const annee = (debut: string, fin: string, hph: number, hch: number, hpe: number, hce: number) => ({
    cee: 11.1, aboMois: 5, dateDebut: debut, dateFin: fin,
    prix: { prixHph: hph, prixHch: hch, prixHpe: hpe, prixHce: hce, prixCapaHph: 0, prixCapaHch: 0, prixCapaHpe: 0, prixCapaHce: 0 },
  })
  const reponse = {
    '50084515146145': {
      result: true,
      resultatFinal: [
        {
          TVA: 3164.632, cee: 11.1, duree: 36, aboAns: 60, aboMois: 5, dateDebut: '2028-01-01', dateFin: '2030-12-31',
          budgetHt: 17341.556, BudgetTTC: 20506.188, typeOffre: 'Fixe', fournisseur: 'Ekwateur',
          prix: { prixHce: 51.137, prixHch: 86.26, prixHpe: 47.263, prixHph: 114.623, prixCapaHce: 0, prixCapaHch: 0, prixCapaHpe: 0, prixCapaHph: 0 },
          prixParAnnee: [
            annee('2028-01-01', '2028-12-31', 125.12, 90.97, 53.38, 53.03),
            annee('2029-01-01', '2029-12-31', 107.6, 81.6, 45.92, 50.09),
            annee('2030-01-01', '2030-12-31', 111.15, 86.21, 42.49, 50.29),
          ],
        },
        {
          TVA: 3227.64, cee: 10.84, duree: 36, aboAns: 60, aboMois: 5, dateDebut: '2028-01-01', dateFin: '2030-12-31',
          budgetHt: 17656.596, BudgetTTC: 20884.237, typeOffre: 'Fixe Journalier', fournisseur: 'Ekwateur',
          prix: { prixHce: 55.02, prixHch: 85.327, prixHpe: 49.72, prixHph: 120.757, prixCapaHce: 0, prixCapaHch: 0, prixCapaHpe: 0, prixCapaHph: 0 },
          prixParAnnee: [],
        },
        {
          TVA: 3308.826, cee: 10.92, duree: 24, aboAns: 0, aboMois: 0, dateDebut: '2028-01-01', dateFin: '2029-12-31',
          budgetHt: 18019.026, BudgetTTC: 21327.852, typeOffre: 'Fixe', fournisseur: 'GEG',
          prix: { prixHce: 54.09, prixHch: 63.9, prixHpe: 70.21, prixHph: 99.84, prixCapaHce: 0, prixCapaHch: 1.071, prixCapaHpe: 0, prixCapaHph: 16.654 },
        },
      ],
    },
  }
  const { offres } = lireOffresTradeo(reponse)

  it('lit les prix sur la durée, les CEE et l’abonnement, et une période par année', () => {
    const fixe = offres[0]
    expect(fixe.sansPrixUnitaire).toBe(false)
    expect(fixe.prixMoyens).toMatchObject({ prixHph: 114.623, prixHch: 86.26, prixHpe: 47.263, prixHce: 51.137, cee: 11.1, abo: 5 })
    expect(fixe.periodes.map((p) => p.prix.prixHph)).toEqual([125.12, 107.6, 111.15])
    expect(fixe.budgetTtc).toBe(20506.188)
    expect(fixe.dureeMois).toBe(36)
  })
  it('la moyenne de Tradeo est celle des années', () => {
    expect((125.12 + 107.6 + 111.15) / 3).toBeCloseTo(114.623, 3)
  })
  it('devient une ligne du Pricer au prix marge incluse, abonnement à l’année', () => {
    const lue = offreLueDepuisTradeo(offres[0], false, 36)!
    expect(lue.prix_postes_mwh).toEqual({ HPH: 114.623, HCH: 86.26, HPE: 47.263, HCE: 51.137 })
    expect(lue.abonnement_annuel).toBe(60)
    expect(lue.cee_mwh).toBe(11.1)
    expect(lue.type_prix).toBe('Fixe')
  })
  it('garde la durée propre de chaque fournisseur', () => {
    expect(offres.map((o) => [o.fournisseur, o.dureeMois])).toEqual([['Ekwateur', 36], ['Ekwateur', 36], ['GEG', 24]])
  })
})
