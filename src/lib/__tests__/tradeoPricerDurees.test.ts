import { describe, expect, it, vi } from 'vitest'

/* ── Une durée refusée ne bloque pas les autres — Tradeo, 05/10/2026 ───────────────────────────
   « Ce n'est pas parce que 36 et 48 ensemble ne sont pas disponibles, mais que 36 est disponible,
   qu'il ne faut pas afficher les deux » : on rend ce qui est coté, et on dit ce qui ne l'est pas.
   Tradeo est simulé : sa réponse reprend celle de LA MARMOTTE GOURMANDE (Primeo, élec C4). */

const appels: { action: string; corps: Record<string, unknown> }[] = []
vi.mock('@/lib/data/tradeo', () => ({
  appelerBanc: async (action: string, corps: Record<string, unknown>) => {
    appels.push({ action, corps })
    if (action === 'compteurs_par_siret') return { ok: true, reponse: { listCompteur: corps.energie === 'ELEC' ? [{ id: 5056, numCompteur: '30001961552647', parametreCompteur: 'C4' }] : [] } }
    if (action === 'consommation') return { ok: true, reponse: { compteur: { '30001961552647': { id: 5056, objetConsommation: {}, autreFournisseur: [] } } } }
    if (action === 'calculer') {
      const oc = ((corps.compteur as Record<string, { objetConsommation: { dateDebut: string; dateFin: string } }>)['30001961552647']).objetConsommation
      const a48 = oc.dateFin.startsWith('2031')
      return { ok: true, reponse: { '30001961552647': { result: true, resultatFinal: [
        a48
          ? { fournisseur: 'Primeo', success: false, typeFournisseur: 'erreur', message: 'Error 06 - Pricing impossible sur les dates données : date de fin en dehors des limites.' }
          : { fournisseur: 'Primeo', success: true, typeOffre: 'Fixe', typeCapa: 'Valeur', marge: 2, abo: 0, lesPrix: { abo: 0, cee: 'Non Soumis', prixHph: 109.38, prixHch: 80.1, prixHpe: 70.2, prixHce: 54.89 } },
      ] } } }
    }
    return { ok: false, message: 'non simulé' }
  },
  chargerDossierKimatch: vi.fn(),
  chargerMandatsActifs: vi.fn(),
  messageErreur: (r: { message?: string }) => r.message ?? null,
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { recupererPropositionsTradeo } = await import('@/lib/tradeo/pricer')

describe('une durée refusée ne bloque pas les autres', () => {
  const compteur = { vcId: 'vc1', compteurId: 'c1', numero: '30001961552647', libelle: '', energie: 'electricite', car: null, profil: null, tarif: null, segment: 'C4', conso: { HPH: 24, HCH: 16.8, HPE: 39.4, HCE: 25.5 }, fournisseurActuelId: null, fournisseurActuelNom: null, site: null, reglementaire: { dateReference: '2027-05-01' } }
  const primeo = { id: 'of1', fournisseurId: 'f1', nom: 'PRIMEO ENERGIE', modeReponse: 'TRADEO', durees: [36, 48], types: ['Fixe'] }
  const chiffrage = { version: { id: 'v1', compteNom: 'LA MARMOTTE GOURMANDE' }, compteurs: [compteur], commande: [primeo], offres: [], actuelle: null, optimisationId: 'o1' }
  const etat = { etape: 'HOMOLOGUE', fournisseurs: [primeo], sansPrixAutomatiques: [], siret: '80961059500013', couverts: [{ vcId: 'vc1', numero: '30001961552647', energie: 'electricite', mandat: null, etat: 'ACCEPTE', demandeId: 3100 }], exclus: [], manques: [], demandeNumero: 3100 }

  it('36 mois coté : proposé ; 48 mois refusé : dit, sans bloquer', async () => {
    const r = await recupererPropositionsTradeo(chiffrage as never, etat as never, new Date('2026-10-05T10:00:00Z'))
    expect(r.propositions).toHaveLength(1)
    expect(r.propositions[0].offres.map((o) => o.duree_mois)).toEqual([36])
    expect(r.propositions[0].offres[0]).toMatchObject({ prix_postes_mwh: { HPH: 109.38, HCE: 54.89 }, cee_mwh: 0 })
    expect(r.manques).toEqual([expect.stringMatching(/^PRIMEO ENERGIE 48 mois : non disponible \(Error 06.*du 01\/05\/2027 au 30\/04\/2031\.$/)])
    // Une durée, un calcul : c'est ce qui rend chaque durée indépendante.
    expect(appels.filter((a) => a.action === 'calculer')).toHaveLength(2)
  })
})
