import { useCallback, useRef, useState } from 'react'

interface UseInlineEditOptions<T> {
  /** Valeur confirmée (celle qui vient des données réelles, pas du brouillon local). */
  value: T
  /** Persiste la nouvelle valeur (appelle la mutation existante de l'entité). */
  onCommit: (value: T) => Promise<void>
  onSaved?: () => void
  onError?: (error: Error) => void
  /** Ne rien enregistrer si la valeur n'a pas changé (comparaison simple). */
  isEqual?: (a: T, b: T) => boolean
}

/**
 * Édition inline générique : clic -> édition, Entrée valide, Échap annule, blur valide.
 * Optimiste au niveau du champ : `displayValue` reflète immédiatement la saisie pendant
 * la requête, puis revient à `value` (source de vérité) une fois la requête résolue —
 * ou à l'ancienne valeur si elle échoue (rollback), avec le message d'erreur exposé.
 */
export function useInlineEdit<T>({ value, onCommit, onSaved, onError, isEqual = (a, b) => a === b }: UseInlineEditOptions<T>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<T>(value)
  const [pending, setPending] = useState(false)
  const [optimisticValue, setOptimisticValue] = useState<T | null>(null)
  const committingRef = useRef(false)

  const start = useCallback(() => {
    setDraft(value)
    setEditing(true)
  }, [value])

  const cancel = useCallback(() => {
    setEditing(false)
    setDraft(value)
  }, [value])

  /**
   * Enregistre le brouillon — ou la valeur passée en argument.
   *
   * L'ARGUMENT EXISTE POUR LES CHOIX DISCRETS. Un champ texte se valide après la frappe, donc l'état
   * `draft` est à jour quand on valide. Un `<select>`, lui, doit enregistrer AU MOMENT du choix : si
   * on appelle `commit()` dans le même `onChange` que `setDraft(v)`, React n'a pas encore appliqué
   * l'état et `commit` enregistrerait l'ancienne valeur. Passer la valeur explicitement lève
   * l'ambiguïté sans attendre un rendu.
   */
  const commit = useCallback(async (valeurExplicite?: T) => {
    if (committingRef.current) return
    const aEcrire = valeurExplicite !== undefined ? valeurExplicite : draft
    if (isEqual(aEcrire, value)) {
      setEditing(false)
      return
    }
    committingRef.current = true
    setPending(true)
    setOptimisticValue(aEcrire)
    setEditing(false)
    try {
      await onCommit(aEcrire)
      onSaved?.()
      setOptimisticValue(null)
    } catch (err) {
      setOptimisticValue(null)
      onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setPending(false)
      committingRef.current = false
    }
  }, [draft, value, onCommit, onSaved, onError, isEqual])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  return {
    editing,
    draft,
    setDraft,
    pending,
    /** Valeur à afficher : optimiste pendant la requête, sinon la vraie valeur. */
    displayValue: optimisticValue ?? value,
    start,
    cancel,
    commit,
    handleKeyDown,
  }
}
