import { describe, expect, it } from 'vitest'
import { scoreDesClauses } from '@/lib/offres/clauses'
import { rendreGabarit } from '@/lib/offrePdf/rendu'
import { ttcParDefaut } from '@/lib/offrePdf/construction'

/* Les scores des deux maquettes de Claude Design (« Offre B v3 » gaz, « Offre Electricite ») : si la
   règle dérive, c'est ici que ça casse. */
const sans = { depot_garantie: false, engagement_consommation: false, renegociation_anticipee: false, swap: false, tacite_reconduction: false }

describe('score des clauses — gaz', () => {
  /* Les clauses d'`offre-data.js` : [sécurisé, dépôt, engagement, renégociation, SWAP, tacite]. */
  const cas: [string, number[], number, string][] = [
    ['GME', [1, 0, 1, 1, 0, 0], 70, 'B'],
    ['TotalEnergies', [1, 0, 0, 1, 1, 1], 95, 'A'],
    ['Picoty', [0, 0, 0, 1, 1, 1], 65, 'C'],
    ['Gaz Européen', [1, 1, 0, 0, 0, 0], 45, 'D'],
    ['ENGIE', [1, 0, 1, 1, 1, 1], 85, 'A'],
  ]
  it.each(cas)('%s', (_f, [sec, depot, engagement, reneg, swap, tacite], score, note) => {
    const clauses = { depot_garantie: !!depot, engagement_consommation: !!engagement, renegociation_anticipee: !!reneg, swap: !!swap, tacite_reconduction: !!tacite }
    expect(scoreDesClauses(clauses, sec ? 'Fixe' : 'Indexé PEG', 'gaz')).toEqual({ score, note })
  })
  it('pénalise un prix non sécurisé et borne à 0', () => {
    expect(scoreDesClauses({ ...sans, depot_garantie: true, engagement_consommation: true, tacite_reconduction: true }, 'Indexé', 'gaz')).toEqual({ score: 0, note: 'E' })
  })
})

describe('score des clauses — électricité', () => {
  it('redonne les offres de la maquette', () => {
    expect(scoreDesClauses({ ...sans, tacite_reconduction: true }, 'Fixe', 'electricite')).toEqual({ score: 85, note: 'A' })
    expect(scoreDesClauses(sans, 'Fixe', 'electricite')).toEqual({ score: 95, note: 'A' })
    expect(scoreDesClauses({ ...sans, depot_garantie: true, tacite_reconduction: true }, 'Indexé', 'electricite')).toEqual({ score: 25, note: 'E' })
  })
})

describe('rendu des gabarits', () => {
  it('remplace, échappe, conditionne et répète, imbrications comprises', () => {
    const html = '<p>{{ a.b }}</p><sc-if value="{{ ok }}"><i>oui</i></sc-if><sc-if value="{{ non }}">X</sc-if>'
      + '<sc-for list="{{ l }}" as="o"><b>{{ o.n }}<sc-if value="{{ o.v }}">!</sc-if></b></sc-for>'
    expect(rendreGabarit(html, { a: { b: '<A & B>' }, ok: true, non: false, l: [{ n: 1, v: true }, { n: 2, v: false }] }))
      .toBe('<p>&lt;A &amp; B&gt;</p><i>oui</i><b>1!</b><b>2</b>')
  })
  it('lit la portée englobante dans une boucle', () => {
    expect(rendreGabarit('<sc-for list="{{ l }}" as="x">{{ x }}{{ s }}</sc-for>', { l: ['a', 'b'], s: '·' })).toBe('a·b·')
  })
})

describe('présentation par défaut', () => {
  it('TTC pour un syndic, HTVA pour une entreprise', () => {
    expect(ttcParDefaut('Syndic professionnel')).toBe(true)
    expect(ttcParDefaut('Syndic non professionnel')).toBe(true)
    expect(ttcParDefaut('Entreprise')).toBe(false)
    expect(ttcParDefaut(null)).toBe(false)
  })
})
