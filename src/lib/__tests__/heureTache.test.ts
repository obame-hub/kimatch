import { describe, it, expect } from 'vitest'
import { estEnRetard, heureDe, instantTache, jourLocalISO } from '../heureTache'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ALLER-RETOUR D'UNE ÉCHÉANCE, QUI S'EST CASSÉ EN SILENCE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « j'ai modifié la date au 18/09 mais quand je demande de remodifier c'est la
 * date du 17/09 qui est enregistrée ».
 *
 * Le défaut ne vivait dans aucune des deux fonctions — chacune était juste de son côté. Il vivait
 * dans le fait que l'écran ÉCRIVAIT avec l'une et LISAIT sans l'autre. C'est exactement ce qu'un
 * test unitaire sur une fonction isolée ne voit pas, et ce que celui-ci épingle : la boucle
 * complète, saisie → base → saisie.
 *
 * LES TESTS TOURNENT DANS LE FUSEAU DE LA MACHINE. Ils sont donc écrits pour être vrais partout :
 * on ne compare jamais à une chaîne UTC en dur, on vérifie que ce qu'on a tapé est ce qu'on relit.
 * C'est d'ailleurs la propriété qui compte pour l'équipe — « ce que le commercial tape est ce qu'il
 * lira, où qu'il soit ».
 */
describe('l’aller-retour d’une échéance', () => {
  it('rend le jour qu’on a saisi, sans heure', () => {
    // Le cas de la capture : 18/09, aucune heure.
    const stocke = instantTache('2026-09-18', null)
    expect(jourLocalISO(stocke)).toBe('2026-09-18')
    expect(heureDe(stocke)).toBeNull()
  })

  it('rend le jour ET l’heure qu’on a saisis', () => {
    const stocke = instantTache('2026-09-18', '09:30')
    expect(jourLocalISO(stocke)).toBe('2026-09-18')
    expect(heureDe(stocke)).toBe('09:30')
  })

  it('tient sur douze mois, changements d’heure compris', () => {
    for (let mois = 1; mois <= 12; mois += 1) {
      const jour = `2026-${String(mois).padStart(2, '0')}-18`
      expect(jourLocalISO(instantTache(jour, null))).toBe(jour)
    }
  })

  /* LE DÉFAUT LUI-MÊME, ÉPINGLÉ. `slice(0, 10)` est ce que faisait le panneau d'édition : sur un
     fuseau à l'est de Greenwich — celui de l'équipe — il rend la veille pour toute échéance sans
     heure. On ne teste pas qu'il se trompe (ce serait faux à Londres), on teste que `jourLocalISO`
     ne s'aligne PAS dessus quand les deux diffèrent. */
  it('ne se laisse pas ramener au jour UTC', () => {
    const stocke = instantTache('2026-09-18', null) as string
    if (stocke.slice(0, 10) !== '2026-09-18') {
      expect(jourLocalISO(stocke)).not.toBe(stocke.slice(0, 10))
    }
    expect(jourLocalISO(stocke)).toBe('2026-09-18')
  })

  it('une échéance vide reste vide', () => {
    expect(instantTache(null)).toBeNull()
    expect(instantTache('')).toBeNull()
    expect(jourLocalISO(null)).toBeNull()
    expect(heureDe(null)).toBeNull()
  })
})

describe('estEnRetard', () => {
  const le18 = new Date(instantTache('2026-09-18', '10:00') as string)

  it('une tâche due aujourd’hui n’est pas en retard', () => {
    // Le cœur du défaut : saisie sans heure, elle se lisait « hier » et passait en retard le jour
    // même où elle est à faire.
    expect(estEnRetard(instantTache('2026-09-18', null), le18)).toBe(false)
  })

  it('une tâche due aujourd’hui à 9 h 30 n’est pas en retard à 10 h', () => {
    expect(estEnRetard(instantTache('2026-09-18', '09:30'), le18)).toBe(false)
  })

  it('une tâche d’hier est en retard', () => {
    expect(estEnRetard(instantTache('2026-09-17', null), le18)).toBe(true)
  })

  it('une tâche de demain ne l’est pas', () => {
    expect(estEnRetard(instantTache('2026-09-19', null), le18)).toBe(false)
  })

  it('sans échéance, rien n’est en retard', () => {
    expect(estEnRetard(null, le18)).toBe(false)
    expect(estEnRetard(undefined, le18)).toBe(false)
  })
})
