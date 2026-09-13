/**
 * ══ UNE RAFALE D'ÉVÉNEMENTS NE DOIT PAS FAIRE UNE RAFALE DE REQUÊTES ══
 *
 * Audit du 13/09/2026, constat BCK-05.
 *
 * Trois écrans du tableau de bord écoutent les modifications de `actions`, `opportunites`,
 * `pistes`, `recommandations` et `versions_recommandation`, sans aucun filtre : toute écriture
 * faite par n'importe qui, sur n'importe quelle ligne, est diffusée à tous les navigateurs
 * connectés — et chacun relance aussitôt ses requêtes.
 *
 * ── LE CAS QUI FAIT MAL ──
 *
 * `pistes` compte 5 136 lignes et se remplit par imports en lot. Un import émet autant
 * d'événements que de lignes insérées. Sans amortissement, chaque navigateur ouvert relance donc
 * ses requêtes des milliers de fois — exactement au moment où la base est déjà occupée par
 * l'import.
 *
 * C'est un scénario cohérent avec l'incident du 10/09/2026 décrit dans
 * `scripts/sonder-la-base.cjs` : « l'instance n'avait plus de CPU, épuisé par un import de 12 000
 * fichiers que j'avais lancé à pleine vitesse ». Toute l'équipe à l'arrêt.
 *
 * ── CE QUE FAIT CETTE FONCTION, ET CE QU'ELLE NE FAIT PAS ──
 *
 * Elle regroupe : après le premier événement, elle attend le délai et n'exécute qu'UNE fois, quel
 * que soit le nombre d'événements survenus entre-temps. Mille insertions produisent un seul
 * rafraîchissement.
 *
 * ELLE NE FILTRE PAS. Un abonnement PostgreSQL peut porter un `filter` pour ne recevoir que ses
 * propres lignes, ce qui serait la vraie économie : aujourd'hui chaque navigateur reçoit encore
 * l'événement, il se contente de ne pas y réagir mille fois. Ce filtrage demande de connaître le
 * profil courant au moment de l'abonnement et de vérifier, pour chaque écran, que le compte
 * affiché ne dépend pas de lignes appartenant à d'autres — ce qui n'est pas acquis pour les
 * cartes du jour. À faire séparément, en le mesurant.
 */

/**
 * Regroupe les appels rapprochés en un seul.
 *
 * `delai` par défaut : 400 ms. Assez court pour qu'une tâche cochée par un collègue apparaisse
 * sans qu'on ait l'impression d'attendre ; assez long pour absorber une rafale d'insertions.
 */
export function amortir(action: () => void, delai = 400): (() => void) & { annuler: () => void } {
  let minuterie: ReturnType<typeof setTimeout> | null = null

  const amortie = () => {
    /* ON NE RÉARME PAS LA MINUTERIE À CHAQUE ÉVÉNEMENT, et c'est délibéré.
     *
     * Un amortissement classique repousse l'échéance à chaque appel : pendant un import qui dure
     * trois minutes, l'écran ne se rafraîchirait donc JAMAIS — il attendrait la fin. Ici la
     * première rafale déclenche une échéance ferme : on rafraîchit 400 ms plus tard, puis on
     * recommence à compter. L'écran suit l'import au lieu de l'attendre. */
    if (minuterie) return
    minuterie = setTimeout(() => {
      minuterie = null
      action()
    }, delai)
  }

  amortie.annuler = () => {
    if (minuterie) clearTimeout(minuterie)
    minuterie = null
  }

  return amortie
}
