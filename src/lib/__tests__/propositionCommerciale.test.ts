import { describe, expect, it } from 'vitest'
import { donneesProposition } from '@/lib/proposition/donneesProposition'
import { contratSecurise, pointsDesClauses } from '@/lib/offres/clauses'
import type { Compteur, OffreFournisseur, OffreFournisseurCompteur, VersionRecommandation } from '@/types/domain'

/* Les chiffres sont ceux des deux modèles validés le 30/09/2026 : « Offre B v3 » (gaz, AO-2026-0418)
   et « Offre Electricite » (AO-2026-0419). Si une formule dérive du modèle, c'est ici que ça casse. */

const version = { id: 'v', date_creation: '2026-09-22T09:00:00Z', compteurs: [{ lien_id: 'l1', compteur_id: 'c', label: '' }] } as unknown as VersionRecommandation
const CLAUSES = { tacite_reconduction: true, depot_garantie: false, engagement_consommation: false, renegociation_anticipee: false, swap: false }

function offre(id: string, detail: Partial<OffreFournisseurCompteur>, extra: Partial<OffreFournisseur> = {}): { offre: OffreFournisseur; fournisseurCompteId: null } {
  return {
    fournisseurCompteId: null,
    offre: {
      id, fournisseur_nom: id, statut: 'DISPONIBLE', duree_mois: 24, type_prix: 'Fixe', nature_offre: 'PROPOSEE', est_offre_reference: false,
      date_validite: '2026-10-06', clauses: CLAUSES,
      details_par_compteur: [{ version_recommandation_compteur_id: 'l1', type_marge: 'VARIABLE', marge_reelle_eur_mwh: null, ...detail } as OffreFournisseurCompteur],
      ...extra,
    } as unknown as OffreFournisseur,
  }
}

describe('gaz — Offre B v3', () => {
  const compteur = { id: 'c', type_energie: 'gaz', car_mwh: 285 } as unknown as Compteur
  const prix = (abo: number, molecule: number, cee: number, cpb: number) => ({
    prix_gaz: { prix_energie_mwh: molecule, prix_molecule_p0_mwh: molecule, prix_cee_mwh: cee, prix_cpb_mwh: cpb, prix_atrd_mwh: 10.62, prix_agn_mwh: 16.39, cta_annuel_ht: 318, abonnement_fourniture_annuel_ht: abo, car_reference_mwh: null },
  }) as unknown as Partial<OffreFournisseurCompteur>
  const d = donneesProposition({
    version,
    compteurs: new Map([['c', compteur]]),
    offres: [
      offre('ENGIE actuel', prix(480, 49.2, 6.5, 0), { nature_offre: 'EN_COURS', duree_mois: 36 }),
      offre('GME', prix(336, 39.45, 7.2, 1.85)),
      offre('TotalEnergies', prix(420, 40.1, 6.8, 1.9), { duree_mois: 36 }),
    ],
  })
  const gme = d.lignes.find((l) => l.fournisseur === 'GME')!

  it('retrouve le comparatif de la page 1, au centime', () => {
    expect(gme).toMatchObject({ abonnement: 336, energie: 13822.5, taxes: 8015.85, total: 22174.35, rang: 1 })
    expect(d.actuelle?.total).toBe(24370.35)
    expect(Math.round(gme.ecartAn!)).toBe(-2196)
  })
  it('retrouve l’économie annoncée : 2 196 €/an, 183 €/mois, −9,0 %, 4 392 € sur 24 mois', () => {
    expect(Math.round(d.economie!.an)).toBe(2196)
    expect(Math.round(d.economie!.mois)).toBe(183)
    expect(d.economie!.pourcentage).toBe(9)
    expect(Math.round(d.economie!.surDuree!)).toBe(4392)
  })
  it('retrouve les prix unitaires de la page 2, dans ses unités', () => {
    expect(gme.prixGaz).toMatchObject({ abonnement_mois: 28, molecule: 39.45, cee: 7.2, cpb: 1.85, total_energie_mwh: 48.5, tqd: 10.62, accise: 16.39, cta_an: 318 })
  })
  it('l’offre actuelle passe en tête et reste hors classement', () => {
    expect(d.lignes[0].fournisseur).toBe('ENGIE actuel')
    expect(d.lignes[0].rang).toBeNull()
    expect(d.meilleure?.fournisseur).toBe('GME')
    expect(d.validite).toBe('2026-10-06')
  })
})

describe('électricité — Offre Electricite', () => {
  const compteur = { id: 'c', type_energie: 'electricite', consoParClasseMwh: { POINTE: 18, HPH: 142, HCH: 86, HPE: 168, HCE: 96 } } as unknown as Compteur
  const postes = { POINTE: 168.4, HPH: 141.2, HCH: 104.6, HPE: 96.3, HCE: 72.8 }
  const gme = donneesProposition({
    version,
    compteurs: new Map([['c', compteur]]),
    offres: [offre('GME', {
      prix_electricite: {
        prix_mwh_par_classe: postes, p0_mwh_par_classe: postes,
        capacite_mwh_par_classe: { POINTE: 5.1, HPH: 5.1, HCH: 5.1, HPE: 5.1, HCE: 5.1 },
        prix_cee_mwh: 10.2, accise_annuel_ht: 22.5 * 510, cta_annuel_ht: 1240, prix_turpe_annuel_ht: 14280, abonnement_fourniture_annuel_ht: 660,
      },
    } as unknown as Partial<OffreFournisseurCompteur>)],
  }).lignes[0]

  it('retrouve le comparatif : l’énergie inclut capacité et CEE, comme le modèle', () => {
    // Le PDF arrondit à l'euro : 63 047 € et 90 702 €.
    expect(gme).toMatchObject({ abonnement: 660, turpe: 14280, taxes: 12715 })
    expect(Math.round(gme.energie!)).toBe(63047)
    expect(Math.round(gme.total!)).toBe(90702)
  })
  it('rend la capacité en un seul prix, et l’accise en €/MWh', () => {
    expect(gme.prixElec).toMatchObject({ abonnement_mois: 55, capacite: 5.1, cee: 10.2, accise_mwh: 22.5, cta_an: 1240 })
    expect(gme.prixElec?.par_poste.HPH).toBe(141.2)
  })
})

describe('clauses', () => {
  it('« contrat sécurisé » se déduit du prix fixe', () => {
    expect(contratSecurise('Fixe')).toBe(true)
    expect(contratSecurise('Indexé PEG')).toBe(false)
  })
  it('compte protections et contraintes, sans inventer la note', () => {
    expect(pointsDesClauses({ ...CLAUSES, swap: true, depot_garantie: true }, 'Fixe')).toMatchObject({ protections: 1, contraintes: 2 })
  })
})

describe('référence et indice', () => {
  const compteur = { id: 'c', type_energie: 'gaz', car_mwh: 285 } as unknown as Compteur
  const detail = { prix_gaz: { prix_energie_mwh: 41.3, prix_cee_mwh: 7.1, prix_cpb_mwh: 1.8, prix_atrd_mwh: 10.62, prix_agn_mwh: 16.39, cta_annuel_ht: 318, abonnement_fourniture_annuel_ht: 300 } } as unknown as Partial<OffreFournisseurCompteur>
  const d = donneesProposition({
    version: { ...version, reference_appel_offres: 'AO-2026-0418' } as VersionRecommandation,
    compteurs: new Map([['c', compteur]]),
    offres: [
      offre('Picoty', detail, { type_prix: 'Indexé', indice_indexation: 'PEG' }),
      offre('GME', detail, { indice_indexation: 'PEG' }),
    ],
  })
  it('porte la référence de l’appel d’offres', () => expect(d.reference).toBe('AO-2026-0418'))
  it('écrit « Indexé PEG », et ignore un indice sur une offre fixe', () => {
    expect(d.lignes.find((l) => l.fournisseur === 'Picoty')?.typePrix).toBe('Indexé PEG')
    expect(d.lignes.find((l) => l.fournisseur === 'GME')?.typePrix).toBe('Fixe')
  })
})
