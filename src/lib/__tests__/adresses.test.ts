import { describe, expect, it } from 'vitest'
import { adressesDe, insererAdresse, jetonAuCurseur, nettoyerAdresses, suggestions } from '@/lib/adresses'

/**
 * ══ LES CHAMPS D'ADRESSE QUI CONNAISSENT L'ÉQUIPE ══
 *
 * William, 28/09/2026 : « si je tape marie, on me propose directement le mail de Marie THONNARD ».
 * Ce qui se teste ici, c'est ce qui peut abîmer une liste d'adresses sans que personne le voie.
 */
const EQUIPE = [
  { id: '1', prenom: 'Marie', nom: 'Thonnard', email: 'm.thonnard@kiwee-energie.fr' },
  { id: '2', prenom: 'Matthieu', nom: 'Bruere', email: 'm.bruere@kiwee-energie.fr' },
  { id: '3', prenom: 'Michel', nom: 'OBAME', email: 'obame@kiwee-energie.fr' },
  { id: '4', prenom: 'Naoëlle', nom: 'GHOUMA', email: 'n.ghouma@kiwee-energie.fr' },
  { id: '5', prenom: 'Thomas', nom: 'Le Guen', email: 't.leguen@kiwee-energie.fr' },
]

describe('suggestions', () => {
  it('« marie » propose Marie Thonnard', () => {
    expect(suggestions(EQUIPE, 'marie', []).map((p) => p.prenom)).toEqual(['Marie'])
  })

  it('le nom de famille, et sans accent, suffit', () => {
    expect(suggestions(EQUIPE, 'thon', []).map((p) => p.prenom)).toEqual(['Marie'])
    expect(suggestions(EQUIPE, 'naoelle', []).map((p) => p.prenom)).toEqual(['Naoëlle'])
    expect(suggestions(EQUIPE, 'guen', []).map((p) => p.prenom)).toEqual(['Thomas'])
  })

  it('l’adresse aussi : « obame » trouve Michel', () => {
    expect(suggestions(EQUIPE, 'obame', []).map((p) => p.prenom)).toEqual(['Michel'])
  })

  it('par le début des mots seulement : « rie » ne trouve pas Marie', () => {
    expect(suggestions(EQUIPE, 'rie', [])).toEqual([])
  })

  it('rien sous deux lettres', () => {
    expect(suggestions(EQUIPE, 'm', [])).toEqual([])
  })

  it('les prénoms qui commencent par la frappe passent devant', () => {
    // « ma » : Marie et Matthieu par le prénom, les autres « m. » de l'adresse après.
    const n = suggestions(EQUIPE, 'ma', []).map((p) => p.prenom)
    expect(n.slice(0, 2).sort()).toEqual(['Marie', 'Matthieu'])
  })

  it('ne repropose pas une adresse déjà dans le champ', () => {
    expect(suggestions(EQUIPE, 'ma', ['m.thonnard@kiwee-energie.fr']).map((p) => p.prenom)).toEqual(['Matthieu'])
  })
})

describe('jetonAuCurseur et insererAdresse', () => {
  it('complète le morceau en cours, et prépare le suivant', () => {
    const r = insererAdresse('marie', 5, 'm.thonnard@kiwee-energie.fr')
    expect(r.valeur).toBe('m.thonnard@kiwee-energie.fr, ')
    expect(r.curseur).toBe(r.valeur.length)
  })

  it('en fin de liste, garde ce qui précède', () => {
    const avant = 'client@syndic.fr, mat'
    const r = insererAdresse(avant, avant.length, 'm.bruere@kiwee-energie.fr')
    expect(r.valeur).toBe('client@syndic.fr, m.bruere@kiwee-energie.fr, ')
  })

  it('au milieu d’une liste, ne remplace que le morceau sous le curseur', () => {
    const valeur = 'a@x.fr, thom, b@y.fr'
    const curseur = valeur.indexOf('thom') + 4
    expect(jetonAuCurseur(valeur, curseur).texte).toBe('thom')
    expect(insererAdresse(valeur, curseur, 't.leguen@kiwee-energie.fr').valeur).toBe('a@x.fr, t.leguen@kiwee-energie.fr, b@y.fr')
  })

  it('reconnaît aussi le point-virgule comme séparateur', () => {
    expect(jetonAuCurseur('a@x.fr; mar', 11).texte).toBe('mar')
    expect(adressesDe('a@x.fr; B@Y.fr ,')).toEqual(['a@x.fr', 'b@y.fr'])
  })
})

describe('nettoyerAdresses', () => {
  it('retire la virgule finale, les entrées vides et les espaces', () => {
    expect(nettoyerAdresses('m.thonnard@kiwee-energie.fr, ')).toBe('m.thonnard@kiwee-energie.fr')
    expect(nettoyerAdresses(' a@x.fr ;; b@y.fr ,, ')).toBe('a@x.fr, b@y.fr')
  })

  it('un champ vide reste vide', () => {
    expect(nettoyerAdresses('')).toBe('')
    expect(nettoyerAdresses(null)).toBe('')
    expect(nettoyerAdresses(' , ')).toBe('')
  })
})
