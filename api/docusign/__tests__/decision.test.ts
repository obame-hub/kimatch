import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import { doitEcrire, statutPourEnveloppe, verifierSignature, statutAEcrire, statutMetierContrat } from '../_decision.js'

const SECRET = 'un-secret-de-test-sans-valeur'
const signer = (corps: string) => createHmac('sha256', SECRET).update(corps, 'utf8').digest('base64')

/**
 * CE SONT LES RÈGLES QUI DÉCIDENT QU'UN CONTRAT EST SIGNÉ.
 *
 * Chacune a déjà échoué en production, en silence : aucune erreur à l'écran, simplement un mandat
 * qui n'avance plus. 25 notifications refusées, dont l'enveloppe signée de CABINET MOLINIER.
 */
describe('verifierSignature', () => {
  it('accepte la signature des octets reçus', () => {
    const corps = '{"data":{"envelopeId":"abc"}}'
    expect(verifierSignature(corps, signer(corps), SECRET)).toBe(true)
  })

  it('refuse la signature d’un corps re-sérialisé — la première cause des 401', () => {
    // DocuSign signe les octets qu'il envoie. `JSON.parse` puis `JSON.stringify` produit un texte
    // équivalent mais pas identique : espaces et ordre des clés changent, et la signature tombe.
    const recu = '{ "data" : { "envelopeId" : "abc" } }'
    const reserialise = JSON.stringify(JSON.parse(recu))
    expect(reserialise).not.toBe(recu)
    expect(verifierSignature(recu, signer(reserialise), SECRET)).toBe(false)
  })

  it('refuse une signature absente, vide, ou faite avec une autre clé', () => {
    const corps = '{"data":{}}'
    expect(verifierSignature(corps, undefined, SECRET)).toBe(false)
    expect(verifierSignature(corps, '', SECRET)).toBe(false)
    const autreCle = createHmac('sha256', 'pas-la-bonne-cle').update(corps, 'utf8').digest('base64')
    expect(verifierSignature(corps, autreCle, SECRET)).toBe(false)
  })

  it('refuse une signature de longueur différente sans lever d’exception', () => {
    // `timingSafeEqual` jette si les deux tampons n'ont pas la même taille : le garde-fou de
    // longueur doit passer AVANT, sinon le webhook renvoie 500 au lieu de 401.
    const corps = '{"data":{}}'
    expect(() => verifierSignature(corps, 'trop-court', SECRET)).not.toThrow()
    expect(verifierSignature(corps, 'trop-court', SECRET)).toBe(false)
  })
})

describe('statutPourEnveloppe', () => {
  it('traduit les cinq états que DocuSign nous envoie', () => {
    expect(statutPourEnveloppe('sent')).toBe('ENVOYE')
    expect(statutPourEnveloppe('completed')).toBe('SIGNE')
    expect(statutPourEnveloppe('declined')).toBe('REFUSE')
    expect(statutPourEnveloppe('voided')).toBe('ANNULE')
  })

  it('traduit « delivered » par « consulté » — ni envoyé, ni signé', () => {
    // « delivered » veut dire « le destinataire a OUVERT l'enveloppe ». Le ranger avec « envoyé »
    // perdait le moment où une relance sert à quelque chose (William, 08/09/2026) ; le traduire par
    // SIGNE marquerait comme signés des mandats que personne n'a encore paraphés.
    expect(statutPourEnveloppe('delivered')).toBe('CONSULTE')
  })

  it('rend null sur un état inconnu plutôt que d’inventer un statut', () => {
    expect(statutPourEnveloppe('created')).toBeNull()
    expect(statutPourEnveloppe('deleted')).toBeNull()
    expect(statutPourEnveloppe('COMPLETED')).toBeNull() // DocuSign envoie en minuscules
    expect(statutPourEnveloppe(undefined)).toBeNull()
    expect(statutPourEnveloppe(null)).toBeNull()
    expect(statutPourEnveloppe('')).toBeNull()
  })
})

describe('doitEcrire', () => {
  it('refuse de ramener un contrat signé à « envoyé » ou « consulté »', () => {
    // DocuSign rejoue ses notifications, et rien ne garantit l'ordre d'arrivée. Un « sent » rejoué
    // après le « completed » ferait repartir le mandat en attente d'une signature déjà obtenue.
    expect(doitEcrire('SIGNE', 'ENVOYE')).toBe(false)
    // Même piège avec le nouvel état : « le client vient d'ouvrir le document » après signature.
    expect(doitEcrire('SIGNE', 'CONSULTE')).toBe(false)
  })

  it('laisse passer tous les autres enchaînements', () => {
    expect(doitEcrire('ENVOYE', 'SIGNE')).toBe(true)
    expect(doitEcrire('SIGNE', 'ANNULE')).toBe(true)   // une enveloppe signée peut être annulée
    expect(doitEcrire('ENVOYE', 'REFUSE')).toBe(true)
    expect(doitEcrire(null, 'ENVOYE')).toBe(true)
    expect(doitEcrire(undefined, 'SIGNE')).toBe(true)
  })
})

describe('statutAEcrire — le mandat n’a plus d’étape « Signé »', () => {
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  it('rend ACTIF pour une signature dans sa fenêtre', () => {
    expect(statutAEcrire('SIGNE', { debut: hier, fin: demain })).toBe('ACTIF')
  })

  it('rend ACTIF quand la fenêtre est inconnue', () => {
    // 1 137 mandats importés de Salesforce n'ont pas de dates : sans fenêtre, un mandat signé court.
    expect(statutAEcrire('SIGNE', { debut: null, fin: null })).toBe('ACTIF')
  })

  it('rend EXPIRE — et jamais « SIGNE » — quand la fenêtre est passée', () => {
    // Le jalon a été supprimé du référentiel le 08/09/2026 : y renvoyer écrirait un code inconnu.
    expect(statutAEcrire('SIGNE', { debut: '2020-01-01', fin: hier })).toBe('EXPIRE')
  })

  it('laisse passer tel quel ce qui n’est pas une signature', () => {
    expect(statutAEcrire('CONSULTE', { debut: null, fin: null })).toBe('CONSULTE')
    expect(statutAEcrire('REFUSE', { debut: null, fin: null })).toBe('REFUSE')
  })
})

describe('statutMetierContrat', () => {
  it('garde « à signer » quand le client a seulement consulté', () => {
    // Le vocabulaire du contrat ne connaît pas « Consulté » : ouvert ou non, il reste à signer.
    expect(statutMetierContrat('CONSULTE', { debut: null, fin: null })).toBe('A_SIGNER')
    expect(statutMetierContrat('ENVOYE', { debut: null, fin: null })).toBe('A_SIGNER')
  })

  it('garde un « Signé » bien vivant côté contrat', () => {
    // La suppression du jalon ne concerne QUE les mandats : les deux vocabulaires sont distincts.
    expect(statutMetierContrat('SIGNE', { debut: null, fin: null })).toBe('SIGNE')
  })
})
