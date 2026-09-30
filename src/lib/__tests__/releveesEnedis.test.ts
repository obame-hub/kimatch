import { describe, expect, it } from 'vitest'
import { releveesMensuelles } from '../../../api/enedis/_client'

/* Les périodes réellement reçues d'Enedis le 30/09/2026 (PDL 30000630420723, C4) : du 22 au 21,
   pas du 1er au 1er. « Attention aux demi-mois » — William. */
const m = (classe: string, debut: string, fin: string, valeurKwh: number, estimee = false) => ({ classe, debut, fin, valeurKwh, estimee })
const postes = ['HPH', 'HCH', 'HPE', 'HCE']
const periode = (debut: string, fin: string, kwh = 1000) => postes.map((p) => m(p, debut, fin, kwh))
const AUJ = '2026-09-30'

describe('releveesMensuelles', () => {
  it('range chaque période entière sous le mois de son milieu, avec ses vraies bornes', () => {
    const r = releveesMensuelles([
      ...periode('2026-08-22', '2026-09-21'), ...periode('2026-07-22', '2026-08-22'), ...periode('2026-02-19', '2026-03-22'),
    ], AUJ)
    expect(r).toEqual([
      { mois: '2026-03-01', debut: '2026-02-19', fin: '2026-03-22', mwh: 4, estimee: false },
      { mois: '2026-08-01', debut: '2026-07-22', fin: '2026-08-22', mwh: 4, estimee: false },
      { mois: '2026-09-01', debut: '2026-08-22', fin: '2026-09-21', mwh: 4, estimee: false },
    ])
  })

  it('écarte un demi-mois, une période trop longue et une période où un poste manque', () => {
    const r = releveesMensuelles([
      ...periode('2026-08-22', '2026-09-05'),
      ...periode('2026-05-22', '2026-07-22'),
      ...periode('2026-04-21', '2026-05-22').filter((x) => x.classe !== 'HCE'),
      ...periode('2026-03-22', '2026-04-21'),
    ], AUJ)
    expect(r.map((x) => x.debut)).toEqual(['2026-03-22'])
  })

  it('écarte un poste en double, et ne garde que les douze dernières périodes', () => {
    const doublon = [...periode('2026-06-21', '2026-07-22'), m('HPH', '2026-06-21', '2026-07-22', 500)]
    expect(releveesMensuelles(doublon, AUJ)).toEqual([])
    const treize: ReturnType<typeof periode> = []
    for (let i = 0; i < 13; i++) {
      const d = new Date(Date.UTC(2025, 8 + i, 22)).toISOString().slice(0, 10)
      const f = new Date(Date.UTC(2025, 9 + i, 21)).toISOString().slice(0, 10)
      treize.push(...periode(d, f))
    }
    expect(releveesMensuelles(treize, '2026-12-31').length).toBe(12)
  })

  it('ignore une période pas encore finie, et signale une valeur estimée', () => {
    const r = releveesMensuelles([...periode('2026-09-21', '2026-10-22'), m('HPH', '2026-08-22', '2026-09-21', 1000, true), ...periode('2026-08-22', '2026-09-21').slice(1)], AUJ)
    expect(r).toEqual([{ mois: '2026-09-01', debut: '2026-08-22', fin: '2026-09-21', mwh: 4, estimee: true }])
  })
})
