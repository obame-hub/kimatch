import { describe, expect, it } from 'vitest'
import { choisirLaMemePersonne, type PisteConnue } from './_creerPisteDepuisLead.js'

/**
 * ══ CE TEST EXISTE À CAUSE DU 16 SEPTEMBRE 2026 ══
 *
 * Ce matin-là, la relecture nocturne de #leads a créé 93 pistes, dont 61 doublaient une piste déjà
 * présente venue de Salesforce. Des commerciaux allaient rappeler des prospects déjà en cours.
 *
 * La cause : la seule clé anti-doublon était l'horodatage Slack. Elle garantit qu'un MÊME MESSAGE
 * ne crée qu'une piste — mais les pistes venues de Salesforce n'ont pas d'horodatage Slack. Pour
 * cette clé, elles n'existaient pas. Une clé d'idempotence ne protège que des rejeux de sa propre
 * source ; elle est aveugle à ce qui est entré par une autre porte.
 *
 * LES DEUX ERREURS SONT TESTÉES ICI, et elles ne coûtent pas la même chose :
 *
 *   NE PAS RECONNAÎTRE quelqu'un de connu → un doublon, qu'on voit et qu'on nettoie.
 *   RECONNAÎTRE À TORT → un vrai lead jamais créé, que personne ne remarque jamais.
 *
 * C'est pourquoi le téléphone seul ne suffit pas : deux leads d'essai portaient tous deux
 * `06 12 34 56 78` avec des noms et des sociétés différents.
 */

const connue = (p: Partial<PisteConnue>): PisteConnue => ({
  id: 'id-1', reference: 'PST-2026-0001', email: null, telephone: null,
  contact_nom: null, societe: null, source_externe_id: null, ...p,
})

const lead = (p: Partial<{ email: string | null; telephone: string | null; contactNom: string | null; societe: string | null }>) => ({
  email: null, telephone: null, contactNom: null, societe: null, ...p,
})

describe('reconnaître une personne déjà connue', () => {
  it('reconnaît une adresse e-mail identique', () => {
    const c = connue({ email: 'brichetdiet22@gmail.com' })
    expect(choisirLaMemePersonne([c], lead({ email: 'brichetdiet22@gmail.com' }))).toBe(c)
  })

  /* Le formulaire du site n'impose pas la casse, et Salesforce l'a parfois normalisée. */
  it('ignore la casse de l’adresse', () => {
    const c = connue({ email: 'Apperemeghan@hotmail.fr' })
    expect(choisirLaMemePersonne([c], lead({ email: 'apperemeghan@hotmail.fr' }))).toBe(c)
  })

  /* Le cas réel qui a tout déclenché : même numéro écrit de deux façons, même personne. */
  it('reconnaît un téléphone écrit autrement quand le nom concorde', () => {
    const c = connue({ telephone: '+33 6 10 01 59 42', contact_nom: 'laurent Brichet' })
    expect(choisirLaMemePersonne([c], lead({ telephone: '0610015942', contactNom: 'Laurent BRICHET' }))).toBe(c)
  })

  it('reconnaît un téléphone identique quand la société concorde', () => {
    const c = connue({ telephone: '0688815638', societe: 'OPSALT CONSEIL' })
    expect(choisirLaMemePersonne([c], lead({ telephone: '06 88 81 56 38', societe: 'Opsalt Conseil' }))).toBe(c)
  })
})

describe('ne pas confondre deux personnes', () => {
  /* LE FAUX POSITIF QUI A ÉTÉ TROUVÉ LE 16/09 : deux leads d'essai, le même faux numéro, des
     identités sans rapport. Les apparier aurait refusé un lead en croyant le connaître. */
  it('refuse d’apparier deux inconnus qui partagent un numéro bidon', () => {
    const c = connue({ telephone: '0612345678', contact_nom: 'Test Test', societe: 'Ma Société Sans Registre' })
    expect(choisirLaMemePersonne([c], lead({ telephone: '0612345678', contactNom: 'Jean Dupont', societe: 'PPG' }))).toBeNull()
  })

  it('refuse d’apparier sur un champ vide des deux côtés', () => {
    const c = connue({ telephone: '0612345678', contact_nom: null, societe: null })
    expect(choisirLaMemePersonne([c], lead({ telephone: '0612345678', contactNom: null, societe: null }))).toBeNull()
  })

  it('ne reconnaît personne quand le lead n’a ni e-mail ni téléphone', () => {
    const c = connue({ email: 'quelquun@example.fr', telephone: '0600000000' })
    expect(choisirLaMemePersonne([c], lead({}))).toBeNull()
  })

  it('ne reconnaît personne dans une liste vide', () => {
    expect(choisirLaMemePersonne([], lead({ email: 'a@b.fr' }))).toBeNull()
  })

  /* Un numéro trop court ne peut pas servir de preuve : « 0612 » collerait à des milliers de lignes. */
  it('ignore un téléphone trop court pour identifier quelqu’un', () => {
    const c = connue({ telephone: '0612', contact_nom: 'Jean Dupont' })
    expect(choisirLaMemePersonne([c], lead({ telephone: '0612', contactNom: 'Jean Dupont' }))).toBeNull()
  })

  /* L'ORDRE COMPTE : les candidats arrivent du plus ancien au plus récent, et c'est la piste
     d'origine qu'on veut garder, pas la plus fraîche. */
  it('rend le plus ancien candidat qui correspond', () => {
    const vieux = connue({ id: 'vieux', email: 'a@b.fr' })
    const recent = connue({ id: 'recent', email: 'a@b.fr' })
    expect(choisirLaMemePersonne([vieux, recent], lead({ email: 'a@b.fr' }))?.id).toBe('vieux')
  })
})
