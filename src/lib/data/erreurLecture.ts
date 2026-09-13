import { signalerErreur } from '@/lib/signalerErreur'

/**
 * ══ UNE LECTURE QUI ÉCHOUE NE DOIT PLUS RESSEMBLER À UNE ABSENCE DE DONNÉES ══
 *
 * Audit du 13/09/2026, constat ERR-02. Vingt-deux modules de `src/lib/data/` se terminaient par :
 *
 *     catch (error) { console.error('fetchX', error); return [] }
 *
 * ── POURQUOI C'EST LE DÉFAUT LE PLUS TROMPEUR DU PROJET ──
 *
 * Du point de vue de React Query, la requête a RÉUSSI et son résultat est `[]`. Le tableau vide
 * est donc mis en cache pour `staleTime`, soit cinq minutes, avec `refetchOnWindowFocus` coupé.
 * Pendant ce temps, l'écran affirme qu'il n'y a aucune donnée — avec la même sérénité qu'une
 * vraie absence.
 *
 * Les causes d'échec ne manquent pas : un 503 de PostgREST sous charge (le commentaire de
 * `paginatedFetch.ts` en documente une série), un dépassement de la longueur d'URL (ARC-02), une
 * policy RLS trop stricte, une colonne absente après une migration non appliquée.
 *
 * Et l'utilisateur, lui, fait la seule chose sensée : il recharge. Ça marche. Il en conclut que
 * l'application est capricieuse.
 *
 * ── MAIS TOUTE ERREUR N'EST PAS UN INCIDENT ──
 *
 * Une partie de ces `catch` protégeait un cas réel et voulu : entre le moment où le code part en
 * ligne et celui où la migration est appliquée, une table ou une colonne peut ne pas exister
 * encore. Ce n'est pas une panne, c'est un état connu et transitoire — et faire échouer l'écran
 * pour cela serait une régression.
 *
 * Le projet distinguait déjà ce cas, mais à huit endroits différents et sous quatre formes :
 * `absente()` dans `ficheCompte.ts`, `ABSENTE` dans `corbeille.ts` et `fileAppels.ts`,
 * `vueAbsente()` dans `compteurs.ts`, et des expressions régulières recopiées ailleurs. Ce
 * fichier est l'endroit unique où cette règle vit désormais.
 *
 * ── LA RÈGLE, EN UNE PHRASE ──
 *
 * Le schéma n'est pas encore là : on se tait et on rend vide. Tout le reste : on relance, et
 * l'écran le dit.
 */

interface ErreurSupabase {
  code?: string
  message?: string
  details?: string
  hint?: string
}

/**
 * L'erreur dit-elle « cette table, cette vue ou cette colonne n'existe pas (encore) » ?
 *
 * Les codes sont ceux de PostgreSQL et de PostgREST, préférés aux messages : ils ne changent pas
 * avec la langue ni avec la version.
 *
 *   42P01      undefined_table       — la table ou la vue n'existe pas
 *   42703      undefined_column      — la colonne n'existe pas
 *   42883      undefined_function    — la fonction RPC n'existe pas
 *   PGRST202   PostgREST ne trouve pas la fonction demandée
 *   PGRST205   PostgREST ne trouve pas la table dans son cache de schéma
 *
 * Le repli sur le message reste nécessaire : les erreurs remontées depuis un `throw new Error()`
 * perdent leur code en route, et c'est le cas de tout ce qui passe par `fetchAllRows`.
 */
export function estSchemaAbsent(erreur: unknown): boolean {
  const e = erreur as ErreurSupabase | null
  if (!e) return false

  const code = typeof e.code === 'string' ? e.code : ''
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST205'].includes(code)) return true

  const message = erreur instanceof Error ? erreur.message : (e.message ?? '')
  return /does not exist|schema cache|could not find .* in the schema/i.test(message)
}

/**
 * À poser dans le `catch` d'une fonction de lecture, à la place de `return []`.
 *
 *     } catch (erreur) {
 *       return replierOuRelancer(erreur, { ou: 'fetchDocuments' }, [])
 *     }
 *
 * Rend `valeurDeRepli` si le schéma n'est pas encore en place ; relance dans tous les autres cas,
 * pour que React Query passe en `isError` et que l'écran puisse le dire.
 *
 * L'ABSENCE DE SCHÉMA EST JOURNALISÉE EN `warn`, PAS IGNORÉE. Une migration oubliée est une
 * situation temporaire par définition : si elle dure, il faut pouvoir s'en apercevoir autrement
 * qu'en constatant qu'un écran est vide depuis trois semaines.
 */
export function replierOuRelancer<T>(
  erreur: unknown,
  contexte: { ou: string; quoi?: string },
  valeurDeRepli: T,
): T {
  if (estSchemaAbsent(erreur)) {
    console.warn(
      `[${contexte.ou}] schéma pas encore en place, on rend un résultat vide.`,
      erreur instanceof Error ? erreur.message : erreur,
    )
    return valeurDeRepli
  }

  signalerErreur(erreur, contexte)
  throw erreur
}
