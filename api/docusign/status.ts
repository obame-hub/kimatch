import type { VercelRequest, VercelResponse } from '@vercel/node'

// Indique si la signature électronique est utilisable, pour que le wizard Mandat puisse prévenir
// AVANT de faire remplir 4 étapes (Tools affiche un écran « Connexion requise » avant de démarrer).
// Ne renvoie jamais la valeur des secrets, seulement leur présence.
const REQUIS = ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_ACCOUNT_ID'] as const

/** La clé accepte deux formes : en clair, ou en base64 sur une ligne (voir _client.ts). L'une ou
 *  l'autre suffit — sans cette souplesse, l'écran annoncerait « non configuré » alors que la
 *  signature fonctionne, et le garde-fou du wizard bloquerait la création de mandat. */
const CLE_PRIVEE = ['DOCUSIGN_RSA_PRIVATE_KEY', 'DOCUSIGN_RSA_PRIVATE_KEY_B64'] as const

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const manquants: string[] = REQUIS.filter((n) => !process.env[n])
  if (!CLE_PRIVEE.some((n) => process.env[n])) manquants.push('DOCUSIGN_RSA_PRIVATE_KEY')
  res.status(200).json({ configured: manquants.length === 0, manquants })
}
