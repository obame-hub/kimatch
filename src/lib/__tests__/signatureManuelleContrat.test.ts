import { describe, it, expect } from 'vitest'
import { mentionSignatureManuelle, statutMetierApresSignature } from '../signatureManuelleContrat'

/**
 * LA RÈGLE EST CELLE DU WEBHOOK DOCUSIGN — `statutMetierContrat`, dans `api/docusign/_decision.ts`.
 * Un contrat signé à la main doit finir dans le MÊME état qu'un contrat signé par DocuSign ; ces
 * tests épinglent les quatre cas pour que la copie ne dérive pas de l'original.
 */
describe('statutMetierApresSignature', () => {
  const jour = '2026-09-15'

  it('sans date de début, le contrat est « signé » et rien de plus', () => {
    expect(statutMetierApresSignature(null, null, jour)).toBe('SIGNE')
    // Une date de fin seule ne suffit pas : c'est le début qui ouvre la fourniture.
    expect(statutMetierApresSignature(null, '2027-01-01', jour)).toBe('SIGNE')
  })

  it('une fourniture qui n’a pas commencé est « à venir »', () => {
    expect(statutMetierApresSignature('2026-10-01', '2027-10-01', jour)).toBe('A_VENIR')
  })

  it('une fourniture en cours est « actif »', () => {
    expect(statutMetierApresSignature('2026-01-01', '2027-01-01', jour)).toBe('ACTIF')
    // Sans date de fin, rien ne permet de dire qu'elle est finie.
    expect(statutMetierApresSignature('2026-01-01', null, jour)).toBe('ACTIF')
  })

  it('une fourniture achevée est « terminé », même si la signature est enregistrée aujourd’hui', () => {
    expect(statutMetierApresSignature('2024-01-01', '2025-12-31', jour)).toBe('TERMINE')
  })

  /* LES FRONTIÈRES SONT DES ÉGALITÉS, pas des inégalités strictes : un contrat qui commence
     aujourd'hui est actif, pas à venir ; un contrat qui finit aujourd'hui court encore. C'est le
     cas limite qui se trompe le plus facilement d'un signe. */
  it('le jour même compte des deux côtés', () => {
    expect(statutMetierApresSignature(jour, '2027-01-01', jour)).toBe('ACTIF')
    expect(statutMetierApresSignature('2026-01-01', jour, jour)).toBe('ACTIF')
  })

  it('accepte un horodatage complet comme une date', () => {
    expect(statutMetierApresSignature('2026-10-01T00:00:00Z', null, jour)).toBe('A_VENIR')
  })
})

describe('mentionSignatureManuelle', () => {
  it('ajoute la mention sans écraser le commentaire existant', () => {
    const r = mentionSignatureManuelle('Remise de 3 % négociée.', 'Signature papier', '2026-09-12')
    expect(r).toContain('Remise de 3 % négociée.')
    expect(r).toContain('Signature enregistrée à la main le 12/09/2026 — Signature papier.')
  })

  it('se suffit à elle-même quand il n’y a rien avant', () => {
    expect(mentionSignatureManuelle(null, 'DocuSign du fournisseur', '2026-09-12')).toBe(
      'Signature enregistrée à la main le 12/09/2026 — DocuSign du fournisseur.',
    )
  })

  it('dit « origine non précisée » plutôt que de laisser un tiret orphelin', () => {
    expect(mentionSignatureManuelle('   ', '  ', '2026-09-12')).toBe(
      'Signature enregistrée à la main le 12/09/2026 — origine non précisée.',
    )
  })
})
