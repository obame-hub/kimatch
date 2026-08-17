import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Dépôt d'une demande de support Kimatch dans Pilot.
 *
 * POURQUOI PASSER PAR UNE FONCTION SERVEUR plutôt qu'appeler Pilot depuis le navigateur :
 * l'appel exige une clé d'API (`x-api-key`). Toute variable lue côté client dans ce projet est
 * préfixée `VITE_` et se retrouve **en clair dans le bundle** — n'importe qui ouvrant les outils
 * de développement sur kimatch.fr pourrait la lire et déposer des demandes chez Pilot en notre
 * nom. La clé reste donc ici, côté serveur, et le navigateur ne parle qu'à Kimatch.
 *
 * VARIABLES D'ENVIRONNEMENT À POSER SUR VERCEL (par Naoëlle, je ne saisis aucun secret) :
 *   PILOT_API_KEY   la clé fournie par Pilot
 *   PILOT_BASE_URL  https://pilot-flow-control.lovable.app
 *                   (en préversion : https://id-preview--14eacd4e-7d81-4747-9c39-bfac19426647.lovable.app)
 *                   Mise en variable et non codée en dur, pour basculer preview/prod sans
 *                   redéploiement de code.
 */

const CHEMIN_INTAKE = '/api/public/intake'

interface CorpsRecu {
  type?: 'bug' | 'evolution'
  titre?: string
  description?: string | null
  auteurNom?: string | null
  demandeId?: string
}

/**
 * Traduction Kimatch → Pilot.
 *
 * ⚠ À CONFIRMER contre `docs/integration.md` du projet Pilot (demandé à Naoëlle le 16/08/2026,
 * avec un exemple curl). Les noms de champs ci-dessous sont une hypothèse de travail : tant
 * qu'ils ne sont pas validés, cette fonction n'est appelée par AUCUN écran — le tuyau est posé,
 * pas ouvert. Une seule fonction à corriger le jour où le contrat est connu.
 */
function versPilot(recu: CorpsRecu): Record<string, unknown> {
  return {
    titre: recu.titre,
    description: recu.description ?? '',
    // « bug » et « evolution » sont le vocabulaire de `demandes_support` en base Kimatch.
    type: recu.type,
    source: 'kimatch',
    // De quoi retrouver la demande d'origine sans rapprocher par le titre — le travers qui a
    // coûté cher sur les 1352 id_salesforce contenant le nom au lieu de l'identifiant.
    reference_externe: recu.demandeId,
    demandeur: recu.auteurNom ?? null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  // Même garde que les autres fonctions du projet : seul un utilisateur Kimatch connecté peut
  // déclencher un dépôt. Sans cela, l'endpoint deviendrait un relais ouvert vers Pilot.
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  const cle = process.env.PILOT_API_KEY
  const base = process.env.PILOT_BASE_URL
  if (!cle || !base) {
    res.status(500).json({ error: 'Pilot non configuré : PILOT_API_KEY et PILOT_BASE_URL manquent côté serveur.' })
    return
  }

  const recu = req.body as CorpsRecu
  if (!recu?.titre?.trim()) {
    res.status(400).json({ error: 'titre requis' })
    return
  }

  try {
    const reponse = await fetch(`${base.replace(/\/$/, '')}${CHEMIN_INTAKE}`, {
      method: 'POST',
      headers: {
        'x-api-key': cle,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(versPilot(recu)),
    })

    // Le corps est renvoyé tel quel : si le contrat diffère de l'hypothèse ci-dessus, on veut
    // lire le message d'erreur de Pilot mot pour mot, pas un « échec » générique.
    const texte = await reponse.text()
    let corps: unknown
    try { corps = JSON.parse(texte) } catch { corps = { brut: texte } }

    if (!reponse.ok) {
      res.status(502).json({ error: `Pilot a répondu ${reponse.status}`, reponsePilot: corps })
      return
    }
    res.status(200).json({ ok: true, reponsePilot: corps })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Appel à Pilot impossible' })
  }
}
