import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { postMessage, joinChannel } from './_client.js'

interface NotifyBody {
  module?: string
  text?: string
  blocks?: unknown[]
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

  const body = req.body as NotifyBody
  if (!body?.module || !body?.text) {
    res.status(400).json({ error: 'module et text requis' })
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

  try {
    const { data: cfg, error: cfgError } = await supabase
      .from('parametres_slack')
      .select('channel_id, enabled')
      .eq('module', body.module)
      .maybeSingle()

    if (cfgError) {
      res.status(502).json({ error: cfgError.message })
      return
    }
    if (!cfg?.enabled || !cfg.channel_id) {
      res.status(200).json({ skipped: true, reason: 'module désactivé ou aucun canal configuré' })
      return
    }

    let result = await postMessage(cfg.channel_id, body.text, body.blocks)
    if (!result.ok && result.error === 'not_in_channel') {
      const join = await joinChannel(cfg.channel_id)
      if (join.ok) {
        result = await postMessage(cfg.channel_id, body.text, body.blocks)
      } else {
        res.status(502).json({
          error: "Le bot n'est pas membre du canal Slack sélectionné.",
          action: 'Dans Slack, ouvrez le canal puis lancez /invite @KiWee OS, ou choisissez un canal public.',
        })
        return
      }
    }
    if (!result.ok) {
      res.status(502).json({ error: `Slack a renvoyé l'erreur ${result.error}.` })
      return
    }
    res.status(200).json({ ok: true, ts: result.ts })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur inconnue' })
  }
}
