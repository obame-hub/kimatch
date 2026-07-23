import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const ORIGINAL_SESSION_KEY = 'kiwee-original-session'
const IMPERSONATING_KEY = 'kiwee-impersonating'

export interface ImpersonationInfo {
  adminEmail: string
  targetNom: string
  targetEmail: string
}

export function getImpersonationInfo(): ImpersonationInfo | null {
  const raw = sessionStorage.getItem(IMPERSONATING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ImpersonationInfo
  } catch {
    return null
  }
}

export function useImpersonateProfil() {
  return useMutation({
    mutationFn: async ({ profilId, nom }: { profilId: string; nom: string }) => {
      const { data: sessionData } = await supabase.auth.getSession()
      const currentSession = sessionData.session
      if (!currentSession) throw new Error('Non authentifié')

      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentSession.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProfilId: profilId }),
      })
      const result = (await res.json()) as { tokenHash?: string; email?: string; error?: string }
      if (!res.ok || !result.tokenHash || !result.email) {
        throw new Error(result.error ?? 'Erreur inconnue')
      }

      sessionStorage.setItem(
        ORIGINAL_SESSION_KEY,
        JSON.stringify({ access_token: currentSession.access_token, refresh_token: currentSession.refresh_token }),
      )
      sessionStorage.setItem(
        IMPERSONATING_KEY,
        JSON.stringify({ adminEmail: currentSession.user.email ?? '', targetNom: nom, targetEmail: result.email }),
      )

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: 'magiclink' })
      if (verifyError) {
        sessionStorage.removeItem(ORIGINAL_SESSION_KEY)
        sessionStorage.removeItem(IMPERSONATING_KEY)
        throw new Error(verifyError.message)
      }
    },
    onSuccess: () => {
      window.location.href = '/'
    },
  })
}

export async function stopImpersonating() {
  const raw = sessionStorage.getItem(ORIGINAL_SESSION_KEY)
  sessionStorage.removeItem(IMPERSONATING_KEY)
  sessionStorage.removeItem(ORIGINAL_SESSION_KEY)
  if (!raw) {
    window.location.href = '/login'
    return
  }
  const { access_token, refresh_token } = JSON.parse(raw) as { access_token: string; refresh_token: string }
  await supabase.auth.setSession({ access_token, refresh_token })
  window.location.href = '/'
}
