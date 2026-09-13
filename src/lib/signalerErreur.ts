/**
 * ══ LE POINT UNIQUE PAR OÙ PASSE UNE ERREUR AVANT D'ÊTRE PERDUE ══
 *
 * Audit du 13/09/2026, constat OBS-01 : Kimatch n'a aucune supervision. Les 43 `console.error` de
 * `src/` s'écrivent dans la console du poste concerné, et personne d'autre ne les voit jamais.
 *
 * CE QUE ÇA COÛTE, ET CE N'EST PAS THÉORIQUE. Le 10/09/2026, Naoëlle signale des écrans blancs.
 * Le défaut n'a pu être identifié que parce qu'elle a pensé à ouvrir la console et à recopier le
 * message — « Failed to fetch dynamically imported module ». Sans ce réflexe, le défaut serait
 * encore là. Un incident qu'on ne voit pas ne se corrige pas : il se contourne, et l'équipe finit
 * par croire que l'application est comme ça.
 *
 * ── POURQUOI UNE FONCTION PLUTÔT QU'UN APPEL DIRECT À SENTRY ──
 *
 * Sentry n'est pas encore branché : il demande un DSN que je ne peux pas créer. Si chaque endroit
 * appelait `Sentry.captureException` directement, il faudrait ou bien attendre le DSN pour poser
 * les gardes, ou bien repasser sur tous ces endroits le jour où il arrive.
 *
 * Ici, le jour où le DSN existe, UN SEUL fichier change — celui-ci. Les appelants ne bougent pas.
 *
 * ── CE QU'ELLE FAIT AUJOURD'HUI ──
 *
 * Elle journalise, avec le contexte de l'appelant. C'est peu, mais c'est déjà mieux qu'un
 * `console.error(erreur)` nu : on sait d'où ça vient, sur quelle page, et pour quel utilisateur.
 */

interface ContexteErreur {
  /** D'où vient l'erreur : nom du composant, du crochet ou de la fonction. */
  ou: string
  /** Ce que la personne était en train de faire, quand on le sait. */
  quoi?: string
  /** Tout renseignement utile au diagnostic : identifiant de la fiche, nom de la table… */
  details?: Record<string, unknown>
}

/**
 * Signale une erreur qui a été rattrapée.
 *
 * À appeler partout où l'on écrivait `console.error(…)` sur un chemin d'erreur réel — pas sur une
 * dégradation attendue (une table qui n'existe pas encore parce qu'une migration n'est pas passée
 * n'est pas un incident, c'est un état connu).
 */
export function signalerErreur(erreur: unknown, contexte: ContexteErreur): void {
  const message = erreur instanceof Error ? erreur.message : String(erreur)

  /* LE GROUPE PLUTÔT QU'UNE LIGNE : la pile d'appel et le contexte restent lisibles côté console,
     au lieu de se diluer dans le flot des autres messages. */
  console.error(`[${contexte.ou}] ${message}`, {
    quoi: contexte.quoi,
    adresse: typeof window !== 'undefined' ? window.location.pathname : undefined,
    ...contexte.details,
    erreur,
  })

  /* ══ LE JOUR OÙ SENTRY ARRIVE, C'EST ICI, ET NULLE PART AILLEURS ══
   *
   *   import * as Sentry from '@sentry/react'
   *   Sentry.captureException(erreur, {
   *     tags: { ou: contexte.ou },
   *     extra: { quoi: contexte.quoi, ...contexte.details },
   *   })
   *
   * Marche à suivre, dans cet ordre :
   *   1. Créer le projet sur sentry.io, récupérer le DSN.
   *   2. Le poser en `VITE_SENTRY_DSN` sur Vercel (production ET sandbox, valeurs distinctes).
   *   3. `npm i @sentry/react`, initialiser dans `main.tsx` avant le premier rendu.
   *   4. Activer `build.sourcemap` dans `vite.config.ts`, sans quoi les traces sont illisibles.
   */
}

/**
 * ══ LE FILET GLOBAL : CE QUE PERSONNE N'A RATTRAPÉ ══
 *
 * Deux catégories d'erreurs échappent à toutes les frontières React :
 *
 *   · les promesses rejetées que personne n'attend — un `void quelqueChose()` dont l'appel échoue ;
 *   · les erreurs levées hors du rendu — dans un gestionnaire d'événement, un `setTimeout`.
 *
 * Elles n'affichent rien, ne cassent rien de visible, et disparaissent. C'est la catégorie la plus
 * pernicieuse : l'application « marche », mais une écriture sur deux ne part pas.
 *
 * À appeler une fois au démarrage, comme `surveillerLesMorceauxManquants`.
 */
export function surveillerLesErreursNonRattrapees(): void {
  window.addEventListener('unhandledrejection', (evenement) => {
    /* ON NE FAIT PAS `preventDefault()`. Contrairement à `vite:preloadError`, où l'on prend la main
       parce qu'on sait quoi faire (recharger), ici on ne sait pas : on observe seulement. Empêcher
       le comportement par défaut retirerait le message de la console du navigateur, qui reste le
       seul outil de diagnostic tant que Sentry n'est pas là. */
    signalerErreur(evenement.reason, { ou: 'promesse non rattrapée' })
  })

  window.addEventListener('error', (evenement) => {
    /* `evenement.error` est absent quand l'échec vient d'une ressource (une image, une feuille de
       style) plutôt que d'un script. Ces cas-là ne sont pas des erreurs de code et noieraient le
       signal : on les laisse passer. */
    if (!evenement.error) return
    signalerErreur(evenement.error, {
      ou: 'erreur non rattrapée',
      details: { fichier: evenement.filename, ligne: evenement.lineno },
    })
  })
}
