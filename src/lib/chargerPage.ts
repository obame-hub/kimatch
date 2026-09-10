/**
 * ══ L'ÉCRAN BLANC APRÈS UNE MISE EN LIGNE ══
 *
 * Naoëlle, 10/09/2026 : « quand je clique à un endroit sur l'app, souvent j'ai un écran blanc et
 * il faut que je fasse un hard refresh pour voir le contenu ». Sa console disait tout :
 *
 *   Failed to fetch dynamically imported module:
 *   https://kimatch.fr/assets/Nouveautes-A_Y0JqVi.js
 *
 * ── CE QUI SE PASSE ──
 *
 * L'application est découpée en morceaux dont le NOM PORTE UNE EMPREINTE du contenu :
 * `Nouveautes-A_Y0JqVi.js`. C'est ce qui permet au navigateur de les garder en cache pour
 * toujours — un nom, un contenu, à jamais.
 *
 * Mais l'onglet resté ouvert connaît la liste des morceaux de la version qu'il a chargée. À la
 * mise en ligne suivante, les empreintes changent et les anciens fichiers disparaissent. Le
 * premier clic vers un écran pas encore chargé demande alors un fichier qui n'existe plus ; le
 * serveur, qui ne sait rien répondre d'autre pour une adresse inconnue, renvoie la page d'accueil.
 * Le navigateur reçoit du HTML là où il attendait du JavaScript, refuse, et l'écran reste blanc.
 *
 * LE HARD REFRESH MARCHE parce qu'il recharge la page d'accueil, donc la liste à jour des
 * morceaux. C'est ce qui rendait le défaut si déroutant : il se répare tout seul, mais seulement
 * si l'on sait qu'il faut recharger.
 *
 * Le 10/09 j'ai mis en ligne six fois. Six occasions, pour chaque onglet ouvert, de tomber dessus.
 *
 * ── POURQUOI PAS « RECHARGER À CHAQUE CLIC » ──
 *
 * C'était la demande, et elle réglerait le symptôme. Mais recharger la page entière à chaque
 * navigation, c'est perdre l'intérêt d'une application web : chaque clic repaierait le
 * démarrage complet, le cache des données serait jeté, les formulaires en cours perdus. On
 * paierait en permanence le prix d'un incident qui n'arrive qu'après une mise en ligne.
 *
 * ── CE QU'ON FAIT À LA PLACE ──
 *
 * On recharge UNE FOIS, au moment précis où le morceau manque. Invisible : l'écran demandé
 * s'affiche, simplement précédé d'un rechargement d'une seconde au lieu d'un écran blanc
 * définitif.
 *
 * Et un garde-fou contre la boucle : si un rechargement vient d'avoir lieu il y a moins de dix
 * secondes, on ne recommence pas — on laisse l'erreur remonter. Sans lui, un morceau réellement
 * absent du serveur ferait tourner la page en rond indéfiniment, ce qui est pire qu'un écran
 * blanc puisqu'on ne peut même plus lire le message.
 */

const CLE = 'kimatch:dernier-rechargement-morceau'
const DELAI_ANTI_BOUCLE = 10_000

/** Le rechargement est-il un remède raisonnable, ou est-on en train de tourner en rond ? */
function peutRecharger(): boolean {
  try {
    const dernier = Number(sessionStorage.getItem(CLE) ?? 0)
    if (Date.now() - dernier < DELAI_ANTI_BOUCLE) return false
    sessionStorage.setItem(CLE, String(Date.now()))
    return true
  } catch {
    /* Navigation privée, stockage refusé : on préfère recharger une fois de trop que laisser un
       écran blanc. Le risque de boucle existe, mais il suppose un serveur réellement cassé. */
    return true
  }
}

/**
 * Charge un écran, et survit à une mise en ligne survenue entre-temps.
 *
 * À utiliser partout où l'on écrivait `lazy(() => import('@/pages/X'))` :
 *   `lazy(() => chargerPage(() => import('@/pages/X')))`
 */
export function chargerPage<T>(importer: () => Promise<T>): Promise<T> {
  return importer().catch(async (erreur: unknown) => {
    /* UN SEUL NOUVEL ESSAI, ET IL NE SERT PAS À CE QU'ON CROIT. Redemander le même fichier ne le
       fera pas réapparaître s'il a été remplacé. En revanche il revient très bien après une
       coupure réseau d'une seconde — un ascenseur, un changement de wifi — et dans ce cas
       recharger la page serait une réponse disproportionnée. */
    try {
      return await importer()
    } catch {
      /* Le fichier manque vraiment. */
    }

    if (peutRecharger()) {
      window.location.reload()
      /* On ne résout jamais : la page s'en va. Résoudre ou rejeter ferait afficher un écran
         d'erreur pendant la seconde qui précède le rechargement. */
      return new Promise<T>(() => {})
    }

    throw erreur
  })
}

/**
 * LE FILET, POUR TOUT CE QUI N'EST PAS UN ÉCRAN.
 *
 * Les écrans passent par `chargerPage`, mais l'application charge aussi des morceaux à la
 * demande ailleurs — la visionneuse de PDF, la génération de mandat, la capture d'image. Vite
 * émet `vite:preloadError` sur `window` quand l'un d'eux échoue, quelle qu'en soit l'origine.
 *
 * À appeler une fois au démarrage.
 */
export function surveillerLesMorceauxManquants(): void {
  window.addEventListener('vite:preloadError', (evenement) => {
    /* On empêche Vite de relancer l'erreur : c'est nous qui décidons de la suite. */
    evenement.preventDefault()
    if (peutRecharger()) window.location.reload()
  })
}
