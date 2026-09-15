import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { lireCanal } from './_client.js'
import { creerPisteDepuisLead } from '../pistes/_creerPisteDepuisLead.js'

/**
 * ══ LE FILET SOUS LE TEMPS RÉEL ══
 *
 * `api/slack/evenements.ts` crée la piste à la seconde où le lead arrive. Cette tâche-ci relit le
 * canal et rattrape ce qui manque. Elle sert à deux choses que le temps réel ne sait pas faire :
 *
 *   L'HISTORIQUE. Les leads déjà dans #leads avant qu'on branche l'abonnement n'ont déclenché aucun
 *   événement. Bruno Athea, arrivé le 14/09 à 23 h 42, en fait partie. Un seul passage les rentre.
 *
 *   CE QUI SE PERD. Slack rejoue trois fois un envoi resté sans réponse, puis abandonne. Un
 *   déploiement Vercel en cours, une base indisponible trente secondes, et le lead est perdu sans
 *   que personne ne le sache. Une relecture quotidienne le retrouve.
 *
 * ELLE NE FAIT DONC RIEN DE PLUS que l'abonnement — même code de création, `_creerPisteDepuisLead`.
 * Deux chemins vers la même fonction, pour qu'ils ne puissent pas diverger.
 *
 * ══ UNE FOIS PAR JOUR SUFFIT ═════════════════════════════════════════════════════════════════
 *
 * Ce n'est pas le mécanisme principal : le temps réel l'est. Passer toutes les dix minutes
 * relirait cent fois par jour un canal qui reçoit un message tous les deux jours, pour rattraper un
 * incident qui arrive une fois par trimestre.
 */

const CANAL_LEADS = process.env.SLACK_CANAL_LEADS || 'C0AKN64MPFY'

function clientService() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !cle) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurées')
  return createClient(url, cle, { auth: { persistSession: false } })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LA GARDE, reprise à l'identique des autres tâches. `x-vercel-cron` n'est pas une barrière :
     n'importe qui peut poser cet en-tête. La barrière réelle est `CRON_SECRET`. */
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Réservé à la tâche planifiée' })
      return
    }
  } else if (!req.headers['x-vercel-cron']) {
    res.status(401).json({ error: 'Réservé à la tâche planifiée' })
    return
  }

  /* `?tout=1` relit l'historique complet du canal au lieu des cent derniers messages. À lancer une
     fois, à la mise en service, pour rentrer les leads déjà passés. */
  const limite = req.query.tout === '1' ? 999 : 100

  const lecture = await lireCanal(CANAL_LEADS, { limite })
  if ('error' in lecture) {
    /* `missing_scope` veut dire que l'app Slack n'a pas encore le droit `channels:history`.
       On le dit en clair : c'est une manipulation à faire, pas une panne à chercher. */
    const message = lecture.error === 'missing_scope'
      ? "L'app Slack n'a pas le droit `channels:history` — à ajouter puis réinstaller"
      : `Slack : ${lecture.error}`
    res.status(502).json({ error: message })
    return
  }

  const admin = clientService()
  const bilan = { lus: lecture.messages.length, crees: 0, deja: 0, ignores: 0, illisibles: [] as string[], erreurs: 0 }

  for (const m of lecture.messages) {
    try {
      const r = await creerPisteDepuisLead(admin, m.texte, m.ts)
      if (r.etat === 'cree') { bilan.crees++; console.log(`[rattraper-leads] ${r.reference} créée`) }
      else if (r.etat === 'deja') bilan.deja++
      else if (r.etat === 'ignore') bilan.ignores++
      else bilan.illisibles.push(`${m.ts} : ${r.manques.join(', ')}`)
    } catch (e) {
      bilan.erreurs++
      console.error('[rattraper-leads]', e instanceof Error ? e.message : e)
    }
  }

  if (bilan.illisibles.length > 0) {
    console.error('[rattraper-leads] LEADS ILLISIBLES :', bilan.illisibles.join(' | '))
  }
  res.status(200).json({ ok: true, ...bilan })
}
