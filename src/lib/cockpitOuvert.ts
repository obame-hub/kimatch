/**
 * ══ LE COCKPIT EST-IL OUVERT ? ══
 *
 * William, 16/09/2026 : pousser chaque jour ce qui est écrit, mais qu'en production le clic sur
 * « Cockpit » tombe sur une page en construction — et qu'en local tout fonctionne.
 *
 * ══ OUVRIR ══
 *
 * Passer `OUVERT_EN_PRODUCTION` à `true`, pousser. Rien d'autre : la route, l'entrée de menu, la
 * page et les cinq migrations du 15/09 sont déjà en place. C'est la seule ligne qui retient tout.
 *
 * ══ POURQUOI UN INTERRUPTEUR ET NON UNE BRANCHE ══
 *
 * Le dépôt travaille en commits directs sur `master`, sans branche ni relecture — le choix assumé
 * du projet tant que l'équipe reste petite. Garder le Cockpit hors de `master` jusqu'à son
 * ouverture voudrait donc dire ne pas le pousser du tout, c'est-à-dire exactement le gros
 * versement de fin de projet qu'on cherche à éviter.
 *
 * C'est l'idiome du dépôt : `AFFICHER_LES_LISTES = false` dans `Prospection.tsx` masque l'onglet
 * des listes depuis le 25/08 de cette façon même.
 *
 * ══ CE QUI DÉCIDE ══
 *
 * `import.meta.env.DEV` vaut vrai sous `npm run dev` et `npm run dev:sandbox`, faux dans tout ce
 * que Vite construit — donc faux sur Vercel. Aucune variable d'environnement à créer, rien à
 * régler : le Cockpit est entièrement utilisable en local et fermé en ligne sans qu'on y pense.
 *
 * ET CE N'EST PAS UN DROIT NI UNE PRÉFÉRENCE. Un réglage en base ou une permission par rôle se
 * règle depuis l'administration, et se dérègle. L'ouverture est une décision de publication :
 * elle appartient au code, pas aux données.
 */

/**
 * L'unique ligne à basculer le jour de l'ouverture.
 *
 * ══ OUVERT LE 24/09/2026 ══
 *
 * William : « Cockpit est marqué en construction, je veux désormais que ce soit utilisable. »
 *
 * Huit jours après la pose de cet interrupteur. Entre-temps le Cockpit a reçu ses trois héros, son
 * fil d'activité, sa barre de commandes, sa boîte de dépôt de factures et ses bannières de rappel,
 * et les mesures qui ont sorti 3 466 pistes de l'oubli. Il est essayé pour de bon : il s'ouvre.
 *
 * `import.meta.env.DEV` reste dans le calcul : il ne sert plus à rien une fois `true` posé ici,
 * mais l'effacer ferait perdre le mécanisme si l'on voulait refermer un jour.
 */
const OUVERT_EN_PRODUCTION = true

/** Le Cockpit répond-il, ici et maintenant ? */
export const cockpitOuvert = OUVERT_EN_PRODUCTION || import.meta.env.DEV
