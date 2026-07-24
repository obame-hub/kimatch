import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const THEME_KEY = 'kiwee-theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme,
  )

  useEffect(() => {
    if (theme !== 'system') {
      setResolvedTheme(theme)
      return
    }
    setResolvedTheme(systemPrefersDark() ? 'dark' : 'light')
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  function setTheme(next: Theme) {
    setThemeState(next)
    localStorage.setItem(THEME_KEY, next)
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
