import { describe, expect, it } from 'vitest'
import { decouperNomComplet } from '@/lib/data/cockpit'

/**
 * LE DÉCOUPAGE DU NOM SAISI DANS LE SPRINT.
 *
 * Il mérite des tests parce qu'il peut corrompre en silence : `lister_pipe_du_jour` recompose
 * `civilite + prenom + nom`, donc une répartition fausse se voit tout de suite à l'écran et
 * s'aggrave à chaque correction. Les cas ci-dessous sont ceux de la base — 4 490 pistes importées
 * sans séparation, des noms composés, des civilités avec et sans point.
 */
describe('decouperNomComplet', () => {
  it('sépare le prénom du nom sur le premier espace', () => {
    expect(decouperNomComplet('Marie Thonnard')).toEqual({ civilite: null, prenom: 'Marie', nom: 'Thonnard' })
  })

  it('garde entier un nom en plusieurs mots', () => {
    // Un découpage sur le DERNIER espace aurait donné prenom « Anne-Françoise Dos ».
    expect(decouperNomComplet('Anne-Françoise Dos Santos'))
      .toEqual({ civilite: null, prenom: 'Anne-Françoise', nom: 'Dos Santos' })
    expect(decouperNomComplet('Hugues De La Vaissière'))
      .toEqual({ civilite: null, prenom: 'Hugues', nom: 'De La Vaissière' })
  })

  it('reconnaît la civilité, avec ou sans point, avec ou sans accent', () => {
    expect(decouperNomComplet('M. Olivier Michau')).toEqual({ civilite: 'M.', prenom: 'Olivier', nom: 'Michau' })
    expect(decouperNomComplet('Mme Tracy Goueri')).toEqual({ civilite: 'Mme', prenom: 'Tracy', nom: 'Goueri' })
    expect(decouperNomComplet('monsieur Jean Dupont'))
      .toEqual({ civilite: 'monsieur', prenom: 'Jean', nom: 'Dupont' })
  })

  it('met un mot unique dans le nom, jamais dans le prénom', () => {
    // C'est le cas des imports : « BROUSSE », « TURPIN » sont des noms de famille.
    expect(decouperNomComplet('BROUSSE')).toEqual({ civilite: null, prenom: null, nom: 'BROUSSE' })
  })

  it('ne prend pas un nom de famille isolé pour une civilité', () => {
    // « ME » seul reste un nom : sans second mot, il n'y a rien à qualifier.
    expect(decouperNomComplet('Me')).toEqual({ civilite: null, prenom: null, nom: 'Me' })
  })

  it('vide les trois colonnes sur une saisie vide', () => {
    // Indispensable : sans ça, effacer un nom laisserait l'ancien en base.
    expect(decouperNomComplet('   ')).toEqual({ civilite: null, prenom: null, nom: null })
  })

  it('absorbe les espaces multiples des copier-coller', () => {
    expect(decouperNomComplet('  Marie   Thonnard  '))
      .toEqual({ civilite: null, prenom: 'Marie', nom: 'Thonnard' })
  })
})
