import { supabase } from '@/lib/supabase'

/**
 * QUI EST CONNECTÉ — demandé UNE FOIS, pas six.
 *
 * `supabase.auth.getUser()` n'est pas une lecture locale : elle part au serveur valider le jeton,
 * et compte donc un aller-retour réseau à chaque appel. Or une dizaine de fonctions la posent au
 * montage d'un écran, chacune pour la même réponse.
 *
 * Mesuré le 31/08/2026 sur la fiche du compte CABINET MICHAU (215 sites) : **six appels à
 * /auth/v1/user, 2 388 ms cumulées** — soit un dixième du temps total de chargement de la page,
 * passé à redemander six fois la même identité.
 *
 * Le cache est une promesse, pas une valeur : deux appels simultanés partagent le même
 * aller-retour au lieu d'en lancer deux. Un échec n'est jamais mémorisé — sans quoi une coupure
 * réseau d'une seconde condamnerait la session entière.
 *
 * IL EST VIDÉ À CHAQUE CHANGEMENT DE SESSION, par `viderCacheAcces`. Le laisser en place ferait
 * travailler le suivant sous l'identité du précédent.
 *
 * CE N'EST PAS UNE BARRIÈRE DE SÉCURITÉ, et il ne faut pas s'en servir comme telle : ce qu'un
 * utilisateur a le droit de lire est décidé par les politiques RLS, côté base, à chaque requête.
 * Cette fonction ne sert qu'à savoir quoi AFFICHER.
 */

let cache: Promise<{ id: string; email: string | null } | null> | null = null

export function viderCacheUtilisateur() {
  cache = null
}

export function utilisateurCourant(): Promise<{ id: string; email: string | null } | null> {
  if (!cache) {
    cache = supabase.auth
      .getUser()
      .then(({ data }) => (data.user ? { id: data.user.id, email: data.user.email ?? null } : null))
      .catch((err) => {
        cache = null
        throw err
      })
  }
  return cache
}
