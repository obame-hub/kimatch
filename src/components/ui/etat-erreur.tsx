import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * ══ « LA LECTURE A ÉCHOUÉ » N'EST PAS LA MÊME CHOSE QUE « IL N'Y A RIEN » ══
 *
 * Audit du 13/09/2026, constat ERR-02. Sur les quarante-cinq écrans, DEUX exposaient un état
 * d'erreur. Les autres n'avaient que deux états possibles — « chargement » ou « voici les
 * données » — et une lecture qui échouait se rangeait dans le second, sous la forme d'une liste
 * vide.
 *
 * C'est ce qui rendait le défaut si coûteux : une liste vide est INDISCERNABLE d'une absence
 * légitime. L'utilisateur en conclut qu'il n'y a rien à voir, referme, et passe à côté. Ou bien il
 * recharge, ça marche, et il en déduit que l'application est capricieuse.
 *
 * ── CE QU'ON AFFICHE, ET POURQUOI ──
 *
 * Trois choses. Ce qui s'est passé, en une phrase qui ne rejette pas la faute sur la personne. Le
 * message technique, VISIBLE et non replié : tant que la supervision n'est pas en place, c'est le
 * seul élément qui permette de diagnostiquer, et le cacher reviendrait à demander à l'équipe
 * d'ouvrir la console. Et un bouton, parce que dans la grande majorité des cas — un 503 passager,
 * une coupure d'une seconde — réessayer suffit.
 *
 * ── ELLE NE REMPLACE PAS L'ÉCRAN ──
 *
 * `FrontiereErreur` prend toute la page quand le rendu lui-même a échoué : il n'y a alors plus
 * rien à montrer. Ici l'écran est intact, c'est UNE de ses données qui manque. On occupe donc la
 * place de cette donnée, en gardant le reste utilisable — les filtres, la recherche, les autres
 * blocs.
 */
export function EtatErreur({
  message,
  reessayer,
  quoi = 'Ces données',
  compact = false,
}: {
  /** Le message technique, tel que la base ou le réseau l'a rendu. */
  message: string
  /** Relance la lecture. Le plus souvent `() => requete.refetch()`. */
  reessayer?: () => void
  /** Ce qui n'a pas pu être lu : « La liste des contrats », « Les documents ». */
  quoi?: string
  /** Version d'une seule ligne, pour un encart ou une cellule de tableau. */
  compact?: boolean
}) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-km-label text-km-red">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {quoi} n’ont pas pu être chargées.
        {reessayer && (
          <button type="button" onClick={reessayer} className="underline underline-offset-2 hover:no-underline">
            Réessayer
          </button>
        )}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-km-amber-soft text-amber-600">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <p className="text-km-body font-semibold text-km-text">{quoi} n’ont pas pu être chargées</p>
      {/* `break-words` : un message de PostgREST peut être long et sans espace — sans lui, il
          élargit le conteneur et fait défiler la page latéralement. */}
      <p className="max-w-md break-words font-mono text-km-label text-km-muted">{message}</p>
      {reessayer && (
        <Button onClick={reessayer} className="mt-1 gap-1.5">
          <RotateCw className="h-3.5 w-3.5" /> Réessayer
        </Button>
      )}
    </div>
  )
}
