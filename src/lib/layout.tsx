import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface SidebarContextValue {
  open: boolean
  toggle: () => void
  close: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

/**
 * ══ LA VALEUR ET SES DEUX FONCTIONS SONT STABLES ══
 *
 * Audit du 13/09/2026, constat FRT-03. Trois choses étaient reconstruites à chaque rendu : l'objet
 * de contexte, `toggle` et `close`. Comme ce provider enveloppe tout `AppLayout`, TOUS ses
 * consommateurs se re-rendaient à chaque fois — et il n'existe aucun `React.memo` dans le projet
 * pour amortir la chute (constat FRT-02).
 *
 * Le coût était modéré ici, parce que ce provider ne porte qu'un booléen et ne change qu'à
 * l'ouverture du menu. Mais c'est un motif qui se recopie : le corriger là où il est visible évite
 * qu'il se propage au prochain contexte écrit sur ce modèle.
 *
 * `setOpen` est garanti stable par React, donc les deux `useCallback` ont un tableau de
 * dépendances VIDE — et non `[setOpen]`, qui laisserait croire que la stabilité vient de nous.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const close = useCallback(() => setOpen(false), [])

  const valeur = useMemo(() => ({ open, toggle, close }), [open, toggle, close])

  return <SidebarContext.Provider value={valeur}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider')
  return ctx
}
