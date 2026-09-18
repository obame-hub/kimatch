import { describe, expect, it } from 'vitest'
import { ouvertureDemandee } from '@/lib/raccourci'

/**
 * La décision d'ouvrir la palette, éprouvée cas par cas.
 *
 * Elle n'a pas de rendu et ne lève jamais : une régression ici ne casse rien visiblement, elle
 * ouvre un panneau au milieu d'une saisie — ou cesse d'ouvrir, et personne ne sait dire depuis
 * quand. C'est exactement le genre de logique qui mérite un test plutôt qu'une relecture.
 */
describe('ouvertureDemandee', () => {
  it('ouvre sur une lettre frappée hors de tout champ', () => {
    expect(ouvertureDemandee({ key: 'f' })).toBe('frappe')
    expect(ouvertureDemandee({ key: 'é' })).toBe('frappe')
    expect(ouvertureDemandee({ key: '7' })).toBe('frappe')
  })

  it('se tait pendant une saisie — écrire « Cabinet » ne doit rien ouvrir', () => {
    expect(ouvertureDemandee({ key: 'C', dansUneSaisie: true })).toBeNull()
    expect(ouvertureDemandee({ key: 'a', dansUneSaisie: true })).toBeNull()
  })

  it('laisse passer les touches qui n’écrivent pas', () => {
    for (const key of ['Tab', 'ArrowLeft', 'F5', 'Escape', 'Enter', 'Shift', 'Backspace']) {
      expect(ouvertureDemandee({ key })).toBeNull()
    }
  })

  it('laisse au navigateur les combinaisons qui ne sont pas la nôtre', () => {
    expect(ouvertureDemandee({ key: 's', metaKey: true })).toBeNull()
    expect(ouvertureDemandee({ key: 'ArrowLeft', altKey: true })).toBeNull()
    expect(ouvertureDemandee({ key: 'c', ctrlKey: true })).toBeNull()
  })

  it('ouvre sur ⌘K comme sur Ctrl K, y compris pendant une saisie', () => {
    expect(ouvertureDemandee({ key: 'k', metaKey: true })).toBe('commande')
    expect(ouvertureDemandee({ key: 'K', ctrlKey: true })).toBe('commande')
    // C'est sa raison d'être : un modificateur ne tape aucun caractère, donc rien n'est volé.
    expect(ouvertureDemandee({ key: 'k', metaKey: true, dansUneSaisie: true })).toBe('commande')
  })

  it('se tait quand un panneau tient déjà le clavier, ⌘K compris', () => {
    expect(ouvertureDemandee({ key: 'f', panneauOuvert: true })).toBeNull()
    expect(ouvertureDemandee({ key: 'k', metaKey: true, panneauOuvert: true })).toBeNull()
  })
})
