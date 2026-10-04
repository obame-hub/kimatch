import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService } from '../docusign/_oauth.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ALERTE DE LA VEILLE — une offre générée arrive au bout de sa validité
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « ok pour ton idée Compte à rebours de validité » — la version affiche le
 * temps qui reste, et le consultant est prévenu avant l'échéance, pour relancer le client pendant que
 * les prix tiennent encore, ou régénérer l'offre.
 *
 * Toutes les heures : chaque version dont l'offre expire dans les 24 heures, et qui n'a pas encore
 * été signalée, vaut une notification au propriétaire de la recommandation. `alerte_validite_le`
 * empêche de la répéter ; régénérer l'offre la remet à zéro (nouvelle validité, nouvelle alerte).
 * Les recommandations clôturées ne sont pas signalées.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // LA GARDE, reprise de api/signaux/echeances.ts : `CRON_SECRET`, envoyé par Vercel lui-même.
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

  const admin = clientService()
  const maintenant = new Date()
  const demain = new Date(maintenant.getTime() + 24 * 3600 * 1000)
  const { data, error } = await admin
    .from('versions_recommandation')
    .select('id, validite_offre, reco:recommandations(id, nom, proprietaire_id, compte:comptes(nom), etape:etapes_recommandation(code))')
    .gt('validite_offre', maintenant.toISOString())
    .lte('validite_offre', demain.toISOString())
    .is('alerte_validite_le', null)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const premier = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null)
  let alertes = 0
  for (const v of (data ?? []) as any[]) {
    const reco = premier(v.reco)
    if (!reco || premier(reco.etape)?.code === 'CLOTUREE') continue
    if (reco.proprietaire_id) {
      const quand = new Date(v.validite_offre).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' })
      await admin.from('notifications').insert({
        destinataire_profil_id: reco.proprietaire_id,
        titre: 'Offre bientôt expirée',
        message: `${premier(reco.compte)?.nom ?? reco.nom ?? 'Le client'} : l’offre expire ${quand}. Relancez le client, ou régénérez-la avec une nouvelle validité.`,
        lien: `/recommandations/${reco.id}`,
        entite_type: 'recommandation',
        entite_id: reco.id,
        categorie: 'validite_offre',
      })
      alertes += 1
    }
    await admin.from('versions_recommandation').update({ alerte_validite_le: maintenant.toISOString() }).eq('id', v.id)
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  res.status(200).json({ ok: true, alertes })
}
