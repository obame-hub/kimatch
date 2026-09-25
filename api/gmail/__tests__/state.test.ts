import { describe, expect, it, beforeAll } from 'vitest'
import { encodeState, decodeState } from '../_client.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE `state` GMAIL NE SE FORGE PLUS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'au 25/09/2026, `state` valait `${profilId}|${origine}` en clair. Il transite par Google et
 * revient par l'URL : celui qui lance la connexion le contrôle entièrement. En y mettant
 * l'identifiant d'un collègue, on faisait écrire SES PROPRES jetons Google à la ligne de ce
 * collègue — et Kimatch envoyait ensuite les mails du collègue depuis la boîte de l'attaquant.
 *
 * Ces essais tiennent la correction. Le premier est le plus important : il ÉCHOUERAIT sur l'ancien
 * code, qui acceptait n'importe quel `profilId|origine` tapé à la main.
 */

const VICTIME = '11111111-1111-4111-8111-111111111111'
const ATTAQUANT = '22222222-2222-4222-8222-222222222222'

beforeAll(() => {
  // La signature a besoin d'un secret ; en essai, sa valeur n'a pas d'importance, sa présence si.
  process.env.GMAIL_CLIENT_SECRET = 'secret-d-essai-sans-consequence'
})

describe('le state Gmail', () => {
  it('refuse un state forgé à la main — la faille du 25/09/2026', () => {
    // Exactement ce qu'un attaquant tapait : l'identifiant de la victime, en clair.
    const forge = `${VICTIME}|https://kimatch.fr`
    expect(decodeState(forge).profilId).toBeUndefined()
  })

  it('refuse un state dont la signature ne correspond pas', () => {
    const vrai = encodeState(ATTAQUANT, 'https://kimatch.fr')
    const [charge] = vrai.split('.')
    // On garde la charge, on remplace la signature : c'est la falsification la plus directe.
    expect(decodeState(`${charge}.signature-inventee`).profilId).toBeUndefined()
  })

  it('refuse un state dont la charge a été modifiée après signature', () => {
    const vrai = encodeState(ATTAQUANT, 'https://kimatch.fr')
    const [, signature] = vrai.split('.')
    // On remplace l'identifiant par celui de la victime, en gardant la signature d'origine.
    const chargeVictime = Buffer.from(`${VICTIME}|https://kimatch.fr|${Date.now()}`).toString('base64url')
    expect(decodeState(`${chargeVictime}.${signature}`).profilId).toBeUndefined()
  })

  it('rend le profil quand le state est authentique', () => {
    // SANS CET ESSAI, LES TROIS PRÉCÉDENTS NE PROUVENT RIEN : une fonction qui refuse tout les
    // passerait tous, et plus personne ne pourrait connecter sa boîte.
    const bon = encodeState(ATTAQUANT, 'https://kimatch.fr')
    const lu = decodeState(bon)
    expect(lu.profilId).toBe(ATTAQUANT)
    expect(lu.appUrl).toBe('https://kimatch.fr')
  })

  it('refuse un state de plus de quinze minutes', () => {
    // Un `state` capturé dans un historique de navigation ne doit pas valoir indéfiniment.
    const vieux = Date.now() - 16 * 60 * 1000
    const charge = `${ATTAQUANT}|https://kimatch.fr|${vieux}`
    const { createHmac } = require('crypto') as typeof import('crypto')
    const signature = createHmac('sha256', process.env.GMAIL_CLIENT_SECRET as string)
      .update(charge).digest('base64url')
    const state = `${Buffer.from(charge).toString('base64url')}.${signature}`
    expect(decodeState(state).profilId).toBeUndefined()
  })

  it('ramène toujours sur une origine connue, jamais ailleurs', () => {
    // Le `state` revient par l'URL : une origine arbitraire ferait un open redirect.
    const state = encodeState(ATTAQUANT, 'https://site-de-lattaquant.example')
    expect(decodeState(state).appUrl).toBe('https://kimatch.fr')
  })

  it('ne rend aucun profil quand le state est absent ou vide', () => {
    expect(decodeState(undefined).profilId).toBeUndefined()
    expect(decodeState('').profilId).toBeUndefined()
  })
})
