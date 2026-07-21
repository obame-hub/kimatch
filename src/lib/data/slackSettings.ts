import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'

export type SlackModule = 'compte' | 'contrat'

export interface SlackSetting {
  module: SlackModule
  channel_id: string | null
  channel_name: string | null
  enabled: boolean
}

export interface SlackChannel {
  id: string
  name: string
  is_private?: boolean
}

const MOCK_SLACK_SETTINGS: SlackSetting[] = [
  { module: 'compte', channel_id: null, channel_name: null, enabled: false },
  { module: 'contrat', channel_id: null, channel_name: null, enabled: false },
]

async function fetchSlackSettings(): Promise<SlackSetting[]> {
  if (isDemoMode()) return MOCK_SLACK_SETTINGS
  try {
    const { data, error } = await supabase.from('parametres_slack').select('module, channel_id, channel_name, enabled').order('module')
    if (error) throw error
    return (data ?? []) as SlackSetting[]
  } catch (error) {
    console.error('fetchSlackSettings', error)
    return []
  }
}

export function useSlackSettings() {
  return useQuery({ queryKey: ['parametres_slack'], queryFn: fetchSlackSettings })
}

export function useUpdateSlackSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ module, patch }: { module: SlackModule; patch: Partial<Pick<SlackSetting, 'channel_id' | 'channel_name' | 'enabled'>> }) => {
      let persisted = false
      if (!isDemoMode()) {
        const { error } = await supabase.from('parametres_slack').update(patch).eq('module', module)
        persisted = !error
      }
      queryClient.setQueryData<SlackSetting[]>(['parametres_slack'], (old) =>
        old?.map((s) => (s.module === module ? { ...s, ...patch } : s)),
      )
      return { persisted }
    },
  })
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useSlackChannels() {
  return useQuery({
    queryKey: ['slack-channels'],
    queryFn: async (): Promise<{ channels: SlackChannel[]; publicOnly: boolean }> => {
      const res = await fetch('/api/slack/channels', { headers: await authHeader() })
      const data = (await res.json()) as { channels?: SlackChannel[]; publicOnly?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Erreur Slack')
      return { channels: data.channels ?? [], publicOnly: !!data.publicOnly }
    },
    enabled: !isDemoMode(),
    retry: false,
  })
}

interface NotifySlackInput {
  module: SlackModule
  text: string
  blocks?: unknown[]
}

/** Fire-and-forget : ne lève jamais, se contente de logger un avertissement. */
export async function notifySlack(input: NotifySlackInput): Promise<void> {
  if (isDemoMode()) return
  try {
    const headers = await authHeader()
    if (!headers.Authorization) return
    const res = await fetch('/api/slack/notify', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      console.warn('[slack] notify error', data?.error ?? res.statusText)
    }
  } catch (e) {
    console.warn('[slack] notify threw', e)
  }
}

export async function sendTestSlackMessage(module: SlackModule, text: string, blocks?: unknown[]): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const headers = await authHeader()
  if (!headers.Authorization) return { ok: false, error: 'Non authentifié (mode démo)' }
  const res = await fetch('/api/slack/notify', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ module, text, blocks }),
  })
  const data = (await res.json()) as { ok?: boolean; error?: string; skipped?: boolean }
  if (!res.ok || data.error) return { ok: false, error: data.error }
  return { ok: true, skipped: data.skipped }
}
