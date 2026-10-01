import { describe, expect, it } from 'vitest'
import { ajouterJoursOuvres, datePrevisionnelle, etatDOffre, versionPrete } from '@/lib/parcoursPrix/etatOffres'
import { calculerOffre, margeCiblee } from '@/lib/parcoursPrix/calcul'
import { ecritureDepuisTradeo } from '@/lib/parcoursPrix/sourceTradeo'
import { lireOffresTradeo } from '@/lib/tradeo/prixUnitaires'
import type { Compteur, OffreFournisseur, OffreFournisseurCompteur, VersionRecommandation } from '@/types/domain'

/* ── Fabriques minimales : seuls les champs que le parcours lit ─────────────────────────────── */

const compteurGaz = { id: 'c-gaz', type_energie: 'gaz', numero_pdl: 'GI110001', car_mwh: 100 } as unknown as Compteur
const compteurElec = {
  id: 'c-elec', type_energie: 'electricite', numero_pdl: '07494934815891',
  consommation_annuelle_mwh: 10, consoParClasseMwh: { HP: 6, HC: 4 },
} as unknown as Compteur
const compteurs = new Map([[compteurGaz.id, compteurGaz], [compteurElec.id, compteurElec]])

function version(liens: { lien_id: string; compteur_id: string }[], extra: Partial<VersionRecommandation> = {}): VersionRecommandation {
  return {
    id: 'v1', date_creation: '2026-09-25T10:00:00Z', date_souhaitee: '2026-10-02',
    compteurs: liens.map((l) => ({ ...l, label: l.compteur_id })), optimisations: [], ...extra,
  } as unknown as VersionRecommandation
}

function detailGaz(lien: string, p0: number | null, marge: number | null, typeMarge: 'VARIABLE' | 'FIXE' = 'VARIABLE'): OffreFournisseurCompteur {
  return {
    id: `d-${lien}`, version_recommandation_compteur_id: lien, compteur_id: 'c-gaz', type_marge: typeMarge,
    marge_reelle_eur_mwh: marge, consommation_annuelle_reference_mwh: null,
    prix_gaz: { type_prix: 'Fixe', prix_molecule_p0_mwh: p0, prix_energie_mwh: null, prix_cee_mwh: 2, prix_cpb_mwh: null, prix_atrt_mwh: null, prix_atrd_mwh: null, prix_agn_mwh: null, car_reference_mwh: null, abonnement_fourniture_annuel_ht: 100, cta_annuel_ht: null },
    prix_electricite: null,
  } as unknown as OffreFournisseurCompteur
}

function offre(id: string, details: OffreFournisseurCompteur[], extra: Partial<OffreFournisseur> = {}): OffreFournisseur {
  return { id, fournisseur_nom: id, statut: 'EN_ATTENTE', duree_mois: 24, type_prix: 'Fixe', details_par_compteur: details, ...extra } as unknown as OffreFournisseur
}

/* ── Étape 2 : la date prévisionnelle ───────────────────────────────────────────────────────── */

describe('jours ouvrés', () => {
  it('saute le week-end', () => {
    expect(ajouterJoursOuvres('2026-09-25', 1)).toBe('2026-09-28') // vendredi + 1 → lundi
    expect(ajouterJoursOuvres('2026-09-26', 0)).toBe('2026-09-28') // samedi, « dans la journée » → lundi
  })
  it('saute les fériés', () => {
    expect(ajouterJoursOuvres('2026-11-10', 1)).toBe('2026-11-12') // le 11 novembre ne compte pas
  })
})

describe('datePrevisionnelle', () => {
  const v = { date_creation: '2026-09-25T10:00:00Z', date_souhaitee: '2026-10-09' }
  it('MAIL et TRADEO : création + délai du fournisseur, en jours ouvrés', () => {
    expect(datePrevisionnelle({ mode_reponse: 'TRADEO', response_delay_days: 3 }, v)).toMatchObject({ date: '2026-09-30', parDefaut: false })
  })
  it('PLATEFORME et GRILLE : le jour de la livraison souhaitée', () => {
    expect(datePrevisionnelle({ mode_reponse: 'GRILLE', response_delay_days: 0 }, v)).toMatchObject({ date: '2026-10-09', parDefaut: false })
  })
  it('sans délai ni mode : la livraison souhaitée, en le disant', () => {
    const p = datePrevisionnelle({ mode_reponse: 'MAIL', response_delay_days: null }, v)
    expect(p).toMatchObject({ date: '2026-10-09', parDefaut: true })
    expect(p.raison).toContain('délai')
    expect(datePrevisionnelle(undefined, v).raison).toContain('mode de réponse')
  })
})

describe('etatDOffre', () => {
  const v = version([{ lien_id: 'l1', compteur_id: 'c-gaz' }])
  const auj = new Date('2026-10-05T09:00:00')
  it('disponible quand chaque compteur a son P0', () => {
    expect(etatDOffre(offre('A', [detailGaz('l1', 30, 3)]), v, compteurs, undefined, auj).etat).toBe('DISPONIBLE')
  })
  it('en attente, et en retard une fois la date passée', () => {
    const e = etatDOffre(offre('A', []), v, compteurs, { mode_reponse: 'MAIL', response_delay_days: 2 }, auj)
    expect(e).toMatchObject({ etat: 'EN_ATTENTE', chiffres: 0, total: 1, enRetard: true })
    expect(e.prevision?.date).toBe('2026-09-29')
  })
  it('un refus reste un refus, même chiffré', () => {
    expect(etatDOffre(offre('A', [detailGaz('l1', 30, 3)], { statut: 'INDISPONIBLE' }), v, compteurs, undefined, auj).etat).toBe('INDISPONIBLE')
  })
  it('la version est prête quand plus rien n’est attendu', () => {
    const d = { etat: 'DISPONIBLE', chiffres: 1, total: 1, prevision: null, enRetard: false } as const
    const r = { ...d, etat: 'INDISPONIBLE' } as const
    const a = { ...d, etat: 'EN_ATTENTE' } as const
    expect(versionPrete([d, r])).toBe(true)
    expect(versionPrete([d, a])).toBe(false)
    expect(versionPrete([r])).toBe(false)
  })
})

/* ── Étape 3 : le calcul et la marge ────────────────────────────────────────────────────────── */

describe('calculerOffre', () => {
  const v = version([{ lien_id: 'l1', compteur_id: 'c-gaz' }])
  it('applique la règle de Michel : conso × (P0 + marge + CEE) + abonnement', () => {
    const c = calculerOffre(offre('A', [detailGaz('l1', 30, 3)]), v, compteurs)
    // 100 MWh × (30 + 3 + 2) + 100 = 3 600
    expect(c.total).toBe(3600)
    expect(c.lignes[0].ecriture).toMatchObject({ prix_energie_mwh: 33, marge_reelle_eur_mwh: 3, cout_total_annuel_estime_ht: 3600 })
    expect(c.pente).toBe(100)
    expect(c.base).toBe(3300)
  })
  it('une marge imposée remplace celle de la ligne', () => {
    expect(calculerOffre(offre('A', [detailGaz('l1', 30, 3)]), v, compteurs, 5).total).toBe(3800)
  })
  it('une marge fixe n’entre pas dans le prix', () => {
    const c = calculerOffre(offre('A', [detailGaz('l1', 30, 3, 'FIXE')]), v, compteurs)
    expect(c.total).toBe(3300)
    expect(c.pente).toBe(0)
  })
  it('une offre incomplète n’a pas de total', () => {
    const v2 = version([{ lien_id: 'l1', compteur_id: 'c-gaz' }, { lien_id: 'l2', compteur_id: 'c-gaz' }])
    const c = calculerOffre(offre('A', [detailGaz('l1', 30, 3)]), v2, compteurs)
    expect(c.complete).toBe(false)
    expect(c.total).toBeNull()
    expect(c.lignes[1].ecriture).toBeNull()
  })
})

describe('margeCiblee', () => {
  const v = version([{ lien_id: 'l1', compteur_id: 'c-gaz' }])
  const mk = (id: string, p0: number, extra: Partial<OffreFournisseur> = {}, typeMarge: 'VARIABLE' | 'FIXE' = 'VARIABLE') => {
    const o = offre(id, [detailGaz('l1', p0, 3, typeMarge)], extra)
    return { offre: o, calcul: calculerOffre(o, v, compteurs) }
  }
  it('met la cible devant en relevant la marge des concurrentes moins chères', () => {
    const offres = [mk('CIBLE', 32), mk('MOINS_CHERE', 30), mk('PLUS_CHERE', 40)]
    const r = new Map(margeCiblee(offres, 'CIBLE', 3).map((a) => [a.offreId, a]))
    // cible : 100 × (32 + 3 + 2) + 100 = 3 800 ; la moins chère doit dépasser 3 801 → marge 5,01
    expect(r.get('CIBLE')?.margeApres).toBe(3)
    expect(r.get('MOINS_CHERE')?.margeApres).toBe(5.01)
    expect(r.get('MOINS_CHERE')!.totalApres!).toBeGreaterThan(3800)
    // la plus chère ne gêne pas : elle garde la marge demandée
    expect(r.get('PLUS_CHERE')?.margeApres).toBe(3)
  })
  it('ignore les offres d’une autre durée et l’offre en cours', () => {
    const offres = [mk('CIBLE', 32), mk('AUTRE_DUREE', 30, { duree_mois: 36 }), mk('EN_COURS', 20, { nature_offre: 'EN_COURS' })]
    expect(margeCiblee(offres, 'CIBLE', 3).map((a) => a.offreId)).toEqual(['CIBLE'])
  })
  it('dit quand une marge fixe empêche de faire passer la cible', () => {
    const r = margeCiblee([mk('CIBLE', 32), mk('FIXE', 30, {}, 'FIXE')], 'CIBLE', 3)
    expect(r.find((a) => a.offreId === 'FIXE')?.impossible).toContain('marge fixe')
  })
})

/* ── La source Tradeo ───────────────────────────────────────────────────────────────────────── */

describe('ecritureDepuisTradeo', () => {
  const annuelle = lireOffresTradeo({
    GI110001: { result: true, resultatFinal: { result: { GI110001: [{
      '2027-01-01->2027-12-31': { dataMoyenne: { lesPrixFinal: { margeAppliquer: 2, prixMolecule: 50, abo: 40 } } },
      '2028-01-01->2028-12-31': { dataMoyenne: { lesPrixFinal: { margeAppliquer: 2, prixMolecule: 60, abo: 40 } } },
      lesCleAnnuelleDesPeriode: ['2027-01-01->2027-12-31', '2028-01-01->2028-12-31'],
      fournisseur: 'Alpiq', typeOffre: 'Fixe', success: true,
    }] } } },
  }).offres[0]

  it('prend la moyenne des années et ne retire la marge que si elle est dans le prix', () => {
    expect(ecritureDepuisTradeo(annuelle, true, false)).toMatchObject({ prix_molecule_p0_mwh: 55 })
    expect(ecritureDepuisTradeo(annuelle, true, true)).toMatchObject({ prix_molecule_p0_mwh: 53 })
    // L'abonnement est en €/mois chez Tradeo, en €/an dans Kimatch — et la marge ne le touche pas.
    expect(ecritureDepuisTradeo(annuelle, true, true)).toMatchObject({ abonnement_fourniture_annuel_ht: 480 })
  })
  it('range les prix électriques par classe', () => {
    const elec = lireOffresTradeo({ X: { result: true, resultatFinal: { result: { X: [{ fournisseur: 'EDF', success: true, prixHp: 120, prixHc: 90, abo: 3 }] } } } }).offres[0]
    expect(ecritureDepuisTradeo(elec, false, false)).toMatchObject({ p0_mwh_par_classe: { HP: 120, HC: 90 }, abonnement_fourniture_annuel_ht: 36 })
  })
  it('gaz : reprend la molécule et les CEE, PAS les communs (ATRD, accise, CTA — décision du 01/10/2026)', () => {
    const o = lireOffresTradeo({ GI110001: { result: true, resultatFinal: {
      dataCta: { CTA: 321.71, ARTD: 8.69, TICGN: 16.39, GRDF_COUT_FIXE: 1301.4 },
      result: { GI110001: [{ fournisseur: 'Engie', success: true, prixMolucule: 53.46, cee: 0.5 }] },
    } } }).offres[0]
    expect(ecritureDepuisTradeo(o, true, false)).toEqual({ prix_molecule_p0_mwh: 53.46, prix_cee_mwh: 0.5 })
    // Lus, pour comparer aux barèmes, mais jamais écrits.
    expect(o.reglementaire).toEqual({ atrd: 8.69, accise: 16.39, cta: 321.71 })
  })
  it('élec : la capacité n’est reprise que si Tradeo la donne en valeur', () => {
    const lire = (typeCapa: string) => lireOffresTradeo({ X: { result: true, resultatFinal: { result: { X: [{
      fournisseur: 'EDF', success: true, typeCapa, prixHp: 120, prixHc: 90, prixCapaHp: 5.96, prixCapaHc: 4, cee: 7.28,
    }] } } } }).offres[0]
    expect(ecritureDepuisTradeo(lire('Valeur'), false, false)).toMatchObject({ capacite_mwh_par_classe: { HP: 5.96, HC: 4 }, prix_cee_mwh: 7.28 })
    expect(ecritureDepuisTradeo(lire('Coef'), false, false)).not.toHaveProperty('capacite_mwh_par_classe')
  })
})
