import { Navigate, Outlet } from 'react-router-dom'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

/**
 * ══ L'ÉCRAN D'ATTENTE A MAINTENANT UNE SORTIE ══
 *
 * Audit du 13/09/2026, constat ERR-03. Cet écran affichait « Chargement… » tant que `loading`
 * était vrai — et `loading` pouvait ne jamais redescendre : l'appel à `getSession()` dans
 * `AuthProvider` n'avait ni `.catch()` ni délai de garde. Réseau coupé au démarrage, Supabase
 * indisponible, jeton illisible : l'application restait sur ce mot, pour toujours, sans bouton.
 *
 * `AuthProvider` garantit désormais que `loading` finit toujours par retomber — au pire au bout de
 * dix secondes — et renseigne `erreurSession` quand la lecture a échoué. Cet écran n'a plus qu'à
 * distinguer les trois cas, qui appellent trois réponses différentes :
 *
 *   loading                  on ne sait pas encore  → on attend
 *   erreurSession renseignée on n'a PAS PU savoir   → on explique et on propose de réessayer
 *   session à null           on sait : pas connecté → on envoie sur l'écran de connexion
 *
 * LA DISTINCTION ENTRE LES DEUX DERNIERS EST TOUTE LA CORRECTION. Rediriger vers `/login` quand le
 * réseau est coupé serait trompeur : la personne est peut-être parfaitement authentifiée, elle
 * demanderait un lien magique dont elle n'a pas besoin — et qu'elle ne recevrait pas davantage,
 * puisque c'est le réseau qui manque.
 */
export function ProtectedRoute() {
  const { session, loading, erreurSession } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-km-faint">Chargement…</div>
  }

  if (erreurSession && !session) {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-km-amber-soft text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-base font-semibold text-km-text">
                Kimatch n’a pas pu vérifier votre connexion
              </h1>
              <p className="mt-1 text-km-body text-km-muted">
                Le serveur n’a pas répondu. C’est en général une coupure réseau passagère&nbsp;:
                vous n’avez pas été déconnecté(e), et rien n’a été perdu.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-km border border-km-line bg-km-soft p-3">
            <p className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
              Message technique
            </p>
            <p className="mt-1 break-words font-mono text-km-label text-km-text">{erreurSession}</p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {/* Un rechargement complet, et non un simple nouvel essai de lecture : quand la
                connexion revient, repartir d'une page neuve évite de traîner un état à moitié
                construit par les requêtes qui ont échoué entre-temps. */}
            <Button variant="primary" onClick={() => window.location.reload()} className="gap-1.5">
              <RotateCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
