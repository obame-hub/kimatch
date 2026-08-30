import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { viderCacheAcces } from '@/lib/data/roles'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Le rôle, les permissions et le périmètre de comptes visibles sont mis en cache pour la
      // session (voir `fetchCurrentAccess`). Les vider à CHAQUE bascule est indispensable :
      // sans cela, l'utilisateur suivant hériterait des droits du précédent.
      viderCacheAcces()
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        // DEMANDER UN LIEN NE DOIT PAS OUVRIR UN COMPTE.
        //
        // `signInWithOtp` crée l'utilisateur par défaut quand l'adresse est inconnue. Le projet
        // Supabase acceptant les inscriptions, n'importe quelle adresse tapée dans ce champ
        // recevait un lien, devenait un utilisateur authentifié — et le déclencheur
        // handle_new_user lui donnait aussitôt un profil actif avec le rôle CONSEILLER. Les
        // politiques RLS étant ouvertes à tout utilisateur authentifié, la personne voyait ensuite
        // l'ensemble des clients, des contrats et des échanges. Connaître l'adresse de Kimatch
        // suffisait pour entrer.
        //
        // Ce réglage-ci ferme la porte de NOTRE écran. Il ne suffit pas à lui seul : quelqu'un qui
        // appelle directement l'API d'authentification ne passe pas par ce code. Les deux autres
        // verrous sont les inscriptions à couper dans le tableau de bord Supabase, et le
        // déclencheur de la migration 20260830130000 qui refuse en base toute adresse absente des
        // accès autorisés.
        shouldCreateUser: false,
      },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signInWithMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
