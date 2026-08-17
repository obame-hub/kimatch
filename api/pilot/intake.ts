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
 *   PILOT_API_KEY   la clé `pilot_...` créée dans Pilot → Paramètres → Intégrations.
 *                   Elle ne s'affiche qu'une seule fois (stockée hachée côté Pilot).
 *   PILOT_BASE_URL  https://pilot-flow-control.lovable.app
 *                   (préversion : https://id-preview--14eacd4e-7d81-4747-9c39-bfac19426647.lovable.app)
 *                   Mise en variable et non codée en dur, pour basculer preview/prod sans
 *                   redéploiement de code.
 *
 * Contrat confirmé le 16/08/2026 (exemple curl fourni par Pilot).
 */

const CHEMIN_INTAKE = '/api/public/intake'

/** Bornes imposées par Pilot : 422 `corps_invalide` en dehors. */
const TITRE_MIN = 3
const TITRE_MAX = 200

interface CorpsRecu {
  /** Identifiant de la demande dans `demandes_support`. Sert de clé d'idempotence. */
  demandeId?: string
  type?: 'bug' | 'evolution'
  titre?: string
  description?: string | null
  auteurNom?: string | null
  auteurEmail?: string | null
}

interface DemandePilot {
  source_id: string
  titre: string
  description: string
  demandeur: { nom: string; email?: string; service?: string }
  impact: 'faible' | 'moyen' | 'fort'
  urgence: 'faible' | 'moyen' | 'fort'
  meta: Record<string, unknown>
}

/**
 * Traduction Kimatch → Pilot.
 *
 * `impact` et `urgence` restent sur « moyen », le défaut de Pilot, pour les deux types de
 * demande. Kimatch ne demande pas la gravité à l'utilisateur : la déduire du type (« un bug est
 * urgent, une évolution non ») serait une invention, et une priorité inventée est pire qu'une
 * priorité par défaut — elle a l'air d'un arbitrage. Le tri se fait dans Pilot, qui est fait pour
 * ça. Le jour où le formulaire Kimatch demandera la gravité, elle passera telle quelle.
 *
 * Le type (bug / évolution) part dans `meta.categorie`, où il reste exploitable sans se déguiser
 * en priorité.
 */
function versPilot(recu: CorpsRecu, titre: string): DemandePilot {
  return {
    // Idempotent chez Pilot : renvoyer la même demande rend 200 au lieu de 201, sans doublon.
    // C'est ce qui permet de rejouer un dépôt qui avait échoué sans risque.
    source_id: recu.demandeId as string,
    titre,
    description: (recu.description ?? '').trim(),
    demandeur: {
      nom: (recu.auteurNom as string).trim(),
      ...(recu.auteurEmail ? { email: recu.auteurEmail } : {}),
      service: 'KiWee Énergie — Kimatch',
    },
    impact: 'moyen',
    urgence: 'moyen',
    meta: {
      categorie: recu.type === 'evolution' ? 'evolution' : 'bug',
      // De quoi ouvrir la demande d'origine d'un clic depuis Pilot.
      url: `https://kimatch.fr/support?demande=${encodeURIComponent(recu.demandeId as string)}`,
      outil: 'kimatch',
    },
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

  // Les trois champs obligatoires sont vérifiés ICI plutôt que d'attendre le 422 de Pilot : un
  // aller-retour réseau pour apprendre qu'un titre est vide n'apprend rien à personne.
  if (!recu?.demandeId) {
    res.status(400).json({ error: 'demandeId requis (il sert de clé d’idempotence chez Pilot)' })
    return
  }
  if (!recu?.auteurNom?.trim()) {
    res.status(400).json({ error: 'auteurNom requis' })
    return
  }
  const titreBrut = (recu.titre ?? '').trim()
  if (titreBrut.length < TITRE_MIN) {
    res.status(400).json({ error: `titre trop court : ${TITRE_MIN} caractères minimum` })
    return
  }
  // Tronqué et non refusé : un titre un peu long ne doit pas faire perdre le signalement d'un
  // utilisateur. La description, elle, n'est pas bornée par le contrat et garde tout le détail.
  const titre = titreBrut.length > TITRE_MAX ? titreBrut.slice(0, TITRE_MAX) : titreBrut

  try {
    const reponse = await fetch(`${base.replace(/\/$/, '')}${CHEMIN_INTAKE}`, {
      method: 'POST',
      headers: {
        'x-api-key': cle,
        'content-type': 'application/json',
      },
      body: JSON.stringify(versPilot(recu, titre)),
    })

    const texte = await reponse.text()
    let corps: Record<string, unknown>
    try { corps = JSON.parse(texte) as Record<string, unknown> } catch { corps = { brut: texte } }

    if (reponse.ok) {
      // 201 = créée, 200 = déjà connue (idempotent sur source_id) : les deux sont des succès.
      res.status(200).json({ ok: true, deja_connue: reponse.status === 200, ...corps })
      return
    }

    // Les codes documentés par Pilot sont distingués : « réessayer plus tard » et « la clé est
    // mauvaise » demandent deux gestes très différents, et un « échec » générique les confondrait.
    const messages: Record<number, string> = {
      401: 'Clé Pilot invalide, inconnue ou désactivée — à renouveler dans Pilot → Paramètres → Intégrations.',
      422: 'Pilot a refusé le contenu de la demande.',
      429: `Plafond d’appels Pilot atteint (${(corps as { plafond_par_minute?: number }).plafond_par_minute ?? 60}/minute) — à rejouer plus tard.`,
      500: 'Erreur interne côté Pilot.',
    }
    res.status(502).json({
      error: messages[reponse.status] ?? `Pilot a répondu ${reponse.status}`,
      statutPilot: reponse.status,
      // Renvoyé tel quel : sur un 422, `champs` dit exactement quel champ pose problème.
      reponsePilot: corps,
      rejouable: reponse.status === 429 || reponse.status >= 500,
    })
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : 'Appel à Pilot impossible',
      rejouable: true,
    })
  }
}
