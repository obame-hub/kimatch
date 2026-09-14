import { createClient } from '@supabase/supabase-js'
import { peutRecharger } from '@/lib/chargerPage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Tant que les identifiants réels ne sont pas fournis, on pointe vers un projet
// factice pour ne pas faire planter le client — les écrans basculent sur les
// données de démonstration via isSupabaseConfigured.
/**
 * ══ UNE CLÉ REFUSÉE VEUT DIRE QUE CETTE PAGE EST PÉRIMÉE ══
 *
 * Le 14/09/2026, les anciennes clés d'accès de Supabase ont été désactivées — elles étaient
 * dépréciées, et l'une d'elles avait fuité. Tous ceux qui avaient un onglet ouvert ont vu
 * « Legacy API keys are disabled » : leur navigateur faisait tourner le code d'avant, avec
 * l'ancienne clé compilée dedans.
 *
 * MESSAGE INCOMPRÉHENSIBLE, ET SURTOUT INUTILE. Matthieu a cliqué sur un lien de connexion valide,
 * il a été redirigé, l'application lui a redemandé son adresse, et il a fini par épuiser le quota
 * de courriels de toute l'équipe en réessayant. Il n'avait aucun moyen de deviner qu'un
 * Ctrl+Maj+R réglait tout.
 *
 * ── POURQUOI ON RECHARGE PLUTÔT QUE D'AFFICHER UN JOLI MESSAGE ──
 *
 * Parce qu'on connaît le remède. Une clé refusée alors que l'application est déployée et
 * fonctionnelle ne signifie qu'une chose : le code qui s'exécute n'est plus celui du serveur.
 * Recharger va chercher la bonne version — c'est exactement le mécanisme déjà en place pour les
 * morceaux de code disparus (`chargerPage`), et on réutilise son garde-fou anti-boucle : si un
 * rechargement vient d'avoir lieu, on s'abstient et on laisse l'erreur remonter, sinon une clé
 * réellement mauvaise ferait tourner la page en rond indéfiniment.
 *
 * ── CE QU'ON NE TRAITE PAS ──
 *
 * Un 401 ordinaire — session expirée, jeton invalide — ne passe pas par ici : on ne réagit qu'aux
 * messages qui parlent de la CLÉ. Recharger sur une session expirée ferait perdre la page à
 * quelqu'un dont le seul tort est d'être parti déjeuner.
 */
const CLE_REFUSEE = /invalid api key|legacy api keys are disabled|no api key found/i

function estUneCleRefusee(corps: string): boolean {
  return CLE_REFUSEE.test(corps)
}

/**
 * L'appel réseau du client, enveloppé pour lire ce que le serveur répond.
 *
 * On ne touche ni à la requête ni à la réponse : on la LIT au passage, sur les seuls 401, et on
 * rend une copie intacte. Une réponse ne se lit qu'une fois — d'où le clonage, sans quoi le client
 * recevrait un corps déjà consommé et échouerait pour une tout autre raison que la vraie.
 */
async function fetchQuiRemarqueUneCleRefusee(entree: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const reponse = await fetch(entree, init)
  if (reponse.status !== 401) return reponse

  const copie = reponse.clone()
  let corps = ''
  try { corps = await copie.text() } catch { /* corps illisible : on laisse passer */ }

  if (estUneCleRefusee(corps) && peutRecharger()) {
    console.warn('[kimatch] clé d’accès refusée — cette page est périmée, rechargement')
    window.location.reload()
  }
  return reponse
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  { global: { fetch: fetchQuiRemarqueUneCleRefusee } },
)
