import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchGazData } from './_client.js'
import { exigerSession } from '../_auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return

  const pce = typeof req.body?.pce === 'string' ? req.body.pce.trim() : undefined
  const codePostal = typeof req.body?.codePostal === 'string' ? req.body.codePostal.trim() : undefined
  if (!pce || !codePostal) {
    res.status(400).json({ error: 'Paramètres "pce" et "codePostal" requis' })
    return
  }

  try {
    const result = await fetchGazData(pce, codePostal)
    res.status(200).json(result)
  } catch (err) {
    res.status(200).json({ success: false, error: err instanceof Error ? err.message : 'Erreur GRD inconnue' })
  }
}
