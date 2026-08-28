import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { authHeader } from '@/lib/data/authHeader'

export type SlackModule = 'compte' | 'contrat' | 'mandat'

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

async function fetchSlackSettings(): Promise<SlackSetting[]> {
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
      const { error } = await supabase.from('parametres_slack').update(patch).eq('module', module)
      const persisted = !error
      queryClient.setQueryData<SlackSetting[]>(['parametres_slack'], (old) =>
        old?.map((s) => (s.module === module ? { ...s, ...patch } : s)),
      )
      return { persisted }
    },
  })
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
  if (!headers.Authorization) return { ok: false, error: 'Non authentifié' }
  const res = await fetch('/api/slack/notify', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ module, text, blocks }),
  })
  const data = (await res.json()) as { ok?: boolean; error?: string; skipped?: boolean }
  if (!res.ok || data.error) return { ok: false, error: data.error }
  return { ok: true, skipped: data.skipped }
}
