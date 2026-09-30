import { describe, expect, it } from 'vitest'
import { moisComplets } from '../../../api/enedis/_client'

/* « Attention aux demi-mois ou autre ce qui pourrait nuire à la santé de la data » — William, 30/09/2026. */
const m = (classe: string, debut: string, fin: string, valeurKwh: number, estimee = false) => ({ classe, debut, fin, valeurKwh, estimee })
const fenetre = new Set(['2026-06', '2026-07', '2026-08'])

describe('moisComplets', () => {
  it('additionne les postes d’un mois entier, borne de fin exclusive ou inclusive', () => {
    const r = moisComplets([
      m('HP', '2026-06-01', '2026-07-01', 3000), m('HC', '2026-06-01', '2026-07-01', 1000),
      m('HP', '2026-07-01', '2026-07-31', 2000), m('HC', '2026-07-01', '2026-07-31', 500),
    ], fenetre)
    expect(r).toEqual([
      { mois: '2026-06-01', mwh: 4, estimee: false },
      { mois: '2026-07-01', mwh: 2.5, estimee: false },
    ])
  })

  it('écarte un demi-mois, même si l’autre moitié est là', () => {
    const r = moisComplets([
      m('BASE', '2026-06-01', '2026-06-15', 800), m('BASE', '2026-06-15', '2026-07-01', 900),
      m('BASE', '2026-07-01', '2026-08-01', 1500),
    ], fenetre)
    expect(r.map((x) => x.mois)).toEqual(['2026-07-01'])
  })

  it('écarte un mois où un poste manque, et une période à cheval sur deux mois', () => {
    const r = moisComplets([
      m('HP', '2026-06-01', '2026-07-01', 3000), m('HC', '2026-07-01', '2026-08-01', 1000),
      m('HP', '2026-07-01', '2026-08-01', 3000),
      m('HP', '2026-08-01', '2026-09-15', 4000), m('HC', '2026-08-01', '2026-09-01', 1000),
    ], fenetre)
    expect(r.map((x) => x.mois)).toEqual(['2026-07-01'])
  })

  it('signale un mois estimé, et ignore ce qui sort de la fenêtre', () => {
    const r = moisComplets([
      m('BASE', '2026-06-01', '2026-07-01', 1000, true), m('BASE', '2025-01-01', '2025-02-01', 1000),
    ], fenetre)
    expect(r).toEqual([{ mois: '2026-06-01', mwh: 1, estimee: true }])
  })
})
