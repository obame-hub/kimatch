import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Indique si l'APPLICATION DocuSign est configurée côté serveur — pas si l'utilisateur est
 * connecté : depuis le passage à une session par utilisateur (13/08/2026), la connexion
 * individuelle se lit dans la vue docusign_connexions, directement par le front.
 *
 * Sert au wizard Mandat pour prévenir AVANT de faire remplir quatre étapes (Tools affiche un écran
 * « Connexion requise » équivalent). Ne renvoie jamais la valeur d'un secret, seulement sa présence
 * et sa plausibilité.
 */
const REQUIS = ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_SECRET_KEY'] as const

/**
 * Une Integration Key et une clé secrète DocuSign sont des GUID : 36 caractères.
 *
 * Ce contrôle n'est pas théorique. Le 13/08/2026, DOCUSIGN_RSA_PRIVATE_KEY contenait une valeur de
 * 36 caractères — un identifiant collé dans le champ d'une clé privée. Vérifier la seule présence
 * d'une variable annonçait « configuré », le wizard laissait remplir ses quatre étapes, créait le
 * mandat, et n'échouait qu'à l'ouverture de DocuSign. Le même piège existe en sens inverse : une
 * clé secrète tronquée par un copier-coller passerait pour présente.
 */
const LONGUEUR_GUID = 36

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const manquants: string[] = []
  const invalides: { variable: string; raison: string }[] = []

  for (const nom of REQUIS) {
    const valeur = (process.env[nom] ?? '').trim()
    if (!valeur) {
      manquants.push(nom)
      continue
    }
    if (valeur.length !== LONGUEUR_GUID) {
      invalides.push({
        variable: nom,
        // La longueur ne révèle pas le secret, mais suffit à distinguer un identifiant valide
        // d'une valeur tronquée ou d'un collage malheureux.
        raison: `${valeur.length} caractères au lieu de ${LONGUEUR_GUID} : DocuSign donne un identifiant de la forme 8-4-4-4-12. Vérifiez la valeur dans Settings > Apps and Keys.`,
      })
    }
  }

  const base = process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com'
  const environnement = base.includes('account-d.docusign.com') ? 'demonstration' : 'production'

  res.status(200).json({
    configured: manquants.length === 0 && invalides.length === 0,
    manquants,
    invalides,
    // Affiché dans « Mon profil » : une signature partie de l'environnement de démonstration n'a
    // aucune valeur juridique et l'e-mail reçu par le client porte la mention DEMO. Le distinguer
    // évite de le découvrir après coup.
    environnement,
    empreinte: {
      integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY ?? null,
      baseUrl: base,
      redirectUri: process.env.DOCUSIGN_OAUTH_REDIRECT_URI ?? 'https://kimatch.fr/api/docusign/callback (défaut)',
      accountId: process.env.DOCUSIGN_ACCOUNT_ID ?? null,
    },
  })
}
