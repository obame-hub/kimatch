import { describe, expect, it } from 'vitest'
import { estJourOuvreFR, joursFeriesFR, nomJourFerieFR } from '@/lib/joursFeries'

/**
 * Les fériés décident du silence de Kimatch : un jour compté à tort réclame une relance chez un
 * fournisseur fermé, et une date de réception posée un 15 août rend la demande intenable — c'est
 * l'argument de William en réunion, et celui qui a fait écrire ce module.
 *
 * IL N'AVAIT AUCUN TEST. Il calcule Pâques, donc trois fériés sur onze bougent chaque année : une
 * erreur d'algorithme ne se verrait qu'un jour de printemps, sur une relance qui n'arrive pas.
 */
const jour = (a: number, m: number, j: number) => new Date(a, m - 1, j)

describe('les fériés mobiles suivent Pâques', () => {
  it('place les trois fériés de 2026 — Pâques le 5 avril', () => {
    expect(nomJourFerieFR(jour(2026, 4, 6))).toBe('Lundi de Pâques')
    expect(nomJourFerieFR(jour(2026, 5, 14))).toBe('Ascension')
    expect(nomJourFerieFR(jour(2026, 5, 25))).toBe('Lundi de Pentecôte')
  })

  it('les replace sur d’autres années', () => {
    // Pâques 2025 : 20 avril. Pâques 2027 : 28 mars.
    expect(nomJourFerieFR(jour(2025, 4, 21))).toBe('Lundi de Pâques')
    expect(nomJourFerieFR(jour(2027, 3, 29))).toBe('Lundi de Pâques')
    expect(nomJourFerieFR(jour(2027, 5, 6))).toBe('Ascension')
  })
})

describe('les fériés fixes', () => {
  it('sont les huit attendus', () => {
    const attendus: [number, number, string][] = [
      [1, 1, "Jour de l'an"], [5, 1, 'Fête du travail'], [5, 8, 'Victoire 1945'],
      [7, 14, 'Fête nationale'], [8, 15, 'Assomption'], [11, 1, 'Toussaint'],
      [11, 11, 'Armistice 1918'], [12, 25, 'Noël'],
    ]
    for (const [m, j, nom] of attendus) expect(nomJourFerieFR(jour(2026, m, j))).toBe(nom)
  })

  it('font onze jours en tout, et pas un de plus', () => {
    expect(joursFeriesFR(2026).size).toBe(11)
    // Le Vendredi saint et le 26 décembre ne sont fériés qu'en Alsace-Moselle : absents, volontairement.
    expect(nomJourFerieFR(jour(2026, 4, 3))).toBeNull()
    expect(nomJourFerieFR(jour(2026, 12, 26))).toBeNull()
  })
})

describe('estJourOuvreFR', () => {
  it('écarte le week-end', () => {
    expect(estJourOuvreFR(jour(2026, 9, 19))).toBe(false)
    expect(estJourOuvreFR(jour(2026, 9, 20))).toBe(false)
  })
  it('écarte un férié tombant en semaine', () => {
    expect(estJourOuvreFR(jour(2026, 5, 1))).toBe(false)
  })
  it('garde un jour ordinaire', () => {
    expect(estJourOuvreFR(jour(2026, 9, 18))).toBe(true)
  })
})
