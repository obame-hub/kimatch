import type { VercelRequest, VercelResponse } from '@vercel/node'

// Indique si la signature électronique est utilisable, pour que le wizard Mandat puisse prévenir
// AVANT de faire remplir 4 étapes (Tools affiche un écran « Connexion requise » avant de démarrer).
// Ne renvoie jamais la valeur des secrets, seulement leur présence et leur plausibilité.
// DOCUSIGN_ACCOUNT_ID n'y figure plus : le compte par defaut de l'utilisateur suffit, la variable
// ne sert qu'a en designer un autre (voir getDocusignContext).
const REQUIS = ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID'] as const

/** La clé accepte deux formes : en clair, ou en base64 sur une ligne (voir _client.ts). L'une ou
 *  l'autre suffit — sans cette souplesse, l'écran annoncerait « non configuré » alors que la
 *  signature fonctionne, et le garde-fou du wizard bloquerait la création de mandat. */
const CLE_PRIVEE = ['DOCUSIGN_RSA_PRIVATE_KEY', 'DOCUSIGN_RSA_PRIVATE_KEY_B64'] as const

/**
 * Une clé RSA 2048 fait environ 1700 caractères en PEM, 1600 en base64 nu. En dessous de 500, ce
 * n'est pas une clé.
 *
 * Ce contrôle n'est pas théorique : le 13/08/2026, DOCUSIGN_RSA_PRIVATE_KEY contenait une valeur de
 * 36 caractères — la longueur d'un GUID, donc un identifiant collé dans le mauvais champ. Vérifier
 * la seule présence de la variable annonçait « configuré », le wizard laissait remplir ses quatre
 * étapes, créait le mandat, et n'échouait qu'à l'ouverture de DocuSign.
 */
const LONGUEUR_MINIMALE_CLE = 500

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const manquants: string[] = REQUIS.filter((n) => !process.env[n])

  const nomCle = CLE_PRIVEE.find((n) => process.env[n])
  const invalides: { variable: string; raison: string }[] = []

  if (!nomCle) {
    manquants.push('DOCUSIGN_RSA_PRIVATE_KEY')
  } else {
    const valeur = (process.env[nomCle] ?? '').trim()
    if (valeur.length < LONGUEUR_MINIMALE_CLE) {
      invalides.push({
        variable: nomCle,
        // La longueur ne révèle pas le secret, mais suffit à distinguer une clé d'un identifiant.
        raison: `${valeur.length} caractères : trop court pour une clé RSA. Une clé privée en fait plus de mille. Cette variable contient probablement un identifiant (Integration Key ou User ID) collé par erreur.`,
      })
    } else if (nomCle === 'DOCUSIGN_RSA_PRIVATE_KEY' && !valeur.includes('PRIVATE KEY')) {
      invalides.push({
        variable: nomCle,
        raison: 'aucun marqueur « PRIVATE KEY » : la valeur n’est pas un PEM. Collez le bloc complet, en-têtes compris, ou utilisez DOCUSIGN_RSA_PRIVATE_KEY_B64.',
      })
    }
  }

  /**
   * Empreinte de configuration, pour diagnostiquer « invalid_grant : no_valid_keys_or_signatures ».
   *
   * Cette erreur signifie que DocuSign a bien reçu un JWT signé mais qu'aucune clé publique
   * enregistrée ne valide la signature. Deux causes possibles, indiscernables depuis l'application :
   * la clé privée n'appartient pas à cette application, ou l'Integration Key désigne une autre
   * application que celle où la clé a été générée.
   *
   * Ce qui est renvoyé ici n'est pas secret : l'Integration Key est un identifiant public — c'est
   * l'équivalent d'un client_id, et DocuSign l'affiche en clair dans son interface. La clé privée,
   * elle, n'est décrite que par sa longueur et la présence de ses en-têtes.
   */
  const empreinte = {
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY ?? null,
    // L'User ID n'est pas secret non plus, mais on n'en montre que le début : il suffit à vérifier
    // la concordance avec l'API Username affiché dans DocuSign.
    userIdDebut: (process.env.DOCUSIGN_USER_ID ?? '').slice(0, 8) || null,
    accountId: process.env.DOCUSIGN_ACCOUNT_ID ?? null,
    baseUrl: process.env.DOCUSIGN_BASE_URL ?? 'https://account-d.docusign.com (défaut)',
    cle: nomCle
      ? {
          variable: nomCle,
          longueur: (process.env[nomCle] ?? '').trim().length,
          aLesEnTetes: (process.env[nomCle] ?? '').includes('PRIVATE KEY'),
        }
      : null,
  }

  res.status(200).json({
    configured: manquants.length === 0 && invalides.length === 0,
    manquants,
    invalides,
    empreinte,
  })
}
