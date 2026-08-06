import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { buildGoogleAuthUrl, encodeState } from './_client.js'

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error } = await supabase.auth.getUser()
  if (error || !userData.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  // Origine réelle de l'appel (kimatch.fr, www.kimatch.fr…) : le callback y renverra l'utilisateur
  // au lieu de le déposer systématiquement sur le domaine Vercel par défaut.
  const origine = typeof req.headers.origin === 'string'
    ? req.headers.origin
    : typeof req.headers.referer === 'string'
      ? new URL(req.headers.referer).origin
      : undefined

  const url = buildGoogleAuthUrl(encodeState(userData.user.id, origine))
  res.status(200).json({ url })
}
