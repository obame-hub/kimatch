import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchElecData } from './_client.js'
import { exigerSession, refuserLesPartenaires } from '../_auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return

  /* UNE SESSION VALIDE N'EST PAS UN DROIT D'ACCES — 25/09/2026.
     Enedis repond avec le certificat de KiWee : sans ce garde, n'importe quel PDL de France
     livrait ses donnees de comptage a un externe connecte. */
  if (await refuserLesPartenaires(utilisateur, res)) return

  const pdlId = typeof req.body?.pdlId === 'string' ? req.body.pdlId.trim() : undefined
  if (!pdlId) {
    res.status(400).json({ error: 'Paramètre "pdlId" requis' })
    return
  }

  try {
    const result = await fetchElecData(pdlId)
    res.status(200).json(result)
  } catch (err) {
    res.status(200).json({ success: false, error: err instanceof Error ? err.message : 'Erreur Enedis inconnue' })
  }
}
