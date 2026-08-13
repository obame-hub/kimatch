import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService, decodeState, echangerCode, enregistrerSession, lireIdentite } from './_oauth.js'

/**
 * Retour de l'écran d'autorisation DocuSign : échange le code contre les jetons, lit le compte de
 * la personne, enregistre la session, et la ramène sur « Mon profil ».
 *
 * L'URL de cet endpoint doit figurer à l'identique dans les Redirect URIs de l'application DocuSign
 * (Settings > Apps and Keys) — sinon DocuSign refuse avant même d'afficher l'écran.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined
  const { profilId, appUrl } = decodeState(typeof req.query.state === 'string' ? req.query.state : undefined)
  const erreur = typeof req.query.error === 'string' ? req.query.error : undefined

  const echec = (raison: string) =>
    res.redirect(302, `${appUrl}/mon-profil?docusign=error&reason=${encodeURIComponent(raison)}`)

  if (erreur) return echec(erreur)
  // Pas de profil = `state` absent, mal signé, ou vieux de plus de quinze minutes. On n'écrit
  // aucune session dans ce cas : c'est précisément ce que la signature protège.
  if (!code || !profilId) return echec('state_invalide')

  try {
    const jetons = await echangerCode(code)
    const identite = await lireIdentite(jetons.access_token)
    await enregistrerSession(clientService(), profilId, identite, jetons)
    res.redirect(302, `${appUrl}/mon-profil?docusign=connected`)
  } catch (err) {
    echec(err instanceof Error ? err.message : 'inconnue')
  }
}
