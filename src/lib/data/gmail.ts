import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface GmailConnection {
  email_gmail: string
  date_connexion: string
  /**
   * Ce compte permet-il de LIRE les réponses, ou seulement d'envoyer ?
   *
   * `null` = on n'a pas encore essayé (la tâche de rapatriement passe toutes les heures ouvrées).
   * `false` = Google a refusé : la connexion date d'avant le 14/09/2026, quand Kimatch ne
   * demandait que le droit d'envoyer. Un jeton ne gagne pas un droit après coup — il faut refaire
   * la connexion, et c'est ce que l'écran doit dire au lieu de laisser croire que tout va bien.
   */
  lecture_autorisee: boolean | null
  date_dernier_rapatriement: string | null
}

async function fetchGmailConnection(): Promise<GmailConnection | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase
    .from('profils_gmail_tokens')
    .select('email_gmail, date_connexion, lecture_autorisee, date_dernier_rapatriement')
    .eq('profil_id', userData.user.id)
    .maybeSingle()
  if (error) return null
  return data as GmailConnection | null
}

export function useGmailConnection() {
  return useQuery({ queryKey: ['gmail-connection'], queryFn: fetchGmailConnection })
}

export async function connectGmail(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour lier Gmail.')

  const res = await fetch('/api/gmail/connect', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const result = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !result.url) throw new Error(result.error ?? 'Impossible de démarrer la connexion Gmail')
  window.location.href = result.url
}

export function useDisconnectGmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Non authentifié')
      const { error } = await supabase.from('profils_gmail_tokens').delete().eq('profil_id', userData.user.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['gmail-connection'] }) },
  })
}

interface SendEmailInput {
  to: string
  subject: string
  text: string
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour envoyer un email.')

  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const result = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok || !result.ok) throw new Error(result.error ?? 'Erreur Gmail inconnue')
}
