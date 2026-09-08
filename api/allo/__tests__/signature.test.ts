import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { clefDepuisSecret, signatureValide, signerPourTest, TOLERANCE_SECONDES } from '../_signature.js'

/**
 * ══ POURQUOI CES TESTS EXISTENT ══
 *
 * Cette fonction ne peut pas être vérifiée contre du vrai trafic avant la mise en service du
 * webhook : Allo n'envoie rien tant que l'endpoint n'est pas créé, et une fois créé, une erreur ici
 * REJETTE TOUT EN SILENCE. Kimatch répondrait 401 à chaque appel, le taux d'erreur monterait dans
 * le tableau d'Allo, et personne ne saurait qu'aucun appel n'arrive — la panne exacte qu'a subie
 * DocuSign le 14/08/2026, pendant laquelle 25 notifications ont été refusées dont une enveloppe
 * signée.
 *
 * Chaque test ci-dessous correspond à une façon précise de se tromper.
 */

// Un secret de la forme qu'Allo donne : `whsec_` suivi de base64. Sans valeur, jamais utilisé.
const SECRET = 'whsec_' + Buffer.from('un-secret-de-test-sans-aucune-valeur').toString('base64')
const ID = 'msg_2NfDKEm9sF8xK3pQr1Zt'
const CORPS = '{"topic":"call.completed","version":"2.0","data":{"id":"cll_abc","result":"ANSWERED"}}'
const MAINTENANT = 1_757_000_000

const entetes = (signature: string, horodatage: number = MAINTENANT) => ({
  'webhook-id': ID,
  'webhook-timestamp': String(horodatage),
  'webhook-signature': signature,
})

describe('clefDepuisSecret', () => {
  it('retire le préfixe whsec_ et décode le base64', () => {
    // LE PIÈGE PRINCIPAL. Utiliser la chaîne telle quelle produirait une signature toujours fausse,
    // avec un 401 indistinguable d'une vraie tentative d'intrusion.
    expect(clefDepuisSecret(SECRET).toString()).toBe('un-secret-de-test-sans-aucune-valeur')
  })

  it('accepte un secret sans préfixe, au cas où Allo change de forme', () => {
    const nu = Buffer.from('abc').toString('base64')
    expect(clefDepuisSecret(nu).toString()).toBe('abc')
  })
})

describe('signatureValide', () => {
  it('accepte la signature des octets reçus', () => {
    const sig = signerPourTest(CORPS, ID, MAINTENANT, SECRET)
    expect(signatureValide(CORPS, entetes(sig), SECRET, MAINTENANT)).toBe(true)
  })

  it('refuse un corps ré-sérialisé — la première cause des 401', () => {
    /* `JSON.parse` puis `JSON.stringify` ne redonne pas les mêmes octets dès que l'envoi contient de
       la mise en forme. C'est pour cela que le gestionnaire lit le corps BRUT et désactive
       `bodyParser`.

       LE CORPS DE CE TEST EST INDENTÉ EXPRÈS. Ma première version utilisait le corps compact
       ci-dessus, qui retraverse `JSON.stringify` à l'identique — le test échouait donc sur sa propre
       hypothèse, pas sur le code. Les charges utiles d'Allo, comme celles de leur documentation,
       sont mises en forme : c'est ce cas-là qu'il faut éprouver. */
    const indente = '{\n  "topic": "call.completed",\n  "data": { "id": "cll_abc" }\n}'
    const sig = signerPourTest(indente, ID, MAINTENANT, SECRET)
    const reserialise = JSON.stringify(JSON.parse(indente))
    expect(reserialise).not.toBe(indente)
    expect(signatureValide(indente, entetes(sig), SECRET, MAINTENANT)).toBe(true)
    expect(signatureValide(reserialise, entetes(sig), SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse un corps modifié d’un seul caractère', () => {
    const sig = signerPourTest(CORPS, ID, MAINTENANT, SECRET)
    const falsifie = CORPS.replace('ANSWERED', 'VOICEMAIL')
    expect(signatureValide(falsifie, entetes(sig), SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse une signature calculée sur un autre identifiant de message', () => {
    // Le contenu signé est `{id}.{timestamp}.{corps}` : oublier l'un des trois est une erreur
    // silencieuse, et c'est la plus facile à commettre.
    const sig = signerPourTest(CORPS, 'msg_autre', MAINTENANT, SECRET)
    expect(signatureValide(CORPS, entetes(sig), SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse une signature qui ne porte que le corps', () => {
    const naive = 'v1,' + createHmac('sha256', clefDepuisSecret(SECRET)).update(CORPS).digest('base64')
    expect(signatureValide(CORPS, entetes(naive), SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse un horodatage trop vieux — la protection contre le rejeu', () => {
    const vieux = MAINTENANT - TOLERANCE_SECONDES - 1
    const sig = signerPourTest(CORPS, ID, vieux, SECRET)
    expect(signatureValide(CORPS, entetes(sig, vieux), SECRET, MAINTENANT)).toBe(false)
  })

  it('accepte un horodatage à la limite de la tolérance', () => {
    const limite = MAINTENANT - TOLERANCE_SECONDES
    const sig = signerPourTest(CORPS, ID, limite, SECRET)
    expect(signatureValide(CORPS, entetes(sig, limite), SECRET, MAINTENANT)).toBe(true)
  })

  it('refuse un horodatage venu du futur', () => {
    const futur = MAINTENANT + TOLERANCE_SECONDES + 1
    const sig = signerPourTest(CORPS, ID, futur, SECRET)
    expect(signatureValide(CORPS, entetes(sig, futur), SECRET, MAINTENANT)).toBe(false)
  })

  it('accepte quand UNE des signatures correspond — la rotation de secret', () => {
    // Allo envoie plusieurs signatures séparées par des espaces pendant qu'un secret tourne. Ne
    // regarder que la première couperait le service pendant la rotation.
    const bonne = signerPourTest(CORPS, ID, MAINTENANT, SECRET)
    const autre = signerPourTest(CORPS, ID, MAINTENANT, 'whsec_' + Buffer.from('vieux').toString('base64'))
    expect(signatureValide(CORPS, entetes(`${autre} ${bonne}`), SECRET, MAINTENANT)).toBe(true)
    expect(signatureValide(CORPS, entetes(`${bonne} ${autre}`), SECRET, MAINTENANT)).toBe(true)
  })

  it('refuse quand aucune des signatures ne correspond', () => {
    const a = signerPourTest(CORPS, ID, MAINTENANT, 'whsec_' + Buffer.from('un').toString('base64'))
    const b = signerPourTest(CORPS, ID, MAINTENANT, 'whsec_' + Buffer.from('deux').toString('base64'))
    expect(signatureValide(CORPS, entetes(`${a} ${b}`), SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse sans lever quand une signature est tronquée', () => {
    // `timingSafeEqual` LÈVE sur deux tampons de longueurs différentes. Sans le contrôle de
    // longueur, une signature tronquée donnerait un 500 au lieu d'un refus propre — et Allo
    // réessaierait indéfiniment.
    const sig = signerPourTest(CORPS, ID, MAINTENANT, SECRET).slice(0, 20)
    expect(() => signatureValide(CORPS, entetes(sig), SECRET, MAINTENANT)).not.toThrow()
    expect(signatureValide(CORPS, entetes(sig), SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse quand un en-tête manque, sans lever', () => {
    const sig = signerPourTest(CORPS, ID, MAINTENANT, SECRET)
    expect(signatureValide(CORPS, { 'webhook-id': ID, 'webhook-signature': sig }, SECRET, MAINTENANT)).toBe(false)
    expect(signatureValide(CORPS, {}, SECRET, MAINTENANT)).toBe(false)
  })

  it('refuse un horodatage qui n’est pas un nombre', () => {
    const sig = signerPourTest(CORPS, ID, MAINTENANT, SECRET)
    expect(signatureValide(CORPS, { ...entetes(sig), 'webhook-timestamp': 'hier' }, SECRET, MAINTENANT)).toBe(false)
  })

  it('accepte un en-tête répété, que Node rend en tableau', () => {
    const sig = signerPourTest(CORPS, ID, MAINTENANT, SECRET)
    const enTableau = {
      'webhook-id': [ID],
      'webhook-timestamp': [String(MAINTENANT)],
      'webhook-signature': [sig],
    }
    expect(signatureValide(CORPS, enTableau, SECRET, MAINTENANT)).toBe(true)
  })

  it('accepte un corps accentué — les résumés d’appel en sont pleins', () => {
    // L'encodage compte : le contenu signé est construit en UTF-8 des deux côtés. Un résumé d'appel
    // français contient des accents à chaque phrase, et une erreur ici ne se verrait que sur ceux-là.
    const accentue = '{"topic":"call.completed","data":{"summary":"Échange très cordial, à rappeler après l’AG"}}'
    const sig = signerPourTest(accentue, ID, MAINTENANT, SECRET)
    expect(signatureValide(accentue, entetes(sig), SECRET, MAINTENANT)).toBe(true)
  })
})
