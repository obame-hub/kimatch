import { describe, expect, it } from 'vitest'
import { etapeTradeo, etatsDepuisDemandes, fournisseursTradeo, offreLueDepuisTradeo } from '@/lib/tradeo/pricer'
import { lireOffresTradeo, rapprocherFournisseur } from '@/lib/tradeo/prixUnitaires'
import { saisieDepuisLecture } from '@/lib/pricing/lectureOffre'
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
    expect(s.capacite).toBe(5.1)
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
