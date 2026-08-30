import { describe, expect, it } from 'vitest'
import { filterVisibles, filtrerMesElements } from '@/lib/data/visibility'

/**
 * QUI VOIT QUOI. Une erreur dans un sens montre à un commercial les dossiers d'un autre ; dans
 * l'autre sens, elle vide son tableau de bord sans rien dire. Les deux sont graves, et aucune ne
 * provoque d'erreur visible.
 */
describe('filterVisibles — le droit de consulter', () => {
  const dossiers = [
    { id: 'a', compte_id: 'c1' },
    { id: 'b', compte_id: 'c2' },
    { id: 'c', compte_id: null },
  ]

  it('ne filtre rien quand la liste autorisée vaut null', () => {
    // `null` veut dire « aucune restriction » — le cas des administrateurs. Le confondre avec une
    // liste vide masquerait tout à ceux qui ont justement le droit de tout voir.
    expect(filterVisibles(dossiers, null, (d) => d.compte_id)).toHaveLength(3)
  })

  it('ne montre rien quand la liste autorisée est vide', () => {
    // Une liste vide est une réponse, pas une absence de réponse.
    expect(filterVisibles(dossiers, [], (d) => d.compte_id)).toHaveLength(0)
  })

  it('ne garde que les éléments dont le compte figure dans la liste', () => {
    expect(filterVisibles(dossiers, ['c1'], (d) => d.compte_id).map((d) => d.id)).toEqual(['a'])
  })

  it('écarte un élément sans compte au lieu de le laisser passer', () => {
    // Un dossier qu'on ne sait rattacher à personne ne doit pas apparaître chez tout le monde.
    expect(filterVisibles(dossiers, ['c1', 'c2'], (d) => d.compte_id).map((d) => d.id))
      .toEqual(['a', 'b'])
  })
})

describe('filtrerMesElements — ce que j’ai à traiter', () => {
  const portefeuille = { comptes: ['c1'], sites: ['s1'] }
  const MOI = 'profil-moi'

  it('rend une liste vide tant que le portefeuille n’est pas chargé', () => {
    // Pendant le chargement, `undefined` ne doit pas se lire comme « aucune restriction » : le
    // tableau de bord afficherait brièvement les dossiers de toute l'équipe.
    const r = filtrerMesElements([{ proprietaire_id: MOI }], undefined, MOI, {
      proprietaireId: (x) => x.proprietaire_id,
    })
    expect(r).toEqual([])
  })

  it('le propriétaire prime sur le compte et sur le site', () => {
    // Un dossier explicitement attribué à quelqu'un est à cette personne, même s'il porte sur un
    // compte de mon portefeuille.
    const items = [
      { id: 'a', proprietaire_id: MOI, compte_id: 'c9' },
      { id: 'b', proprietaire_id: 'quelqu-un-dautre', compte_id: 'c1' },
    ]
    const r = filtrerMesElements(items, portefeuille, MOI, {
      proprietaireId: (x) => x.proprietaire_id,
      compteId: (x) => x.compte_id,
    })
    expect(r.map((x) => x.id)).toEqual(['a'])
  })

  it('retombe sur le compte quand il n’y a pas de propriétaire', () => {
    const items = [
      { id: 'a', proprietaire_id: null, compte_id: 'c1' },
      { id: 'b', proprietaire_id: null, compte_id: 'c9' },
    ]
    const r = filtrerMesElements(items, portefeuille, MOI, {
      proprietaireId: (x) => x.proprietaire_id,
      compteId: (x) => x.compte_id,
    })
    expect(r.map((x) => x.id)).toEqual(['a'])
  })

  it('retombe sur le site quand il n’y a ni propriétaire ni compte', () => {
    const items = [
      { id: 'a', proprietaire_id: null, compte_id: null, site_id: 's1' },
      { id: 'b', proprietaire_id: null, compte_id: null, site_id: 's9' },
    ]
    const r = filtrerMesElements(items, portefeuille, MOI, {
      proprietaireId: (x) => x.proprietaire_id,
      compteId: (x) => x.compte_id,
      siteId: (x) => x.site_id,
    })
    expect(r.map((x) => x.id)).toEqual(['a'])
  })

  it('écarte ce qu’on ne sait rattacher à personne', () => {
    const items = [{ id: 'a', proprietaire_id: null, compte_id: null, site_id: null }]
    const r = filtrerMesElements(items, portefeuille, MOI, {
      proprietaireId: (x) => x.proprietaire_id,
      compteId: (x) => x.compte_id,
      siteId: (x) => x.site_id,
    })
    expect(r).toEqual([])
  })

  it('ne montre rien quand on ne sait pas qui je suis', () => {
    // Un profil absent ne doit pas se comparer avec succès à un propriétaire absent : sans cette
    // garde, tous les dossiers sans propriétaire tomberaient dans le tableau de bord de chacun.
    const items = [{ id: 'a', proprietaire_id: MOI }]
    expect(filtrerMesElements(items, portefeuille, null, { proprietaireId: (x) => x.proprietaire_id }))
      .toEqual([])
  })
})
