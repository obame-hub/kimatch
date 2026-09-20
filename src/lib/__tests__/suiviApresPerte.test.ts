import { describe, it, expect } from 'vitest'
import { echeanceDansLAnnee } from '@/lib/data/recommandations'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SUIVRE LE CLIENT APRÈS UNE CLÔTURE PERDUE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La règle de Michel (20/09/2026) tient en une phrase — une opportunité naît si l'échéance tombe
 * dans les douze mois — et c'est exactement le genre de phrase qui se reperd. Ces tests la fixent.
 *
 * Le second groupe verrouille un défaut TROUVÉ EN BASE le même jour, sur un jeu d'essai : la
 * comparaison entre l'échéance saisie à l'écran (« 2026-12-18 ») et celle lue en base (un
 * timestamp, « 2026-12-18T23:00:00.000Z ») les déclarait toujours différentes. L'échéance était
 * donc réécrite à l'identique, et `date_echeance_precedente` recopiait la valeur courante — la
 * vraie valeur d'avant aurait été effacée dès la première clôture, silencieusement.
 */

/** La comparaison telle qu'elle est faite dans `appliquerSuiviApresPerte`. */
const jour = (v: string | null) => (v ? String(v).slice(0, 10) : null)

describe('la règle des douze mois', () => {
  const dansNJours = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  it('crée pour une échéance proche', () => {
    expect(echeanceDansLAnnee(dansNJours(30))).toBe(true)
  })

  it('crée pour une échéance à onze mois', () => {
    expect(echeanceDansLAnnee(dansNJours(330))).toBe(true)
  })

  it('ne crée pas au-delà d’un an', () => {
    expect(echeanceDansLAnnee(dansNJours(400))).toBe(false)
  })

  it('ne crée pas pour une échéance à trois ans — le client a signé ailleurs pour longtemps', () => {
    expect(echeanceDansLAnnee(dansNJours(1095))).toBe(false)
  })

  it('accepte une échéance déjà passée : un contrat échu est la plus urgente des relances', () => {
    expect(echeanceDansLAnnee(dansNJours(-10))).toBe(true)
  })
})

describe('la trace de l’échéance précédente', () => {
  it('reconnaît comme identiques un timestamp base et la date saisie du même jour', () => {
    expect(jour('2026-12-18T23:00:00.000Z')).toBe('2026-12-18')
  })

  it('ne déclenche aucune réécriture quand le commercial resaisit la même date', () => {
    const enBase = '2026-12-18T23:00:00.000Z'
    const saisie = '2026-12-18'
    expect(saisie !== jour(enBase)).toBe(false)
  })

  it('déclenche la réécriture quand la date change vraiment', () => {
    const enBase = '2026-12-18T23:00:00.000Z'
    const saisie = '2027-06-30'
    expect(saisie !== jour(enBase)).toBe(true)
  })

  it('rend null pour un compteur sans échéance, plutôt qu’une chaîne vide', () => {
    expect(jour(null)).toBeNull()
  })
})
