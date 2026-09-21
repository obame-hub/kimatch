/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE LISTE QUI N'A PAS PU SE CHARGER NE DIT PLUS QU'ELLE EST VIDE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Relevé le 21/09/2026 : vingt-cinq lectures de `src/lib/data` finissaient par le même geste —
 *
 *     } catch (error) {
 *       console.error('fetchPistes', error)
 *       return []          // ← l'échec devient « il n'y a rien »
 *     }
 *
 * Pour l'écran, une liste vide et une lecture ratée sont alors la MÊME CHOSE. Réseau coupé, session
 * expirée, colonne renommée, droit refusé : dans tous les cas le commercial lit « Aucune piste » et
 * en conclut que ses données ont disparu. L'erreur, elle, ne part que dans la console du
 * navigateur, que personne n'ouvre.
 *
 * C'est la version provoquée du piège connu de ce projet : une donnée absente rend un écran
 * INVISIBLE, pas cassé. Et depuis le 21/09 elle est pire qu'avant, car l'écran vide annonce
 * désormais un chiffre — « 5 181 pistes existent » — qui serait faux pendant une panne.
 *
 * ══ CE QU'ON FAIT À LA PLACE ══
 *
 * On laisse l'erreur remonter. React Query la reçoit, marque la requête en échec, et l'écran peut
 * enfin distinguer « rien à afficher » de « je n'ai pas réussi à lire ». C'est un comportement que
 * la bibliothèque sait déjà tenir : on l'en empêchait.
 *
 * LE NOM DE LA LECTURE RESTE DANS LE MESSAGE. Sans lui, « TypeError: Failed to fetch » ne dit pas
 * quel écran a échoué — et c'est la première question qu'on se pose en lisant un rapport.
 */

/**
 * Le détail lisible d'une cause, quelle que soit sa forme.
 *
 * ══ POURQUOI CE N'EST PAS UN SIMPLE `String(origine)` ══
 *
 * Parce que SUPABASE NE LÈVE PRESQUE JAMAIS UNE `Error`. PostgREST rend un objet nu —
 * `{ message, code, details, hint }` — et `String()` d'un objet donne « [object Object] ». Le
 * message affiché à l'écran aurait donc été « usePistes : [object Object] », ce qui est à peine
 * mieux que le silence qu'on vient de corriger : on saurait qu'il y a une panne, pas laquelle.
 *
 * Trouvé par le test plutôt qu'à l'écran, et c'est heureux : le cas ne se produit qu'en vraie
 * panne de base — colonne disparue, droit refusé — c'est-à-dire précisément le moment où personne
 * n'a le temps de déboguer un message illisible.
 *
 * LE CODE POSTGREST EST REPRIS QUAND IL EXISTE : c'est lui qui distingue un droit refusé (42501)
 * d'une colonne absente (42703), les deux pannes les plus fréquentes de ce projet.
 */
function detailLisible(origine: unknown): string {
  if (origine instanceof Error) return origine.message
  if (origine && typeof origine === 'object') {
    const o = origine as { message?: unknown; code?: unknown }
    const message = typeof o.message === 'string' ? o.message : null
    const code = typeof o.code === 'string' ? o.code : null
    if (message) return code ? `${message} (${code})` : message
    if (code) return code
    /* NI MESSAGE NI CODE : on rend le JSON plutôt que « [object Object] ». C'est moins lisible
       qu'une phrase, mais ça contient encore l'information — et ce cas n'est pas censé arriver. */
    try {
      return JSON.stringify(origine)
    } catch {
      return 'erreur non sérialisable'
    }
  }
  return String(origine)
}

/** Erreur de lecture, nommée par la fonction qui l'a rencontrée. */
export class ErreurDeLecture extends Error {
  /** L'erreur d'origine, gardée pour le débogage. `cause` n'est pas typée sur `Error` dans la
   *  cible de compilation du projet : on la porte sous notre propre nom. */
  readonly origine: unknown

  constructor(public readonly lecture: string, origine: unknown) {
    super(`${lecture} : ${detailLisible(origine)}`)
    this.name = 'ErreurDeLecture'
    this.origine = origine
  }
}

/**
 * À utiliser dans le `catch` d'une lecture de liste, à la place de `return []`.
 *
 * On journalise ET on relance : la console garde la trace complète pour qui débogue, et l'écran
 * reçoit de quoi afficher un vrai message à qui travaille.
 */
export function relancer(lecture: string, cause: unknown): never {
  console.error(lecture, cause)
  throw new ErreurDeLecture(lecture, cause)
}
