import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { amortir } from '@/lib/amortir'

/**
 * Ces trois cas ne sont pas décoratifs : `amortir` décide QUAND des requêtes partent vers Supabase
 * pendant un import en lot, c'est-à-dire au pire moment. Le troisième en particulier — l'échéance
 * ferme plutôt que repoussée — est un choix qu'un amortissement classique fait à l'envers, et
 * qu'une relecture distraite « corrigerait » en réintroduisant le défaut.
 */
describe('amortir', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('regroupe une rafale en un seul appel', () => {
    const action = vi.fn()
    const amortie = amortir(action, 400)

    // Mille insertions d'un import : mille événements.
    for (let i = 0; i < 1000; i += 1) amortie()
    expect(action).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("n'attend pas la fin de la rafale pour rafraîchir", () => {
    const action = vi.fn()
    const amortie = amortir(action, 400)

    // Un import qui dure : des événements sans interruption pendant 1,2 s.
    for (let t = 0; t < 1200; t += 50) {
      amortie()
      vi.advanceTimersByTime(50)
    }

    /* Trois rafraîchissements en 1,2 s, et non zéro. Un amortissement qui repousserait son
       échéance à chaque appel n'aurait rien affiché tant que l'import dure. */
    expect(action).toHaveBeenCalledTimes(3)
  })

  it('annuler empêche un appel après le démontage', () => {
    const action = vi.fn()
    const amortie = amortir(action, 400)

    amortie()
    amortie.annuler()
    vi.advanceTimersByTime(1000)

    // Sans cela, un composant démonté relancerait ses requêtes dans le vide.
    expect(action).not.toHaveBeenCalled()
  })
})
