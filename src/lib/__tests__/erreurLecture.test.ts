/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE LECTURE RATÉE DOIT REMONTER, ET NON SE DÉGUISER EN LISTE VIDE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ce que ces tests verrouillent tient en une phrase : `relancer()` LÈVE. C'est la seule propriété
 * dont dépend tout l'affichage d'erreur — si elle rendait quoi que ce soit au lieu de lever, React
 * Query croirait la lecture réussie, `isError` resterait faux, et l'écran réafficherait « Aucune
 * piste » en pleine panne. C'est exactement le défaut qu'on vient de corriger dans vingt-trois
 * modules de `src/lib/data`.
 *
 * ── POURQUOI CE TEST EXISTE, ALORS QUE LE CODE « A L'AIR » ÉVIDENT ──
 *
 * Parce que la signature `never` de TypeScript ne garantit RIEN à l'exécution : c'est une promesse
 * du compilateur, pas un contrôle. Un `return` ajouté par mégarde dans le `catch`, ou un `throw`
 * remplacé un jour par un `console.error` « pour ne pas casser la prod », passerait le typage et
 * ramènerait le bug en silence — sans qu'aucun écran ne le signale, puisque le symptôme EST le
 * silence.
 *
 * ── CE QU'ON NE TESTE PAS ICI, ET POURQUOI ──
 *
 * Pas de rendu React, pas de React Query. L'enchaînement `relancer → isError → ListeEnEchec` se
 * vérifie à l'écran, pas en test : c'est la leçon de « aucunes pistes », faute d'accord trouvée par
 * une capture alors que le build, les tests et le lint étaient verts. On verrouille ici la brique
 * qui, elle, se prouve en mémoire.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ErreurDeLecture, relancer } from '@/lib/data/erreurLecture'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('relancer', () => {
  it('lève toujours, au lieu de rendre une valeur', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => relancer('usePistes', new Error('Failed to fetch'))).toThrow()
  })

  it('lève une ErreurDeLecture, que l’écran peut reconnaître', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      relancer('usePistes', new Error('Failed to fetch'))
      expect.unreachable('relancer aurait dû lever')
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurDeLecture)
      expect(e).toBeInstanceOf(Error)
    }
  })

  /* LE NOM DE LA LECTURE EST DANS LE MESSAGE : sans lui, « TypeError: Failed to fetch » ne dit pas
     quel écran a échoué, et c'est la première question qu'on se pose devant un rapport. */
  it('nomme la lecture ET garde le détail d’origine', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      relancer('useOpportunites', new Error('Failed to fetch'))
      expect.unreachable('relancer aurait dû lever')
    } catch (e) {
      const err = e as ErreurDeLecture
      expect(err.message).toContain('useOpportunites')
      expect(err.message).toContain('Failed to fetch')
      expect(err.lecture).toBe('useOpportunites')
    }
  })

  /* SUPABASE NE LÈVE PAS TOUJOURS DES `Error` : il rend souvent un objet `{ message, code }`. Le
     message doit rester lisible dans ce cas, sinon on affiche « [object Object] » à l'écran. */
  it('reste lisible quand la cause n’est pas une Error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      relancer('useContacts', { message: 'column does not exist', code: '42703' })
      expect.unreachable('relancer aurait dû lever')
    } catch (e) {
      const err = e as ErreurDeLecture
      expect(err.message).toContain('useContacts')
      expect(err.message).not.toContain('[object Object]')
    }
  })

  /* L'ORIGINE EST GARDÉE TELLE QUELLE : c'est elle qui porte le code PostgREST, et c'est par lui
     qu'on distingue un droit refusé d'une colonne disparue. */
  it('garde l’erreur d’origine intacte pour le débogage', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const origine = { message: 'permission denied', code: '42501' }
    try {
      relancer('useCompteurs', origine)
      expect.unreachable('relancer aurait dû lever')
    } catch (e) {
      expect((e as ErreurDeLecture).origine).toBe(origine)
    }
  })

  /* ON JOURNALISE AUSSI : la console garde la trace complète pour qui débogue, pendant que l'écran
     reçoit de quoi afficher un message à qui travaille. Les deux, pas l'un ou l'autre. */
  it('journalise en console avant de lever', () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => relancer('useSites', new Error('boom'))).toThrow()
    expect(journal).toHaveBeenCalledOnce()
  })
})
