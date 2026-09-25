import type { VercelRequest, VercelResponse } from '@vercel/node'
import { searchByIdentifier, searchByName } from './_client.js'
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

  const siret = typeof req.query.siret === 'string' ? req.query.siret : undefined
  const name = typeof req.query.name === 'string' ? req.query.name : undefined

  try {
    if (siret) {
      const company = await searchByIdentifier(siret)
      res.status(200).json({ company })
      return
    }
    if (name) {
      const companies = await searchByName(name)
      res.status(200).json({ companies })
      return
    }
    res.status(400).json({ error: 'Paramètre "siret" ou "name" requis' })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur Ellisphere inconnue' })
  }
}
