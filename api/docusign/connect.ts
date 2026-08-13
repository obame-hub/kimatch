import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildAuthUrl, encodeState, profilAppelant } from './_oauth.js'

/**
 * Renvoie l'URL d'autorisation DocuSign de l'utilisateur connecté ; le front y envoie le
 * navigateur. Même principe que /api/gmail/connect : le jeton Supabase voyage dans l'en-tête, pas
 * dans l'URL, et l'identifiant du profil est scellé dans le `state`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const profilId = await profilAppelant(authHeader)
  if (!profilId) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  // Origine réelle de l'appel : le callback y ramènera l'utilisateur, au lieu de le déposer sur le
  // domaine par défaut.
  const origine =
    typeof req.headers.origin === 'string'
      ? req.headers.origin
      : typeof req.headers.referer === 'string'
        ? new URL(req.headers.referer).origin
        : undefined

  // Page d'où part la connexion : on y ramène la personne après l'autorisation. Sans ça, quelqu'un
  // qui se connecte depuis un wizard de mandat atterrirait sur « Mon profil » et devrait tout
  // recommencer. Tools garde la même information dans sa table docusign_oauth_states.
  const retour = typeof req.query.retour === 'string' ? req.query.retour : undefined

  try {
    res.status(200).json({ url: buildAuthUrl(encodeState(profilId, origine, retour)) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Configuration DocuSign incomplète' })
  }
}
