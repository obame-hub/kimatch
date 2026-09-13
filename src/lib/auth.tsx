import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { viderCacheAcces } from '@/lib/data/roles'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { signalerErreur } from '@/lib/signalerErreur'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  /**
   * Renseigné quand la session n'a PAS PU ÊTRE LUE — réseau coupé, Supabase indisponible, jeton
   * illisible. À ne pas confondre avec « pas de session », qui est un état normal et se lit
   * `session === null` : ici, on ne sait pas.
   */
  erreurSession: string | null
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreurSession, setErreurSession] = useState<string | null>(null)

  useEffect(() => {
    /* ══ LA LECTURE DE SESSION NE PEUT PLUS BLOQUER L'APPLICATION POUR TOUJOURS ══
     *
     * Audit du 13/09/2026, constat ERR-03. Cet appel n'avait ni `.catch()`, ni délai de garde. Si
     * la promesse était rejetée — réseau coupé au démarrage, Supabase indisponible, jeton corrompu
     * dans le stockage local — `setLoading(false)` n'était jamais atteint, `loading` restait à
     * `true`, et `ProtectedRoute` affichait « Chargement… » INDÉFINIMENT. Aucune sortie, aucun
     * message, aucun bouton.
     *
     * C'est exactement ce qui s'est produit le 10/09/2026, décrit dans `scripts/sonder-la-base.cjs`
     * — « toute l'équipe à l'arrêt : l'application ne répondait plus, l'auth non plus ».
     *
     * LE DÉLAI DE GARDE EST LÀ POUR LE CAS QUI NE LÈVE RIEN. Une promesse peut ne jamais se
     * résoudre du tout : requête partie et perdue, réseau qui accepte puis ne répond plus. Un
     * `.catch()` ne voit rien de ce cas-là, et c'est le plus fréquent sur un réseau instable —
     * changement de wifi, ascenseur, 4G qui décroche. Dix secondes : bien au-delà du temps normal
     * de cette lecture (moins d'une seconde), assez court pour ne pas laisser croire à une panne.
     */
    let regle = false
    const terminer = (erreur: string | null) => {
      if (regle) return
      regle = true
      setErreurSession(erreur)
      setLoading(false)
    }

    const garde = setTimeout(() => {
      terminer('La connexion au serveur n’a pas répondu.')
    }, 10_000)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
        terminer(null)
      })
      .catch((erreur: unknown) => {
        signalerErreur(erreur, { ou: 'AuthProvider', quoi: 'lecture de la session au démarrage' })
        terminer(erreur instanceof Error ? erreur.message : 'La session n’a pas pu être lue.')
      })
      .finally(() => clearTimeout(garde))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Le rôle, les permissions et le périmètre de comptes visibles sont mis en cache pour la
      // session (voir `fetchCurrentAccess`). Les vider à CHAQUE bascule est indispensable :
      // sans cela, l'utilisateur suivant hériterait des droits du précédent.
      viderCacheAcces()
      setSession(newSession)
      /* Une bascule d'authentification prouve que le serveur répond : si l'on affichait une erreur
         de lecture, elle n'a plus lieu d'être. Sans ces deux lignes, l'écran de repli resterait
         après une reconnexion réussie.

         ON N'APPELLE PAS `terminer` : sa garde `regle` a déjà joué au premier passage, et c'est
         bien ce qu'on veut pour la course entre la lecture et le délai de garde. Ici on veut
         l'inverse — pouvoir revenir en arrière, autant de fois que l'authentification rebascule. */
      setErreurSession(null)
      setLoading(false)
    })
    return () => {
      clearTimeout(garde)
      listener.subscription.unsubscribe()
    }
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

  /* ══ LA VALEUR EST MÉMORISÉE ══
   *
   * Audit du 13/09/2026, constat FRT-03. L'objet était reconstruit à chaque rendu du provider :
   * tous ses consommateurs — dont `Sidebar` et `ProtectedRoute`, montés en permanence — se
   * re-rendaient à chaque fois, même quand ni la session ni l'état de chargement n'avaient bougé.
   *
   * Les deux fonctions sont hors du tableau de dépendances DÉLIBÉRÉMENT : elles ne capturent
   * aucune variable d'état, leur comportement ne dépend que de `supabase`. Les inclure ferait
   * changer la valeur à chaque rendu et annulerait la mémorisation, c'est-à-dire exactement le
   * défaut qu'on corrige ici. */
  const valeur = useMemo(
    () => ({ session, loading, erreurSession, signInWithMagicLink, signOut }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, loading, erreurSession],
  )

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
