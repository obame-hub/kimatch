import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getScoreBySiren } from './_client.js'
import { exigerSession, refuserLesPartenaires } from '../_auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return

  /* UNE SESSION VALIDE N'EST PAS UN DROIT D'ACCES — 25/09/2026.
     Ellisphere est facture a KiWee a chaque appel, et rend des donnees d'entreprise achetees. */
  if (await refuserLesPartenaires(utilisateur, res)) return

  const siren = typeof req.query.siren === 'string' ? req.query.siren : undefined
  if (!siren) {
    res.status(400).json({ error: 'Paramètre "siren" requis' })
    return
  }

  try {
    const score = await getScoreBySiren(siren)
    res.status(200).json(score)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur Ellisphere inconnue' })
  }
}
