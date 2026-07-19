const SLACK_API = 'https://slack.com/api'

function token(): string {
  const t = process.env.SLACK_BOT_TOKEN
  if (!t) throw new Error('SLACK_BOT_TOKEN non configuré')
  return t
}

async function call<T = Record<string, unknown>>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

interface SlackPostResult {
  ok: boolean
  ts?: string
  error?: string
}

export async function postMessage(channel: string, text: string, blocks?: unknown[]): Promise<SlackPostResult> {
  return call<SlackPostResult>('chat.postMessage', { channel, text, blocks, unfurl_links: false })
}

export async function joinChannel(channel: string): Promise<{ ok: boolean; error?: string }> {
  return call('conversations.join', { channel })
}

export interface SlackChannel {
  id: string
  name: string
  is_private?: boolean
}

export async function listChannels(): Promise<{ channels: SlackChannel[]; publicOnly: boolean } | { error: string }> {
  async function fetchPage(types: string): Promise<{ channels: SlackChannel[] } | { error: string }> {
    const out: SlackChannel[] = []
    let cursor = ''
    do {
      const params = new URLSearchParams({ limit: '200', exclude_archived: 'true', types })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`${SLACK_API}/conversations.list?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
      })
      const d = (await res.json()) as { ok: boolean; error?: string; channels?: SlackChannel[]; response_metadata?: { next_cursor?: string } }
      if (!d.ok) return { error: d.error ?? 'unknown_error' }
      for (const c of d.channels ?? []) out.push({ id: c.id, name: c.name, is_private: c.is_private })
      cursor = d.response_metadata?.next_cursor || ''
    } while (cursor)
    return { channels: out }
  }

  let result = await fetchPage('public_channel,private_channel')
  let publicOnly = false
  if ('error' in result) {
    const fallback = await fetchPage('public_channel')
    if ('error' in fallback) return { error: fallback.error }
    result = fallback
    publicOnly = true
  }
  result.channels.sort((a, b) => a.name.localeCompare(b.name))
  return { channels: result.channels, publicOnly }
}
