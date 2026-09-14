import { describe, expect, it } from 'vitest'
import { sansCitation } from './_client.js'

/**
 * ══ COUPER LES CITATIONS D'UNE RÉPONSE ══
 *
 * Le rapatriement des réponses (api/gmail/rapatrier.ts) écrit le texte de chaque message entrant
 * dans l'activité du client. Sans découpage, une réponse de trois lignes traînerait tout l'échange
 * en dessous : dans un fil de six messages, le premier apparaîtrait six fois, et la carte qui les
 * empile deviendrait illisible.
 *
 * Les marqueurs testés ici sont ceux que posent Gmail et Outlook, en français et en anglais. Ce
 * sont les seuls clients utilisés chez KiWee, mais la fonction doit surtout ne JAMAIS rendre une
 * carte vide — c'est le dernier cas, et le plus important.
 */

describe('sansCitation', () => {
  it('coupe sur le « Le … a écrit : » de Gmail en français', () => {
    const texte = [
      'Bonjour, c’est d’accord pour le 12 mars.',
      '',
      'Le jeu. 11 sept. 2026 à 09:14, Fabien DUBARRY <f.dubarry@kiwee-energie.fr> a écrit :',
      '> Bonjour Madame, faisons le point sur votre échéance…',
    ].join('\n')
    expect(sansCitation(texte)).toBe('Bonjour, c’est d’accord pour le 12 mars.')
  })

  it('coupe sur le « On … wrote: » de Gmail en anglais', () => {
    const texte = 'Yes, please proceed.\n\nOn Thu, 11 Sep 2026 at 09:14, Fabien wrote:\n> Hello…'
    expect(sansCitation(texte)).toBe('Yes, please proceed.')
  })

  it('coupe sur l’en-tête « De: / Envoyé: » d’Outlook', () => {
    const texte = [
      'Je transmets au conseil syndical.',
      '',
      'De : Fabien DUBARRY <f.dubarry@kiwee-energie.fr>',
      'Envoyé : jeudi 11 septembre 2026 09:14',
      'À : a.vedrenne@agence-igc.com',
      'Objet : Votre contrat de gaz',
    ].join('\n')
    expect(sansCitation(texte)).toBe('Je transmets au conseil syndical.')
  })

  it('coupe sur la ligne de soulignés qu’Outlook insère', () => {
    const texte = 'D’accord.\n\n__________________________________\nDe : quelqu’un'
    expect(sansCitation(texte)).toBe('D’accord.')
  })

  it('laisse intact un message qui ne cite rien', () => {
    const texte = 'Bonjour,\n\nPouvez-vous me rappeler demain matin ?\n\nBien à vous'
    expect(sansCitation(texte)).toBe(texte)
  })

  /* LE CAS QUI COMPTE LE PLUS. Certaines réponses ne contiennent QUE la citation — un « ok »
     écrit dans l'objet, ou une réponse vide sur mobile. Couper à zéro rendrait une carte muette
     dans l'activité, ce qui ferait croire à un message perdu. Mieux vaut trop que rien. */
  it('garde tout plutôt que de rendre un message vide', () => {
    const texte = 'Le jeu. 11 sept. 2026 à 09:14, Fabien a écrit :\n> Bonjour Madame…'
    expect(sansCitation(texte)).toBe(texte.trim())
  })

  it('prend le PREMIER marqueur quand il y en a plusieurs', () => {
    const texte = [
      'Parfait.',
      '',
      'Le jeu. 11 sept. 2026, Fabien a écrit :',
      '> Le mer. 10 sept. 2026, Madame VEDRENNE a écrit :',
      '>> Bonjour…',
    ].join('\n')
    expect(sansCitation(texte)).toBe('Parfait.')
  })
})
