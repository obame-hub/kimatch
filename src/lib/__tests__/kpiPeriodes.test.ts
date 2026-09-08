import { describe, it, expect, afterEach, vi } from 'vitest'
import { PERIODES } from '@/lib/data/kpiAllo'

/**
 * LES BORNES DES PÉRIODES NOMMÉES, ÉPINGLÉES.
 *
 * Deux choses cassent en silence dans ce genre de calcul, et aucune ne se voit à l'écran le jour où
 * on l'écrit :
 *
 *   · LA SEMAINE COMMENCE LUNDI. `getDay()` rend 0 pour DIMANCHE : une soustraction naïve fait
 *     commencer la semaine la veille, et le dimanche elle deviendrait une semaine entière à venir.
 *     Le test se place donc un dimanche, le seul jour où l'erreur apparaît.
 *   · LA DATE EST LOCALE. `toISOString()` recule d'un jour en soirée à Paris. Un test le 1er du
 *     mois à 23 h attrape la régression.
 */
const bornes = (cle: string) => PERIODES.find((p) => p.cle === cle)!.bornes()

afterEach(() => {
  vi.useRealTimers()
})

/** Fige l'horloge à un instant LOCAL, celui que verrait quelqu'un devant son écran. */
function figerLe(annee: number, mois: number, jour: number, heure: number, minute = 0) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(annee, mois - 1, jour, heure, minute))
}

describe('PERIODES', () => {
  it('un dimanche, « cette semaine » part du lundi précédent et non du jour même', () => {
    // Dimanche 13 septembre 2026. Le lundi de cette semaine est le 7.
    figerLe(2026, 9, 13, 15)
    expect(bornes('semaine')).toEqual({ du: '2026-09-07', au: '2026-09-13' })
  })

  it('un lundi, « cette semaine » commence le jour même', () => {
    figerLe(2026, 9, 7, 9)
    expect(bornes('semaine')).toEqual({ du: '2026-09-07', au: '2026-09-07' })
  })

  it('« cette semaine » traverse un changement de mois', () => {
    // Mercredi 2 septembre 2026 : le lundi est le 31 août.
    figerLe(2026, 9, 2, 11)
    expect(bornes('semaine')).toEqual({ du: '2026-08-31', au: '2026-09-02' })
  })

  it('« aujourd’hui » reste le jour local même tard le soir', () => {
    // 23 h 30 heure locale : `toISOString()` serait déjà le lendemain en été à Paris.
    figerLe(2026, 9, 8, 23, 30)
    expect(bornes('aujourdhui')).toEqual({ du: '2026-09-08', au: '2026-09-08' })
  })

  it('« hier » recule d’un jour, y compris au premier du mois', () => {
    figerLe(2026, 9, 1, 8)
    expect(bornes('hier')).toEqual({ du: '2026-08-31', au: '2026-08-31' })
  })

  it('« ce mois » part du premier et s’arrête aujourd’hui', () => {
    figerLe(2026, 9, 8, 19)
    expect(bornes('mois')).toEqual({ du: '2026-09-01', au: '2026-09-08' })
  })

  it('« cette année » part du 1er janvier', () => {
    figerLe(2026, 9, 8, 19)
    expect(bornes('annee')).toEqual({ du: '2026-01-01', au: '2026-09-08' })
  })

  it('aucune période ne se termine dans le futur — ce sont des appels déjà passés', () => {
    figerLe(2026, 9, 8, 19)
    const aujourdhui = '2026-09-08'
    for (const p of PERIODES) {
      const { du, au } = p.bornes()
      expect(au <= aujourdhui, `${p.cle} finit après aujourd’hui`).toBe(true)
      expect(du <= au, `${p.cle} a des bornes inversées`).toBe(true)
    }
  })
})
