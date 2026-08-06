import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { exchangeCodeForTokens, getGoogleUserEmail, decodeState } from './_client.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  // L'origine de départ voyage dans le `state` : on ramène l'utilisateur sur le domaine qu'il
  // utilisait (kimatch.fr), pas sur une URL codée en dur.
  const { profilId, appUrl: APP_URL } = decodeState(typeof req.query.state === 'string' ? req.query.state : undefined)
  const errorParam = typeof req.query.error === 'string' ? req.query.error : undefined

  if (errorParam) {
    res.redirect(302, `${APP_URL}/parametres?gmail=error&reason=${encodeURIComponent(errorParam)}`)
    return
  }
  if (!code || !profilId) {
    res.redirect(302, `${APP_URL}/parametres?gmail=error&reason=missing_params`)
    return
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      res.redirect(302, `${APP_URL}/parametres?gmail=error&reason=no_refresh_token`)
      return
    }
    const email = await getGoogleUserEmail(tokens.access_token)

    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service role non configuré')
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    const { error: upsertError } = await supabase.from('profils_gmail_tokens').upsert({
      profil_id: profilId,
      email_gmail: email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      date_connexion: new Date().toISOString(),
    })
    if (upsertError) throw new Error(upsertError.message)

    res.redirect(302, `${APP_URL}/parametres?gmail=connected`)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown'
    res.redirect(302, `${APP_URL}/parametres?gmail=error&reason=${encodeURIComponent(reason)}`)
  }
}
