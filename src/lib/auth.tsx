import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

const DEMO_BYPASS_KEY = 'kiwee-demo-bypass'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  demoMode: boolean
  demoBypass: boolean
  enterDemoMode: () => void
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoBypass, setDemoBypass] = useState(() => sessionStorage.getItem(DEMO_BYPASS_KEY) === '1')

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  function enterDemoMode() {
    sessionStorage.setItem(DEMO_BYPASS_KEY, '1')
    setDemoBypass(true)
  }

  async function signInWithPassword(email: string, password: string) {
    if (!isSupabaseConfigured) {
      enterDemoMode()
      return { error: null }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    sessionStorage.removeItem(DEMO_BYPASS_KEY)
    setDemoBypass(false)
    if (!isSupabaseConfigured) return
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        demoMode: !isSupabaseConfigured || demoBypass,
        demoBypass,
        enterDemoMode,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
