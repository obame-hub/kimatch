import { describe, expect, it } from 'vitest'
import { statutVieContrat } from '@/lib/statutVieContrat'

/**
 * CES TESTS ÉPINGLENT UNE RÈGLE ÉCRITE DEUX FOIS.
 *
 * La même déduction existe en SQL dans la vue `v_contrats_liste`. Deux écritures d'une seule règle
 * finissent toujours par diverger — sauf si l'une des deux est tenue par des cas précis. Ce sont
 * ces cas-là. Si l'un tombe, c'est le SQL qu'il faut aller relire.
 */
describe('statutVieContrat', () => {
  const JOUR = '2026-08-31'

  it('un contrat qui démarre demain est à venir', () => {
    expect(statutVieContrat('2026-09-01', '2027-09-01', JOUR)).toBe('A_VENIR')
  })

  it('un contrat qui a démarré et n’est pas fini est en cours', () => {
    expect(statutVieContrat('2026-01-01', '2027-01-01', JOUR)).toBe('EN_COURS')
  })

  it('un contrat dont la fin est passée hier est expiré', () => {
    expect(statutVieContrat('2025-01-01', '2026-08-30', JOUR)).toBe('EXPIRE')
  })

  it('le jour même compte comme dedans, aux deux bouts', () => {
    // La frontière est le piège de cette règle : un contrat qui démarre AUJOURD'HUI est en cours,
    // pas à venir — et un contrat qui finit AUJOURD'HUI est encore en cours, pas déjà expiré.
    expect(statutVieContrat(JOUR, '2027-01-01', JOUR)).toBe('EN_COURS')
    expect(statutVieContrat('2025-01-01', JOUR, JOUR)).toBe('EN_COURS')
  })

  it('un contrat sans date de fin reste en cours', () => {
    // 1 600 contrats, et certains n'ont pas de terme connu. L'absence de fin ne les termine pas.
    expect(statutVieContrat('2025-01-01', null, JOUR)).toBe('EN_COURS')
  })

  it('sans date de début, il n’y a pas de vie à annoncer', () => {
    // Les 35 contrats encore en phase de signature. Leur inventer « à venir » leur donnerait un
    // avenir qu'aucune date ne porte.
    expect(statutVieContrat(null, '2027-01-01', JOUR)).toBeNull()
    expect(statutVieContrat(undefined, null, JOUR)).toBeNull()
    expect(statutVieContrat('', '2027-01-01', JOUR)).toBeNull()
  })

  it('accepte un horodatage complet, pas seulement une date', () => {
    // La base rend parfois `2026-09-01T00:00:00+00:00`. Comparé tel quel, il serait « supérieur »
    // à `2026-09-01` et un contrat démarrant le jour même passerait pour à venir.
    expect(statutVieContrat('2026-08-31T00:00:00+00:00', null, JOUR)).toBe('EN_COURS')
  })
})
