import { describe, expect, it } from 'vitest'
import { replierLesFils, messageEnTexte } from '@/lib/filDiscussion'
import type { Interaction } from '@/types/domain'

/**
 * ══ LE REGROUPEMENT DES MAILS EN CONVERSATIONS ══
 *
 * William, 14/09/2026 : « avoir le fil de la conversation de mail dans Kimatch ».
 *
 * Ce qui se voit à l'écran se juge à l'œil ; ce qui se compte se teste. Les 1 341 mails repris de
 * Salesforce forment 979 fils, et le jour où l'un d'eux se replie mal, c'est ici qu'on veut
 * l'apprendre — pas dans le volet d'activité d'un commercial.
 */

function mail(p: Partial<Interaction> & { id: string; date_interaction: string }): Interaction {
  return {
    type_interaction: 'Email',
    sens: 'SORTANT',
    objet: 'Votre contrat de gaz',
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
    fil_discussion: null,
    ...p,
  } as Interaction
}

describe('replierLesFils', () => {
  it('regroupe les messages qui partagent un fil', () => {
    const { seules, fils } = replierLesFils([
      mail({ id: 'a', date_interaction: '2026-09-01T10:00:00Z', fil_discussion: '<f1@mail>' }),
      mail({ id: 'b', date_interaction: '2026-09-02T10:00:00Z', fil_discussion: '<f1@mail>' }),
      mail({ id: 'c', date_interaction: '2026-09-03T10:00:00Z', fil_discussion: '<f2@mail>' }),
      mail({ id: 'd', date_interaction: '2026-09-04T10:00:00Z', fil_discussion: '<f2@mail>' }),
    ])
    expect(fils).toHaveLength(2)
    expect(seules).toHaveLength(0)
  })

  /* LE PLUS RÉCENT EN TÊTE : la carte prend son objet, sa date et sa phrase du premier élément.
     Si l'ordre s'inversait, une conversation s'afficherait à la date de son plus vieux message et
     s'enfoncerait dans le passé du flux — le défaut exact qu'on a corrigé sur les tâches. */
  it('range chaque fil du message le plus récent au plus ancien', () => {
    const { fils } = replierLesFils([
      mail({ id: 'vieux', date_interaction: '2026-01-01T10:00:00Z', fil_discussion: '<f@mail>' }),
      mail({ id: 'recent', date_interaction: '2026-09-01T10:00:00Z', fil_discussion: '<f@mail>' }),
      mail({ id: 'milieu', date_interaction: '2026-05-01T10:00:00Z', fil_discussion: '<f@mail>' }),
    ])
    expect(fils[0].map((i) => i.id)).toEqual(['recent', 'milieu', 'vieux'])
  })

  it('laisse seul un message dont le fil ne compte que lui', () => {
    const { seules, fils } = replierLesFils([
      mail({ id: 'a', date_interaction: '2026-09-01T10:00:00Z', fil_discussion: '<seul@mail>' }),
    ])
    expect(fils).toHaveLength(0)
    expect(seules.map((i) => i.id)).toEqual(['a'])
  })

  it('laisse seuls les appels et les notes, qui n’ont pas de fil', () => {
    const { seules, fils } = replierLesFils([
      mail({ id: 'appel', date_interaction: '2026-09-01T10:00:00Z', type_interaction: 'Appel téléphonique' }),
      mail({ id: 'note', date_interaction: '2026-09-02T10:00:00Z', fil_discussion: null }),
      mail({ id: 'vide', date_interaction: '2026-09-03T10:00:00Z', fil_discussion: '   ' }),
    ])
    expect(fils).toHaveLength(0)
    expect(seules).toHaveLength(3)
  })

  it('ne perd aucun message', () => {
    const entree = [
      mail({ id: 'a', date_interaction: '2026-09-01T10:00:00Z', fil_discussion: '<f1@mail>' }),
      mail({ id: 'b', date_interaction: '2026-09-02T10:00:00Z', fil_discussion: '<f1@mail>' }),
      mail({ id: 'c', date_interaction: '2026-09-03T10:00:00Z', fil_discussion: '<f2@mail>' }),
      mail({ id: 'd', date_interaction: '2026-09-04T10:00:00Z' }),
    ]
    const { seules, fils } = replierLesFils(entree)
    const sortis = [...seules, ...fils.flat()].map((i) => i.id).sort()
    expect(sortis).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('messageEnTexte', () => {
  it('marque le sens de chaque message', () => {
    const recu = messageEnTexte(
      mail({ id: 'a', date_interaction: '2026-09-01T10:00:00Z', sens: 'ENTRANT', resume: 'Merci' }),
      'Votre contrat de gaz',
    )
    const envoye = messageEnTexte(
      mail({ id: 'b', date_interaction: '2026-09-01T10:00:00Z', sens: 'SORTANT', resume: 'Bonjour' }),
      'Votre contrat de gaz',
    )
    expect(recu.startsWith('←')).toBe(true)
    expect(envoye.startsWith('→')).toBe(true)
  })

  it('ne répète pas l’objet quand il est celui du fil, et le montre quand il change', () => {
    const identique = messageEnTexte(
      mail({ id: 'a', date_interaction: '2026-09-01T10:00:00Z', objet: 'Votre contrat', resume: 'x' }),
      'Votre contrat',
    )
    const different = messageEnTexte(
      mail({ id: 'b', date_interaction: '2026-09-01T10:00:00Z', objet: 'RE: Votre contrat', resume: 'x' }),
      'Votre contrat',
    )
    expect(identique).not.toContain('Votre contrat')
    expect(different).toContain('RE: Votre contrat')
  })

  /* 2 des 1 598 mails repris n'ont pas de corps. Une carte qui affiche une ligne vide au milieu
     d'une conversation laisse croire à un message perdu ; on dit qu'il est vide. */
  it('dit qu’un message est vide plutôt que de laisser un trou', () => {
    const texte = messageEnTexte(
      mail({ id: 'a', date_interaction: '2026-09-01T10:00:00Z', resume: null, resultat: null }),
      'Votre contrat',
    )
    expect(texte).toContain('(message vide)')
  })
})
