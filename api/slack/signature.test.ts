import { describe, expect, it } from 'vitest'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * ══ LA SIGNATURE SLACK EST LE SEUL REMPART DE `evenements.ts` ══
 *
 * Ce point d'entrée est public : Slack n'a pas de compte Kimatch, il ne peut pas se connecter. La
 * signature est donc la seule chose qui distingue Slack de n'importe qui sur internet. Si elle
 * cède, un inconnu crée des pistes dans le CRM en connaissant l'adresse.
 *
 * On reproduit ici la vérification à l'identique. Deux règles s'y jouent, et chacune répond à une
 * attaque précise :
 *
 *   LA SIGNATURE porte sur les octets exacts du corps — la changer d'une virgule la casse.
 *   L'HORODATAGE limite la validité à cinq minutes. Sans lui, une requête interceptée resterait
 *   rejouable pour toujours, puisqu'une signature juste le reste.
 */

const SECRET = 'secret-de-test-slack'

function signer(corps: string, horodatage: string, secret = SECRET): string {
  return 'v0=' + createHmac('sha256', secret).update(`v0:${horodatage}:${corps}`).digest('hex')
}

/** La vérification de `api/slack/evenements.ts`, à l'identique. */
function verifier(corps: string, horodatage: string, signature: string, maintenant = Date.now()): boolean {
  if (!horodatage || !signature) return false
  if (Math.abs(maintenant / 1000 - Number(horodatage)) > 300) return false
  const attendue = 'v0=' + createHmac('sha256', SECRET).update(`v0:${horodatage}:${corps}`).digest('hex')
  const a = Buffer.from(attendue)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

const CORPS = JSON.stringify({ event: { type: 'message', text: 'Nouveau lead' } })

describe('la signature Slack', () => {
  it('accepte une requête correctement signée', () => {
    const t = String(Math.floor(Date.now() / 1000))
    expect(verifier(CORPS, t, signer(CORPS, t))).toBe(true)
  })

  it('refuse un corps modifié après signature', () => {
    const t = String(Math.floor(Date.now() / 1000))
    const signature = signer(CORPS, t)
    const falsifie = JSON.stringify({ event: { type: 'message', text: 'Nouveau lead FAUX' } })
    expect(verifier(falsifie, t, signature)).toBe(false)
  })

  it('refuse une signature faite avec un autre secret', () => {
    const t = String(Math.floor(Date.now() / 1000))
    expect(verifier(CORPS, t, signer(CORPS, t, 'mauvais-secret'))).toBe(false)
  })

  /* Une signature juste le reste pour toujours : sans fenêtre de temps, une requête interceptée
     aujourd'hui serait rejouable dans six mois. */
  it('refuse une requête vieille de plus de cinq minutes', () => {
    const maintenant = Date.now()
    const vieux = String(Math.floor(maintenant / 1000) - 400)
    expect(verifier(CORPS, vieux, signer(CORPS, vieux), maintenant)).toBe(false)
  })

  it('refuse une requête datée du futur', () => {
    const maintenant = Date.now()
    const futur = String(Math.floor(maintenant / 1000) + 400)
    expect(verifier(CORPS, futur, signer(CORPS, futur), maintenant)).toBe(false)
  })

  it('refuse une requête sans signature ni horodatage', () => {
    expect(verifier(CORPS, '', '')).toBe(false)
  })

  /* `timingSafeEqual` lève si les longueurs diffèrent : sans le test de longueur qui le précède,
     une signature tronquée ferait planter le point d'entrée au lieu de la refuser. */
  it('refuse une signature tronquée sans lever d’exception', () => {
    const t = String(Math.floor(Date.now() / 1000))
    expect(() => verifier(CORPS, t, signer(CORPS, t).slice(0, 20))).not.toThrow()
    expect(verifier(CORPS, t, signer(CORPS, t).slice(0, 20))).toBe(false)
  })
})
