import { describe, expect, it } from 'vitest'
import { suggestionRelance } from '@/lib/relance'

/**
 * La suggestion de relance, éprouvée cas par cas.
 *
 * ══ POURQUOI CE FICHIER EXISTE ══
 *
 * Cette fonction n'avait aucun test, et elle s'est cassée DEUX FOIS en silence :
 *
 *   · le 28/08/2026, quand « Présentée » est passé d'une étape de dossier à un statut de version —
 *     l'appel a continué de passer l'étape, et la condition est devenue fausse pour tout le monde ;
 *   · depuis toujours, sa liste d'étapes fermées citait trois codes que plus aucun dossier ne porte
 *     et oubliait `CLOTUREE`, que 1 623 portent.
 *
 * Aucune des deux n'a jamais levé d'erreur. Une fonction qui rend `null` au lieu d'une suggestion ne
 * se plaint pas : elle donne l'impression que personne n'a besoin d'être relancé.
 */
const LUNDI = new Date('2026-09-14T10:00:00Z')

function version(p: Partial<{ version_actuelle: boolean; date_presentation_client: string | null; date_decision_client: string | null }> = {}) {
  return {
    version_actuelle: true,
    date_presentation_client: '2026-09-09',
    date_decision_client: null,
    ...p,
  }
}

describe('suggestionRelance', () => {
  it('propose une relance après deux jours ouvrés sur un dossier actif', () => {
    const s = suggestionRelance('ACTIVE', version(), null, LUNDI)
    expect(s).not.toBeNull()
    expect(s?.texte).toContain('sans retour du client')
  })

  it('se tait sur un dossier clôturé — le cas que l’ancienne liste laissait passer', () => {
    expect(suggestionRelance('CLOTUREE', version(), null, LUNDI)).toBeNull()
  })

  it('se tait sur les étapes qu’on ne connaît pas, plutôt que de crier', () => {
    for (const etape of ['A_REACTIVER', 'BROUILLON', 'UNE_ETAPE_INVENTEE_DEMAIN']) {
      expect(suggestionRelance(etape, version(), null, LUNDI)).toBeNull()
    }
  })

  it('exige que l’offre soit partie chez le client', () => {
    expect(suggestionRelance('ACTIVE', version({ date_presentation_client: null }), null, LUNDI)).toBeNull()
  })

  it('se tait quand le client a répondu', () => {
    expect(suggestionRelance('ACTIVE', version({ date_decision_client: '2026-09-10' }), null, LUNDI)).toBeNull()
  })

  it('se tait sur une version remplacée par une plus récente', () => {
    expect(suggestionRelance('ACTIVE', version({ version_actuelle: false }), null, LUNDI)).toBeNull()
  })

  it('attend vraiment deux jours OUVRÉS : un week-end ne compte pas', () => {
    // Présentée le vendredi 11, on est le lundi 14 : un seul jour ouvré s'est écoulé.
    expect(suggestionRelance('ACTIVE', version({ date_presentation_client: '2026-09-11' }), null, LUNDI)).toBeNull()
  })

  it('repart du jour de la dernière relance, et le dit autrement', () => {
    const s = suggestionRelance('ACTIVE', version({ date_presentation_client: '2026-09-01' }), '2026-09-09', LUNDI)
    expect(s).not.toBeNull()
    expect(s?.relancee).toBe(true)
    expect(s?.texte).toContain('Relancée')
  })

  it('se tait sans version', () => {
    expect(suggestionRelance('ACTIVE', null, null, LUNDI)).toBeNull()
  })
})
