import { describe, expect, it } from 'vitest'
import { numeroInternational } from '@/lib/telephonie'

/**
 * LA NORMALISATION D'UN NUMÉRO, ÉPROUVÉE SUR LES CAS DE LA BASE.
 *
 * Elle décide si l'appel part : c'est cette chaîne qui est passée à `allo://call?number=`. Un
 * numéro mal normalisé ne produit aucune erreur visible — l'application de bureau s'ouvre et ne
 * compose rien. C'est exactement ce qui est arrivé le 22/09/2026, et c'est pourquoi ces cas sont
 * désormais tenus par des tests.
 */
describe('numeroInternational', () => {
  it('passe un numéro français au format international', () => {
    expect(numeroInternational('06 12 34 56 78')).toBe('+33612345678')
    expect(numeroInternational('01.45.67.89.12')).toBe('+33145678912')
    expect(numeroInternational('0612345678')).toBe('+33612345678')
  })

  it('laisse intact ce qui est déjà international', () => {
    expect(numeroInternational('+33612345678')).toBe('+33612345678')
    expect(numeroInternational('0033612345678')).toBe('+33612345678')
  })

  it('complète les neuf chiffres d’une saisie tronquée', () => {
    expect(numeroInternational('612345678')).toBe('+33612345678')
  })

  it('refuse un indicatif pays commençant par zéro', () => {
    /* LE CAS QUI A COÛTÉ UNE DEMI-JOURNÉE : « 0000000000 » ressortait en « +00000000 », qui a la
       bonne longueur et aucune existence. Allô s'ouvrait et ne composait rien. */
    expect(numeroInternational('0000000000')).toBeNull()
    expect(numeroInternational('00 00 00 00 00')).toBeNull()
  })

  it('refuse ce qui n’est pas exploitable', () => {
    expect(numeroInternational('')).toBeNull()
    expect(numeroInternational(null)).toBeNull()
    expect(numeroInternational('à rappeler')).toBeNull()
    expect(numeroInternational('12345')).toBeNull()
  })
})
