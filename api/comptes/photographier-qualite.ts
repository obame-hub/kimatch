import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService } from '../docusign/_oauth.js'

/**
 * Relève chaque nuit les scores de qualité de compte qui ont changé.
 *
 * William, 11/09/2026 : la carte du score doit montrer « l'évolution du score par rapport au dernier
 * score enregistré » et sa tendance. Or `v_qualite_compte` est une vue : le score se recalcule à
 * chaque lecture et rien n'en gardait la trace. Cette tâche est la mémoire qui manquait.
 *
 * ── ELLE N'ÉCRIT QUE LES CHANGEMENTS ──
 *
 * `photographier_qualite_comptes()` compare le score courant de chaque compte à son dernier relevé
 * et n'insère que les différents. Une nuit ordinaire écrit donc quelques lignes, pas 2 723 — et
 * « le dernier score enregistré » garde son sens littéral : le dernier score DIFFÉRENT.
 *
 * ── POURQUOI VERCEL ET NON pg_cron ──
 *
 * L'extension est disponible mais non installée sur cette base, et Vercel fait déjà tourner cinq
 * tâches nocturnes. Ouvrir un second mécanisme de planification pour une sixième tâche coûterait
 * plus que de suivre le premier — c'est le même raisonnement que pour l'expiration des mandats.
 *
 * ── L'HEURE : 3 H 30 ──
 *
 * Après l'expiration des mandats (3 h 15) et avant la réévaluation des statuts de contrat (3 h 45).
 * L'ordre compte : ces deux tâches font bouger des contrats, donc des scores de compteur, donc le
 * score du compte. Photographier avant elles relèverait l'état de la veille.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LA GARDE. `CRON_SECRET` d'abord, l'en-tête ensuite — et l'en-tête seul ne protège rien :
     n'importe qui peut poser `x-vercel-cron` sur une requête, Vercel ne le filtre pas (vérifié le
     21/08/2026 au curl). La barrière réelle est le secret ; l'en-tête n'est là que pour ne pas
     casser la planification tant qu'il n'est pas défini, et ce cas se journalise. */
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
  } else {
    if (!req.headers['x-vercel-cron']) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
    console.warn('[cron] CRON_SECRET non définie : cette tâche est déclenchable par n’importe qui')
  }

  const admin = clientService()

  const { data, error } = await admin.rpc('photographier_qualite_comptes')

  if (error) {
    console.error('[cron] photographier-qualite :', error.message)
    res.status(500).json({ error: error.message })
    return
  }

  const ecrits = Number(data ?? 0)
  console.log(`[cron] photographier-qualite : ${ecrits} score(s) relevé(s)`)
  res.status(200).json({ ecrits })
}
