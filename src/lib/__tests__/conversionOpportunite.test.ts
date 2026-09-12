import { describe, expect, it } from 'vitest'
import { statutDerive } from '@/lib/data/opportunites'
import type { Opportunite } from '@/types/domain'

/**
 * ══ CONVERTIE QUAND TOUT LE PÉRIMÈTRE EST PLACÉ, ET PAS AVANT ══
 *
 * Michel, appel du 11/09/2026 : « à la fin il faut que tous les compteurs soient dans une ou des
 * recommandations, ou sinon que j'aie fait exprès d'écarter un compteur ».
 *
 * La règle précédente disait l'inverse : « une opportunité qui a produit AU MOINS UNE
 * recommandation a abouti, quoi qu'il manque par ailleurs ». Sur un périmètre de quatre compteurs
 * dont deux étaient partis, Kimatch affichait « Convertie » et plus rien ne rappelait qu'il en
 * restait deux. C'est ce cas-là que ces tests tiennent en place — il ne se voit pas en lisant
 * l'écran, seulement en comptant.
 */

/** Une opportunité complète, dont chaque test ne change que ce qui l'intéresse. */
function opportunite(patch: Partial<Opportunite> = {}): Opportunite {
  return {
    id: 'opp-1',
    reference: 'OPP-2026-001',
    origine: 'PORTEFEUILLE',
    type_opportunite: null,
    compte_id: 'compte-1',
    compte_nom: 'SDC ESSAI',
    contact_id: 'contact-1',
    contact_nom: 'Jean Essai',
    piste_id: null,
    signal_id: 'signal-1',
    statut: 'NOUVELLE',
    statut_libelle: 'Nouvelle',
    qualification_fin: null,
    motif_cloture: null,
    date_cloture: null,
    date_reactivation: null,
    accord_client: true,
    prochaine_action: null,
    prochaine_action_echeance: null,
    prochaine_action_faite_le: null,
    signal_libelle: null,
    score_maturite: null,
    commentaire: null,
    proprietaire_id: null,
    proprietaire_nom: '',
    date_creation: '2026-09-01T00:00:00Z',
    date_modification: '2026-09-01T00:00:00Z',
    site_ids: [],
    compteur_ids: ['c1', 'c2', 'c3', 'c4'],
    recommandation_ids: [],
    compteurs_places: [],
    compteurs_ecartes: [],
    ...patch,
  } as Opportunite
}

/** Un mandat actif qui couvre tout le périmètre : sans lui rien n'est convertible. */
const MANDATS = [{ id: 'm1', compte_id: 'compte-1', statut: 'ACTIF', compteur_ids: ['c1', 'c2', 'c3', 'c4'] }]

describe('statutDerive — la conversion suit le périmètre', () => {
  it('reste « Prête à convertir » quand seule une partie du périmètre est placée', () => {
    const o = opportunite({ recommandation_ids: ['reco-1'], compteurs_places: ['c1', 'c2'] })
    const r = statutDerive(o, MANDATS)
    expect(r.code).toBe('PRETE_A_CONVERTIR')
    // Le reste se dit en clair : c'est ce qui manquait le plus, une opportunité bloquée à
    // mi-conversion sans que rien n'explique pourquoi.
    expect(r.tache).toContain('2 compteurs sur 4')
  })

  it('devient « Convertie » quand tout le périmètre est placé', () => {
    const o = opportunite({ recommandation_ids: ['reco-1', 'reco-2'], compteurs_places: ['c1', 'c2', 'c3', 'c4'] })
    expect(statutDerive(o, MANDATS).code).toBe('CONVERTIE')
  })

  it('compte un compteur écarté comme traité — c’est une décision, pas un oubli', () => {
    const o = opportunite({
      recommandation_ids: ['reco-1'],
      compteurs_places: ['c1', 'c2', 'c3'],
      compteurs_ecartes: ['c4'],
    })
    expect(statutDerive(o, MANDATS).code).toBe('CONVERTIE')
  })

  it('n’est pas convertie par un écart seul : il faut au moins une recommandation', () => {
    // Un périmètre entièrement écarté n'a rien produit. Le dire « converti » ferait entrer dans
    // les affaires gagnées une opportunité dont on vient de constater qu'elle ne donnera rien.
    const o = opportunite({ compteurs_ecartes: ['c1', 'c2', 'c3', 'c4'] })
    expect(statutDerive(o, MANDATS).code).not.toBe('CONVERTIE')
  })

  it('ne se croit pas convertie sans aucune recommandation', () => {
    expect(statutDerive(opportunite(), MANDATS).code).not.toBe('CONVERTIE')
  })

  it('compte le reste sur le périmètre entier, même si un compteur est écarté au milieu', () => {
    const o = opportunite({
      recommandation_ids: ['reco-1'],
      compteurs_places: ['c1'],
      compteurs_ecartes: ['c2'],
    })
    const r = statutDerive(o, MANDATS)
    expect(r.code).toBe('PRETE_A_CONVERTIR')
    expect(r.tache).toContain('2 compteurs sur 4')
  })
})
