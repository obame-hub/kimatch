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

  const commit = useCallback(async () => {
    if (committingRef.current) return
    if (isEqual(draft, value)) {
      setEditing(false)
      return
    }
    committingRef.current = true
    setPending(true)
    setOptimisticValue(draft)
    setEditing(false)
    try {
      await onCommit(draft)
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
