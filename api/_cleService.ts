/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CLÉ QUI DONNE TOUS LES DROITS — ET LAQUELLE DES DEUX
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 20/09/2026, à propos du recoupage des clés : « le problème, c'est que ça a bloqué tout
 * le monde la dernière fois ».
 *
 * ══ POURQUOI ÇA AVAIT BLOQUÉ, ET POURQUOI ÇA NE PEUT PLUS ═══════════════════════════════════
 *
 * Supabase a deux générations de clés. L'ANCIENNE est un JWT signé par un secret unique : couper ce
 * secret invalide d'un coup la clé publique du navigateur ET la clé serveur. C'est ce qui a bloqué
 * l'équipe — les treize navigateurs portaient l'ancienne clé publique, et plus rien ne répondait.
 *
 * LA NOUVELLE GÉNÉRATION les sépare : une clé « publiable » pour le navigateur
 * (`sb_publishable_…`), une clé « secrète » pour le serveur (`sb_secret_…`), révocables
 * indépendamment et sans lien avec le secret JWT.
 *
 * ÉTAT RELEVÉ LE 20/09/2026 : le navigateur utilise DÉJÀ la clé publiable — aucun fichier de `src/`
 * ne lit la clé de service. Seuls quatorze points d'entrée serveur portaient encore l'ancien JWT,
 * celui qui a fuité le 10/09. Une fois qu'ils lisent la nouvelle, plus rien dans Kimatch ne dépend
 * du secret JWT, et le couper ne bloque personne.
 *
 * ══ POURQUOI UN REPLI, ET QUAND LE RETIRER ══════════════════════════════════════════════════
 *
 * L'ancienne clé reste acceptée tant qu'elle est configurée. Sans ce repli, un déploiement où
 * `SUPABASE_SECRET_KEY` manquerait dans Vercel arrêterait net les webhooks, les envois de mail et
 * la création de pistes — un basculement d'un coup pour économiser trois lignes.
 *
 * LE REPLI SE RETIRE LE JOUR OÙ L'ANCIENNE CLÉ EST RÉVOQUÉE, et pas avant : tant qu'elle existe,
 * il ne coûte rien ; une fois révoquée, il ne sert plus à rien.
 *
 * Vérifié avant d'écrire ce fichier, sur une table fermée par RLS : les deux clés lisent la ligne,
 * la clé publiable n'en lit aucune. La nouvelle fait donc exactement le même travail.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * La clé de service, nouvelle génération de préférence.
 *
 * Rend `undefined` si aucune n'est configurée — l'appelant doit le dire clairement plutôt que de
 * tenter une requête qui échouera avec un message de Supabase, illisible dans un journal.
 */
export function cleService(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
}

/** L'adresse du projet. Les deux noms existent selon l'âge du point d'entrée. */
export function urlSupabase(): string | undefined {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
}
