import { describe, it, expect } from 'vitest'
import { normaliserTelephone, normaliserTousLesTelephones, afficherTelephone } from '../telephone'

/**
 * Les cas de ce fichier ne sont pas inventés : ce sont les CINQ formes réellement présentes dans la
 * base au 04/09/2026, avec leurs effectifs, plus les pièges qu'on rencontre en saisie libre.
 *
 * Ils comptent parce que cette fonction décide du rattachement des appels Allo : une règle qui rate
 * les 659 numéros au format national fait disparaître un appel sur cinq de la fiche de son contact,
 * sans erreur visible nulle part.
 */
describe('normaliserTelephone', () => {
  it('laisse intact un E.164 français déjà valide (2 583 contacts)', () => {
    expect(normaliserTelephone('+33134600975')).toBe('+33134600975')
  })

  it('convertit le format national en E.164 (659 contacts)', () => {
    expect(normaliserTelephone('0130120403')).toBe('+33130120403')
    expect(normaliserTelephone('01 30 12 04 03')).toBe('+33130120403')
    expect(normaliserTelephone('01.30.12.04.03')).toBe('+33130120403')
  })

  it('retire le zéro parasite après l’indicatif (14 contacts)', () => {
    // +33 collé devant le numéro national sans lui retirer son 0 : les deux notations
    // désignent le même numéro et doivent se rencontrer.
    expect(normaliserTelephone('+330134600975')).toBe('+33134600975')
    expect(normaliserTelephone('+330134600975')).toBe(normaliserTelephone('01 34 60 09 75'))
  })

  it('traite 0033 comme +33 (2 contacts)', () => {
    expect(normaliserTelephone('0033466254264')).toBe('+33466254264')
  })

  it('accepte les 9 chiffres écrits sans le zéro initial', () => {
    expect(normaliserTelephone('134600975')).toBe('+33134600975')
  })

  it('rend null sur ce qui n’est pas un numéro joignable (10 contacts)', () => {
    expect(normaliserTelephone('02')).toBeNull()
    expect(normaliserTelephone('')).toBeNull()
    expect(normaliserTelephone(null)).toBeNull()
    expect(normaliserTelephone(undefined)).toBeNull()
    expect(normaliserTelephone('à demander')).toBeNull()
    // Trop long pour un numéro français : mieux vaut ne rien rattacher que rattacher au hasard.
    expect(normaliserTelephone('+331346009751234')).toBeNull()
  })

  it('ignore un poste noté après le numéro plutôt que de tronquer', () => {
    // Le « + » du milieu ne fait pas de ce numéro un international : c'est du bruit de saisie.
    expect(normaliserTelephone('01 34 60 09 75 + poste 12')).toBeNull()
  })

  it('laisse passer un indicatif étranger sans le maltraiter', () => {
    expect(normaliserTelephone('+14155551234')).toBe('+14155551234')
    expect(normaliserTelephone('+32 2 555 12 34')).toBe('+3225551234')
  })

  it('donne la même forme aux notations d’un même numéro', () => {
    const attendu = '+33134600975'
    for (const forme of ['+33134600975', '0134600975', '01 34 60 09 75', '0033134600975', '+330134600975']) {
      expect(normaliserTelephone(forme)).toBe(attendu)
    }
  })
})

describe('afficherTelephone', () => {
  it('regroupe un numéro français par paires', () => {
    expect(afficherTelephone('+33134600975')).toBe('01 34 60 09 75')
  })

  it('laisse un numéro étranger en E.164', () => {
    // Le regrouper à la française tromperait sur sa structure.
    expect(afficherTelephone('+14155551234')).toBe('+14155551234')
  })

  it('ne rend rien pour un numéro absent', () => {
    expect(afficherTelephone(null)).toBe('')
    expect(afficherTelephone(undefined)).toBe('')
  })
})

/**
 * Six contacts portent DEUX lignes dans le même champ. Sans découpe, la concaténation des chiffres
 * donne un numéro à vingt chiffres qui ne correspond à personne : on perdait les deux.
 */
describe('deux numéros dans un seul champ', () => {
  it('retient le premier des deux', () => {
    expect(normaliserTelephone('+33143180284 / +33143180280')).toBe('+33143180284')
    expect(normaliserTelephone('+33257674860 - +33665738245')).toBe('+33257674860')
  })

  it('rend les deux quand on les demande tous', () => {
    expect(normaliserTousLesTelephones('+33143180284 / +33143180280'))
      .toEqual(['+33143180284', '+33143180280'])
  })

  it('réunit le fixe et le mobile sans doublon', () => {
    expect(normaliserTousLesTelephones('01 34 60 09 75', '+33134600975', '0665738245'))
      .toEqual(['+33134600975', '+33665738245'])
  })

  it('ne rend rien quand aucun morceau n’est un numéro', () => {
    expect(normaliserTousLesTelephones('02', null, '')).toEqual([])
  })
})
