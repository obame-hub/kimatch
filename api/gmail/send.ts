import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { refreshAccessToken, sendGmailMessage } from './_client.js'

interface SendBody {
  to?: string
  subject?: string
  text?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const body = req.body as SendBody
  if (!body?.to || !body.subject || !body.text) {
    res.status(400).json({ error: 'to, subject et text sont requis' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Supabase non configuré côté serveur' })
    return
  }

  const supabaseAuthed = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAuthed.auth.getUser()
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: tokenRow, error: tokenError } = await supabase
    .from('profils_gmail_tokens')
    .select('email_gmail, refresh_token, access_token, access_token_expires_at')
    .eq('profil_id', userData.user.id)
    .maybeSingle()

  if (tokenError) {
    res.status(502).json({ error: tokenError.message })
    return
  }
  if (!tokenRow) {
    res.status(400).json({ error: 'Aucun compte Gmail connecté. Connecte ton compte dans Paramètres.' })
    return
  }

  try {
    let accessToken = tokenRow.access_token as string | null
    const expiresAt = tokenRow.access_token_expires_at ? new Date(tokenRow.access_token_expires_at as string).getTime() : 0
    if (!accessToken || expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token as string)
      accessToken = refreshed.access_token
      await supabase
        .from('profils_gmail_tokens')
        .update({
          access_token: accessToken,
          access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq('profil_id', userData.user.id)
    }

    const result = await sendGmailMessage(accessToken, {
      fromEmail: tokenRow.email_gmail as string,
      to: body.to,
      subject: body.subject,
      text: body.text,
    })
    res.status(200).json({ ok: true, id: result.id })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur Gmail inconnue' })
  }
}
