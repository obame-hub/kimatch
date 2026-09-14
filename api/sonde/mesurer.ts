import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService } from '../docusign/_oauth.js'

/**
 * MESURE CHAQUE NUIT LA VITESSE PURE DE LA BASE, ET L'ENREGISTRE.
 *
 * ══ L'INCIDENT QUI A MOTIVÉ ÇA ════════════════════════════════════════════════════════════════
 *
 * Le 10/09/2026, toute l'équipe à l'arrêt pendant quarante minutes. L'application ne répondait
 * plus, l'auth non plus, et la page d'état de Supabase était verte. J'ai cherché dans PostgREST,
 * dans les verrous, dans les connexions ouvertes. La cause était ailleurs : l'instance n'avait plus
 * de CPU, épuisé par un import de 12 000 fichiers lancé à pleine vitesse.
 *
 * CE QUI L'A MONTRÉ EN DIX SECONDES, ET QU'AUCUN AUTRE INDICATEUR NE DISAIT : faire compter la base
 * jusqu'à trois millions et chronométrer. 9 414 ms, contre 200 à 400 sur une machine saine. Le
 * tableau de bord Supabase affichait « CPU 17 % » au même moment — 17 % d'un quota déjà réduit,
 * donc rassurant et faux.
 *
 * ══ POURQUOI CETTE MESURE-LÀ ═════════════════════════════════════════════════════════════════
 *
 * `generate_series` ne lit aucune table, ne touche pas au disque, ne dépend d'aucun index ni
 * d'aucune statistique. Le temps obtenu ne dépend QUE du processeur disponible. Une requête métier
 * mêlerait tout : on ne saurait pas si elle rame parce que la machine est bridée ou parce qu'il
 * manque un index — c'est exactement la confusion qui m'a coûté une demi-heure le 10/09.
 *
 * ══ POURQUOI UNE TÂCHE PLANIFIÉE ET NON UN SCRIPT ════════════════════════════════════════════
 *
 * La sonde existait depuis le 10/09 en ligne de commande. Elle a enregistré DEUX mesures, toutes
 * deux ce jour-là. Une mesure qu'il faut penser à lancer n'est pas une mesure : c'est une bonne
 * intention. Et un journal qui vit sur un poste s'arrête quand le poste dort.
 *
 * ══ 4 H 30, ET C'EST DÉLIBÉRÉ ════════════════════════════════════════════════════════════════
 *
 * Après les cinq autres tâches (3 h 00 à 3 h 45), pour ne pas mesurer la machine pendant qu'elles
 * la font travailler — on relèverait alors la charge qu'on a créée soi-même. Et avant l'arrivée de
 * l'équipe : la mesure doit dire ce que vaut la machine AU REPOS, seul point de comparaison stable
 * d'un jour à l'autre.
 *
 * ══ CE QU'ON NE FAIT PAS ═════════════════════════════════════════════════════════════════════
 *
 * Aucune alerte automatique. Une sonde qui écrit un chiffre par jour ne sait pas distinguer un
 * import légitime d'une dérive de fond ; c'est la COURBE qui tranche, sur une semaine. Poser un
 * seuil aujourd'hui reviendrait à réveiller quelqu'un pour un chiffre dont on ne connaît pas encore
 * la normale.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LA GARDE, reprise à l'identique des autres tâches. `x-vercel-cron` n'est pas une barrière :
     n'importe qui peut poser cet en-tête, vérifié le 21/08/2026 avec un simple curl. La barrière
     réelle est `CRON_SECRET`, que Vercel envoie lui-même sur ses invocations planifiées. */
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

  /* ══ LA MESURE ══
     `fn_sonder_le_processeur` fait le calcul et rend le chronomètre : le temps est pris DANS la
     base, pas ici. Mesuré depuis Vercel, on chronométrerait aussi la latence du réseau entre la
     fonction et la base — qui varie de 20 à 200 ms selon la région et le moment, soit l'ordre de
     grandeur de ce qu'on cherche à observer. */
  const { data, error } = await admin.rpc('fn_sonder_le_processeur')
  if (error) {
    console.error('[sonde] la mesure a échoué :', error.message)
    res.status(500).json({ error: error.message })
    return
  }

  const mesure = (Array.isArray(data) ? data[0] : data) as {
    sonde_ms: number
    connexions: number
    max_connexions: number
    cache_pourcent: number | null
  }

  const { error: erreurEcriture } = await admin.from('mesures_base').insert({
    sonde_ms: mesure.sonde_ms,
    connexions: mesure.connexions,
    max_connexions: mesure.max_connexions,
    cache_pourcent: mesure.cache_pourcent,
    origine: 'CRON',
  })
  if (erreurEcriture) {
    console.error('[sonde] mesure prise mais non enregistrée :', erreurEcriture.message)
    res.status(500).json({ error: erreurEcriture.message })
    return
  }

  /* LE VERDICT DANS LES JOURNAUX, pour qu'une mauvaise nuit se voie sans ouvrir l'application.
     Les seuils viennent du 10/09 : 900 ms est le régime de croisière observé sur `Small`, 9 414 ms
     était l'instance à l'arrêt. */
  const verdict = mesure.sonde_ms < 500 ? 'sain'
    : mesure.sonde_ms < 1500 ? 'régime de croisière'
      : mesure.sonde_ms < 3000 ? 'ça se dégrade'
        : mesure.sonde_ms < 8000 ? 'BRIDÉE' : 'À L’ARRÊT'
  console.log(`[sonde] ${mesure.sonde_ms} ms · ${mesure.connexions}/${mesure.max_connexions} connexions · ${verdict}`)

  res.status(200).json({ ...mesure, verdict })
}
