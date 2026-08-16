import { useState } from 'react'

/**
 * Traduit une erreur de suppression en phrase lisible.
 *
 * Le cas courant est la violation de clé étrangère (code Postgres 23503) : la base compte vingt
 * contraintes qui empêchent d'effacer un enregistrement encore référencé — un compte qui porte des
 * compteurs, un contact désigné sur un contrat, un site cité par une recommandation. Sans message,
 * l'utilisateur voyait la fenêtre de confirmation rester là sans rien dire.
 */
export function messageErreurSuppression(erreur: unknown): string {
  const brut = erreur instanceof Error ? erreur.message : String(erreur)

  if (/23503|foreign key|violates foreign key constraint/i.test(brut)) {
    return "Impossible de supprimer : d'autres enregistrements y sont encore rattachés. Détache-les d'abord, puis réessaie."
  }
  if (/permission|denied|policy|row-level security/i.test(brut)) {
    return "Suppression refusée par la base. Si cela se reproduit, signale-le — c'est un droit à corriger, pas une manipulation de ta part."
  }
  if (/network|fetch|timeout|Failed to fetch/i.test(brut)) {
    return 'La connexion a été interrompue. Vérifie ton réseau et réessaie.'
  }
  return brut || 'La suppression a échoué.'
}

/**
 * Encadre une suppression : état d'attente, message d'erreur lisible, et surtout une fenêtre qui
 * ne reste jamais bloquée.
 *
 * DEUX DÉFAUTS RÉGLÉS ICI, tous deux constatés le 16/08/2026.
 *
 * 1. Quand la suppression RÉUSSISSAIT, la fenêtre semblait figée. Les fiches faisaient
 *    `await deleteX.mutateAsync(id)` puis `navigate(...)`, or `mutateAsync` attend `onSuccess`,
 *    qui invalidait les requêtes et attendait leur rechargement complet. Sur une fiche
 *    interaction, cela voulait dire recharger les 66 643 interactions avant de naviguer. Les
 *    invalidations ne bloquent plus (voir les `void` dans lib/data), et la navigation part sans
 *    attendre.
 *
 * 2. Quand elle ÉCHOUAIT, il ne se passait rien du tout : aucun `try/catch`, donc la promesse
 *    partait en rejet non traité, la navigation n'avait pas lieu et aucun message n'apparaissait.
 *    Il ne restait qu'à recharger la page à la main.
 */
export function useSuppression() {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /**
   * @param action Ce qu'il faut faire (l'appel de suppression).
   * @param apres Ce qu'il faut faire ensuite, typiquement naviguer. N'est appelé qu'en cas de succès.
   */
  async function supprimer(action: () => Promise<unknown>, apres?: () => void) {
    if (enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      await action()
      apres?.()
    } catch (e) {
      setErreur(messageErreurSuppression(e))
    } finally {
      setEnCours(false)
    }
  }

  return { supprimer, erreur, enCours, reinitialiser: () => setErreur(null) }
}
