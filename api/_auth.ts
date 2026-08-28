import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

/**
 * LA GARDE D'AUTHENTIFICATION DES FONCTIONS SERVEUR.
 *
 * Écrite le 28/08/2026 après un audit qui a trouvé SIX fonctions ouvertes à Internet. La preuve
 * n'était pas théorique : `GET https://kimatch.fr/api/slack/channels` répondait 200 à un appel
 * anonyme et renvoyait la liste des canaux Slack de KiWee, dont un canal privé. Et
 * `/api/ellisphere/search` répondait « 400 paramètre requis » au lieu de 401 — donc la requête
 * franchissait la fonction.
 *
 * CE QUE CHAQUE FONCTION OUVERTE COÛTAIT, et c'est différent selon le service :
 *   · Ellisphere et l'OCR (API Anthropic) sont facturés à l'usage — un tiers consommait le budget.
 *   · Enedis acceptait N'IMPORTE QUEL PDL et renvoyait ses données de comptage, en utilisant le
 *     certificat et le contrat Enedis de KiWee. Le contrôle d'accès aux données d'un tiers ne
 *     reposait que sur le fait que l'URL soit inconnue.
 *
 * POURQUOI UNE FONCTION PARTAGÉE plutôt que dix lignes recopiées dans chaque fichier : le motif
 * était déjà présent trois fois (gmail/connect, gmail/send, slack/notify) avec trois formulations
 * légèrement différentes. Une seule barrière, c'est une seule chose à relire — et une seule à
 * corriger le jour où la vérification change.
 *
 * ELLE VÉRIFIE VRAIMENT LA SESSION. Contrôler la seule présence d'un en-tête `Bearer` ne serait
 * pas une barrière : n'importe qui peut en poser un. `auth.getUser()` fait valider le jeton par
 * Supabase, avec la clé anonyme — celle du navigateur, jamais la clé de service.
 */
export interface UtilisateurAuthentifie {
  id: string
  email: string | null
  /** L'en-tête tel quel, à retransmettre quand la fonction doit lire la base au nom de l'appelant. */
  authHeader: string
}

/**
 * Renvoie l'utilisateur si la requête porte une session valide. Sinon répond elle-même (401 ou 500)
 * et renvoie `null` : l'appelant n'a plus qu'à sortir.
 *
 *   const user = await exigerSession(req, res)
 *   if (!user) return
 */
export async function exigerSession(
  req: VercelRequest,
  res: VercelResponse,
): Promise<UtilisateurAuthentifie | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return null
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    res.status(401).json({ error: 'Session invalide' })
    return null
  }

  return { id: data.user.id, email: data.user.email ?? null, authHeader }
}
