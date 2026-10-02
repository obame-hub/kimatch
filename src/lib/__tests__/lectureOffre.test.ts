import { describe, expect, it } from 'vitest'
import type { Chiffrage, CompteurChiffrage, OffreChiffrage } from '@/lib/data/chiffrage'
import { cleFournisseur, depuisSaisieLocale, rapprocher, saisieDepuisLecture, versSaisieLocale, type OffreLue, type PropositionLue } from '@/lib/pricing/lectureOffre'

/* L'offre Gaz Européen n° 500080748 de CAPTA – 21-23 rue Lalande, telle que William l'a décrite le
   02/10/2026 : 36 mois, P0 55,01 dont 6 €/MWh de marge, abonnement 4 487,96 €/an, CEE 7,03 + 4,52. */

const compteur = { vcId: 'vc1', compteurId: 'c1', numero: 'GI142791', libelle: '', energie: 'gaz', car: 344, profil: 'P016', tarif: 'T2', segment: null, conso: {}, fournisseurActuelId: null, fournisseurActuelNom: null, site: null, reglementaire: null } as CompteurChiffrage
const ligne = (id: string, nom: string, duree: number, type = 'Fixe') => ({ id, fournisseurNom: nom, duree, type, statut: 'EN_ATTENTE', saisies: {} }) as unknown as OffreChiffrage
const chiffrage = { compteurs: [compteur], offres: [ligne('o12', 'GAZ EUROPEEN', 12), ligne('o36', 'GAZ EUROPEEN', 36), ligne('e36', 'ENGIE', 36)] } as unknown as Chiffrage

const lue: OffreLue = {
  numero_point: 'GI142791', duree_mois: 36, type_prix: 'Fixe', car_mwh: 344, profil: 'P016', p0_mwh: 55.01, prix_postes_mwh: {}, capacite_mwh: null,
  abonnement_annuel: 4487.96, abonnement_imprime: { montant: 4487.96, periode: 'an' }, cee_classiques_mwh: 7.03, cee_precarite_mwh: 4.52, cee_mwh: 11.55,
}
const proposition: PropositionLue = { fournisseur_nom: 'Gaz Européen', type_energie: 'gaz', reference_offre: '500080748', client: null, date_prise_effet: '2027-01-01', offres: [lue], remarques: null }

describe('lecture d’une proposition fournisseur', () => {
  it('« Gaz Européen » et « GAZ EUROPEEN » sont le même fournisseur', () => {
    expect(cleFournisseur('Gaz Européen')).toBe(cleFournisseur('GAZ EUROPEEN'))
  })

  it('la durée lue en tête choisit la ligne, le PCE choisit le compteur', () => {
    const r = rapprocher(chiffrage, proposition, lue)
    expect(r.offre?.id).toBe('o36')
    expect(r.compteur?.vcId).toBe('vc1')
    expect(r.alerteOffre).toBeNull()
    expect(r.alerteCompteur).toBeNull()
  })

  it('une durée non commandée ne remplit rien d’office', () => {
    const r = rapprocher(chiffrage, proposition, { ...lue, duree_mois: 24 })
    expect(r.offre).toBeNull()
    expect(r.alerteOffre).toContain('24 mois')
  })

  it('P0 55,01 dont 6 de marge : 49,01 fournisseur ; abonnement au mois sans perte ; CEE 11,55', () => {
    const s = saisieDepuisLecture(compteur, lue, 6)
    expect(s.p0).toBe(49.01)
    expect(s.marge).toBe(6)
    expect(s.cee).toBe(11.55)
    expect(Math.round(s.abonnementMois! * 12 * 100) / 100).toBe(4487.96)
  })

  it('en électricité, la marge incluse se retire du prix de chaque poste', () => {
    const elec = { ...compteur, energie: 'electricite', conso: { POINTE: 1, HPH: 10, HCH: 5, HPE: 12, HCE: 6 } } as CompteurChiffrage
    const s = saisieDepuisLecture(elec, { ...lue, p0_mwh: null, prix_postes_mwh: { POINTE: 140, HPH: 120.5, HCH: 95, HPE: 88, HCE: 70.25 } }, 8)
    expect(s.p0Postes).toEqual({ POINTE: 132, HPH: 112.5, HCH: 87, HPE: 80, HCE: 62.25 })
    expect(s.marge).toBe(8)
  })

  it('la validité saisie fait l’aller-retour avec la base', () => {
    expect(versSaisieLocale(depuisSaisieLocale('2026-10-02T16:00'))).toBe('2026-10-02T16:00')
    expect(depuisSaisieLocale('')).toBeNull()
  })
})

describe('la réponse de l’IA, remise en forme côté serveur', () => {
  it('les nombres à la française se relisent, les CEE s’additionnent, l’abonnement au mois passe à l’an', async () => {
    const { lireProposition } = await import('../../../api/ocr/extraire-offre')
    const p = lireProposition({
      fournisseur_nom: 'Gaz Européen', type_energie: 'Gaz',
      offres: [{ numero_point: 'GI 142791', duree_mois: '36', type_prix: 'fixe', p0_mwh: '55,01', abonnement_montant: '4 487,96', abonnement_periode: 'an', cee_classiques_mwh: 7.03, cee_precarite_mwh: 4.52, profil: 'P16' }],
    })
    const o = p.offres[0]
    expect(p.type_energie).toBe('gaz')
    expect(o.numero_point).toBe('GI142791')
    expect(o.duree_mois).toBe(36)
    expect(o.p0_mwh).toBe(55.01)
    expect(o.abonnement_annuel).toBe(4487.96)
    expect(o.cee_mwh).toBe(11.55)
    expect(o.profil).toBe('P016')
    const m = lireProposition({ offres: [{ abonnement_montant: 374, abonnement_periode: 'mois' }] }).offres[0]
    expect(m.abonnement_annuel).toBe(4488)
  })
})

describe('le détail du calcul d’une ligne', () => {
  it('Gaz Européen 36 mois sur GI142791 : le détail retombe sur 37 318,69 € HTVA et 44 715,81 € TTC', async () => {
    const { detailBudget } = await import('@/lib/pricing/detailBudget')
    const reglementaire = { dateEnvoi: '2026-10-02', envoiFige: false, dateReference: '2027-01-01', sourceDate: 'ECHEANCE', accise: 16.66, tqd: 7.57, cta: 459.45, cpb: { 36: 3.3733333333333335 }, turpe: null, derniereValeurConnue: [], manques: [] }
    const c = { ...compteur, car: 343.778, tarif: 'T3', reglementaire } as unknown as CompteurChiffrage
    const s = saisieDepuisLecture(c, lue, 6)
    const d = detailBudget(c, s, 36)!
    expect(d.sections.map((x) => x.sousTotal)).toEqual([27369.82, 2602.4, 7346.47])
    expect(d.totalHt).toBe(37318.69)
    expect(d.totalTtc).toBe(44715.81)
    expect(Math.round((d.totalHt + d.tva.reduce((t, l) => t + l.montant, 0)) * 100) / 100).toBe(44715.81)
    expect(d.sections[2].lignes.find((l) => l.libelle === 'CPB')?.source).toContain('2027 à 2029')
  })
})
