import type { VercelRequest, VercelResponse } from '@vercel/node'

// Indique si la signature électronique est utilisable, pour que le wizard Mandat puisse prévenir
// AVANT de faire remplir 4 étapes (Tools affiche un écran « Connexion requise » avant de démarrer).
// Ne renvoie jamais la valeur des secrets, seulement leur présence.
const REQUIS = ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_RSA_PRIVATE_KEY', 'DOCUSIGN_ACCOUNT_ID'] as const

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const manquants = REQUIS.filter((n) => !process.env[n])
  res.status(200).json({ configured: manquants.length === 0, manquants })
}
