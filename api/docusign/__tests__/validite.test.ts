import { describe, expect, it } from 'vitest'
import { ajouterMois, jourParis, validitePourSignature } from '../_validite.js'

describe('jourParis', () => {
  it('rend le jour vécu à Paris, pas le jour UTC', () => {
    // Le mandat SAS TVPJ du 08/09/2026, celui qui a fait remonter le défaut.
    expect(jourParis('2026-09-08T10:12:05.637+00:00')).toBe('2026-09-08')
  })

  it('bascule au lendemain quand la signature tombe après 22 h UTC en été', () => {
    // 23 h 30 à Paris le 8 septembre : DocuSign dit le 8, le client a signé le 8 — mais à 22 h 30
    // UTC. Prendre la date UTC donnerait le bon jour ici, et le mauvais une heure plus tard.
    expect(jourParis('2026-09-08T22:30:00Z')).toBe('2026-09-09')
  })

  it('tient compte de l’heure d’hiver, où Paris n’a qu’une heure d’avance', () => {
    expect(jourParis('2026-12-03T23:30:00Z')).toBe('2026-12-04')
    expect(jourParis('2026-12-03T22:30:00Z')).toBe('2026-12-03')
  })

  it('refuse un instant illisible plutôt que de rendre une date fantaisiste', () => {
    expect(() => jourParis('pas une date')).toThrow()
  })
})

describe('ajouterMois', () => {
  it('ajoute 36 mois en gardant le quantième', () => {
    expect(ajouterMois('2026-09-08', 36)).toBe('2029-09-08')
  })

  it('s’arrête au dernier jour du mois au lieu de déborder — le défaut de setMonth', () => {
    // `new Date('2026-01-31').setMonth(+1)` donne le 3 mars : février n'a pas 31 jours et
    // JavaScript continue de compter au lieu de s'arrêter.
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28')
    // Le cas qui se produit vraiment sur 36 mois : un 29 février vers une année non bissextile.
    expect(ajouterMois('2028-02-29', 36)).toBe('2031-02-28')
  })

  it('garde le 29 février quand l’année d’arrivée est bissextile', () => {
    expect(ajouterMois('2028-02-29', 48)).toBe('2032-02-29')
  })

  it('accepte un instant complet et n’en retient que le jour', () => {
    expect(ajouterMois('2026-09-08T10:12:05.637+00:00', 36)).toBe('2029-09-08')
  })
})

describe('validitePourSignature', () => {
  it('cale le début sur la signature et la fin sur la durée', () => {
    expect(validitePourSignature('2026-09-08T10:12:05.637+00:00', 36)).toEqual({
      date_debut_validite: '2026-09-08',
      date_fin_validite: '2029-09-08',
    })
  })

  it('n’invente pas de fin quand la durée est inconnue', () => {
    // 1 137 mandats sur 1 164 viennent de Salesforce sans `duree_mois` : leur poser une échéance
    // par défaut leur donnerait une date que personne n'a signée.
    expect(validitePourSignature('2026-09-08T10:12:05Z', null)).toEqual({
      date_debut_validite: '2026-09-08',
    })
    expect(validitePourSignature('2026-09-08T10:12:05Z', 0)).toEqual({
      date_debut_validite: '2026-09-08',
    })
  })
})
