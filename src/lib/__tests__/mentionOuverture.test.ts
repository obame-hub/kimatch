import { describe, expect, it } from 'vitest'
import { mentionOuverture } from '@/lib/mentionOuverture'
import type { Interaction } from '@/types/domain'

/**
 * ══ QUI A LE DROIT DE DIRE « OUVERT » ══
 *
 * Naoëlle, 14/09/2026, capture à l'appui : « pas encore ouvert » s'affichait sur ses APPELS
 * TÉLÉPHONIQUES sortants.
 *
 * La cause était ma propre contradiction. Le composant testait `sens === 'SORTANT'` puis
 * `nb_ouvertures !== null`, avec en commentaire « null sur tout ce qui n'est pas suivi » — alors
 * que la migration déclare `nb_ouvertures integer NOT NULL DEFAULT 0`. Les 20 731 appels valaient
 * donc 0, comme un mail jamais ouvert, et un appel sortant est bien de sens SORTANT.
 *
 * Mesuré après coup : 1 interaction sur 29 951 sortantes porte réellement un pixel.
 *
 * Ces tests existent pour que la règle ne redevienne jamais implicite.
 */

function interaction(p: Partial<Interaction>): Interaction {
  return {
    id: 'x',
    type_interaction: 'Email',
    date_interaction: '2026-09-14T20:32:00Z',
    sens: 'SORTANT',
    objet: 'test',
    resume: null,
    resultat: null,
    auteur: '',
    auteur_profil_id: null,
    compte_id: null,
    compte_nom: '',
    site_id: null,
    site_nom: '',
    contact_id: null,
    contact_nom: '',
    proprietaire_id: null,
    ...p,
  } as Interaction
}

describe('mentionOuverture', () => {
  /* LE CAS DE LA CAPTURE. Un appel sortant n'est pas un mail : il ne s'ouvre pas, et la mention
     n'a rien à faire sur sa carte. C'est le défaut exact du 14/09. */
  it('ne dit rien d’un appel sortant, même avec nb_ouvertures à 0', () => {
    expect(mentionOuverture(interaction({
      type_interaction: 'Appel téléphonique', ouverture_suivie: false, nb_ouvertures: 0,
    }))).toBeNull()
  })

  it('ne dit rien d’un mail reçu', () => {
    expect(mentionOuverture(interaction({
      sens: 'ENTRANT', ouverture_suivie: false, nb_ouvertures: 0,
    }))).toBeNull()
  })

  it('ne dit rien d’un mail repris de Salesforce, qui n’a jamais porté de pixel', () => {
    expect(mentionOuverture(interaction({ ouverture_suivie: false, nb_ouvertures: 0 }))).toBeNull()
  })

  it('dit « pas encore ouvert » d’un mail suivi que personne n’a ouvert', () => {
    expect(mentionOuverture(interaction({ ouverture_suivie: true, nb_ouvertures: 0 })))
      .toBe('pas encore ouvert')
  })

  it('dit « ouvert » au singulier pour une seule ouverture', () => {
    expect(mentionOuverture(interaction({
      ouverture_suivie: true, nb_ouvertures: 1, derniere_ouverture_le: '2026-09-14T20:32:00Z',
    }))).toBe('ouvert, le 14/09/2026')
  })

  it('compte les ouvertures au-delà de la première', () => {
    expect(mentionOuverture(interaction({
      ouverture_suivie: true, nb_ouvertures: 3, derniere_ouverture_le: '2026-09-14T20:32:00Z',
    }))).toBe('ouvert 3 fois, le 14/09/2026')
  })

  it('se passe de la date quand elle manque', () => {
    expect(mentionOuverture(interaction({
      ouverture_suivie: true, nb_ouvertures: 2, derniere_ouverture_le: null,
    }))).toBe('ouvert 2 fois')
  })

  it('ne dit rien d’une interaction absente', () => {
    expect(mentionOuverture(undefined)).toBeNull()
  })
})
