import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listChannels } from './_client.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  try {
    const result = await listChannels()
    if ('error' in result) {
      res.status(502).json({ error: `Slack : ${result.error}` })
      return
    }
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur Slack inconnue' })
  }
}
