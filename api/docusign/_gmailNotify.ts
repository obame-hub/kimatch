// Email de récapitulatif à la signature d'un mandat, envoyé depuis un compte Gmail FIXE (celui
// de William, connecté une fois via Mon Profil) -- jamais depuis le compte du commercial qui a
// déclenché la synchro, pour éviter qu'un email parte "au hasard" depuis un compte perso (même
// règle que Tools). Le webhook n'a pas de session utilisateur : on ne peut pas passer par
// api/gmail/send.ts (gated sur un Bearer token Supabase Auth) -- on relit directement le token du
// profil fixe via le client service_role.
import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshAccessToken, sendGmailMessage } from '../gmail/_client.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

export type MandatEmailResult = { ok: true } | { ok: false; senderMissing: boolean; error: string }

export async function sendMandatSignedEmail(
  admin: Admin,
  input: { to: string; subject: string; text: string },
): Promise<MandatEmailResult> {
  const senderProfilEmail = process.env.MANDAT_EMAIL_SENDER_PROFIL
  if (!senderProfilEmail) {
    return { ok: false, senderMissing: true, error: 'MANDAT_EMAIL_SENDER_PROFIL non configurée' }
  }

  const { data: profil } = await admin.from('profils').select('id').eq('email', senderProfilEmail).maybeSingle()
  if (!profil) {
    return { ok: false, senderMissing: true, error: `Aucun profil Kimatch pour ${senderProfilEmail}` }
  }

  const { data: tokenRow } = await admin
    .from('profils_gmail_tokens')
    .select('email_gmail, refresh_token, access_token, access_token_expires_at')
    .eq('profil_id', profil.id)
    .maybeSingle()
  if (!tokenRow) {
    return { ok: false, senderMissing: true, error: `${senderProfilEmail} n'a pas connecté son compte Gmail (Mon Profil)` }
  }

  try {
    let accessToken = tokenRow.access_token as string
    const expiresAt = tokenRow.access_token_expires_at ? new Date(tokenRow.access_token_expires_at as string).getTime() : 0
    if (!expiresAt || expiresAt < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token as string)
      accessToken = refreshed.access_token
      await admin
        .from('profils_gmail_tokens')
        .update({ access_token: accessToken, access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() })
        .eq('profil_id', profil.id)
    }

    await sendGmailMessage(accessToken, { fromEmail: tokenRow.email_gmail as string, to: input.to, subject: input.subject, text: input.text })
    return { ok: true }
  } catch (e) {
    return { ok: false, senderMissing: false, error: e instanceof Error ? e.message : String(e) }
  }
}
