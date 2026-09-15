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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LIRE L'HISTORIQUE D'UN CANAL
   ════════════════════════════════════════════════════════════════════════════════════════════════

   Ajouté le 15/09/2026 pour créer une piste à chaque lead annoncé dans #leads.

   POURQUOI LIRE PLUTÔT QU'ÊTRE PRÉVENU. Le plan A était un workflow Slack appelant Kimatch à
   chaque message. L'étape « envoyer une requête web » n'existe pas dans le forfait Pro de KiWee —
   les étapes voisines portent une pastille BUSINESS+, et la recherche ne rend rien. On relit donc
   le canal nous-mêmes.

   CE N'EST PAS UN PIS-ALLER. La relecture sait faire une chose que la notification ne saura jamais :
   rattraper le passé. Les leads déjà dans le canal entrent au premier passage. */

export interface MessageSlack {
  /** L'horodatage, unique dans un canal : c'est la clé d'idempotence. */
  ts: string
  texte: string
  /** Vrai quand le message vient d'une application — le cas de « Kiwee Énergie ». */
  deUneApp: boolean
}

/**
 * Les messages d'un canal, du plus récent au plus ancien.
 *
 * `oldest` évite de relire tout l'historique à chaque passage : on repart du dernier message déjà
 * traité. Sans lui, un canal de mille messages en redemanderait mille toutes les dix minutes.
 */
export async function lireCanal(
  channel: string,
  options: { depuis?: string; limite?: number } = {},
): Promise<{ messages: MessageSlack[] } | { error: string }> {
  const params = new URLSearchParams({ channel, limit: String(options.limite ?? 100) })
  if (options.depuis) params.set('oldest', options.depuis)

  const res = await fetch(`${SLACK_API}/conversations.history?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
  })
  const d = (await res.json()) as {
    ok: boolean
    error?: string
    messages?: { ts: string; text?: string; subtype?: string; bot_id?: string; app_id?: string; blocks?: unknown[] }[]
  }
  if (!d.ok) return { error: d.error ?? 'unknown_error' }

  return {
    messages: (d.messages ?? [])
      /* LES ARRIVÉES ET DÉPARTS NE SONT PAS DES MESSAGES. Slack les livre dans le même flux, avec
         un `subtype` ; les garder ferait autant de tentatives de lecture vouées à l'échec. */
      .filter((m) => !m.subtype || m.subtype === 'bot_message')
      .map((m) => ({
        ts: m.ts,
        /* Le texte d'un message d'app peut vivre dans ses blocs plutôt que dans `text`. On
           reconstitue alors à partir des blocs, sans quoi l'analyse recevrait une chaîne vide et
           conclurait « ce n'est pas un lead » sur un vrai lead. */
        texte: (m.text && m.text.trim()) || texteDesBlocs(m.blocks),
        deUneApp: Boolean(m.bot_id || m.app_id),
      }))
      .filter((m) => m.texte),
  }
}

/** Le texte lisible d'une pile de blocs Slack, quand `text` est vide. */
function texteDesBlocs(blocs: unknown): string {
  if (!Array.isArray(blocs)) return ''
  const morceaux: string[] = []
  const parcourir = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (typeof o.text === 'string') morceaux.push(o.text)
    else if (o.text) parcourir(o.text)
    for (const cle of ['elements', 'fields']) {
      const v = o[cle]
      if (Array.isArray(v)) v.forEach(parcourir)
    }
  }
  blocs.forEach(parcourir)
  return morceaux.join('\n').trim()
}
