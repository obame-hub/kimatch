import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService } from '../docusign/_oauth.js'

/**
 * Fait expirer chaque nuit les mandats dont la fenêtre de validité est passée.
 *
 * RÈGLE POSÉE PAR NAOËLLE LE 21/08/2026 : « un mandat passe expiré si la fenêtre est dépassée, ou si
 * quelqu'un le fait passer à expiré. » Cette tâche couvre le premier cas ; le second reste le
 * sélecteur de statut de la fiche mandat, qu'elle ne touche pas.
 *
 * CE QUI MANQUAIT. Rien ne faisait expirer un mandat. Les 71 mandats expirés en base le sont parce
 * que Salesforce les avait déjà marqués ainsi à la reprise — vérifié le 21/08/2026, en même temps
 * que l'absence de tout passage de Signé à Actif. Un mandat arrivé à terme dans Kimatch restait donc
 * affiché Actif, indéfiniment. C'est le même trou que celui signalé par Michel, à l'autre bout de la
 * vie du mandat, et il est plus insidieux : un mandat périmé annoncé actif fait consulter des
 * fournisseurs sans mandat valable.
 *
 * POURQUOI UNE TÂCHE ET NON UN CALCUL À LA LECTURE. Le statut est une colonne que toute
 * l'application lit — le wizard de recommandation, la santé d'un site, la matrice de couverture. Le
 * dériver à la lecture obligerait à refaire le calcul partout, et une seule lecture oubliée
 * rétablirait le bug. Une tâche quotidienne garde une seule vérité, dans la colonne.
 *
 * POURQUOI VERCEL ET NON pg_cron. L'extension n'est pas installée sur cette base. Vercel fait déjà
 * tourner une tâche nocturne pour les sessions DocuSign : on suit le même chemin plutôt que d'en
 * ouvrir un second.
 *
 * CE QUI N'EST PAS TOUCHÉ. Seuls les mandats ACTIF sont concernés. Un mandat À préparer, Envoyé,
 * Refusé ou Annulé garde son statut même si la fenêtre est passée : ces états disent ce qui est
 * arrivé au mandat, et les écraser par « Expiré » effacerait l'information. Un mandat sans date de
 * fin n'expire pas non plus — on ne devine pas une échéance.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Mêmes gardes que la tâche des sessions DocuSign : l'en-tête que Vercel ajoute à ses
  // invocations planifiées, ou CRON_SECRET pour un déclenchement à la main.
  const estCron = Boolean(req.headers['x-vercel-cron'])
  const secret = process.env.CRON_SECRET
  const secretFourni = req.headers.authorization === `Bearer ${secret}`
  if (!estCron && !(secret && secretFourni)) {
    res.status(401).json({ error: 'Réservé à la tâche planifiée' })
    return
  }

  const admin = clientService()
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const { data: statuts, error: erreurStatuts } = await admin
    .from('statuts_mandats')
    .select('id, code')
    .in('code', ['ACTIF', 'EXPIRE'])
  if (erreurStatuts) {
    res.status(500).json({ error: erreurStatuts.message })
    return
  }
  const idActif = statuts?.find((s) => s.code === 'ACTIF')?.id
  const idExpire = statuts?.find((s) => s.code === 'EXPIRE')?.id
  if (!idActif || !idExpire) {
    // Le référentiel a changé sous nos pieds : mieux vaut ne rien écrire et le dire.
    console.error('[mandats/expirer] statut ACTIF ou EXPIRE introuvable dans le référentiel')
    res.status(500).json({ error: 'Statuts ACTIF / EXPIRE introuvables' })
    return
  }

  const { data: expires, error } = await admin
    .from('mandats')
    .update({ statut_id: idExpire, date_modification: new Date().toISOString() })
    .eq('statut_id', idActif)
    .not('date_fin_validite', 'is', null)
    .lt('date_fin_validite', aujourdhui)
    .select('id, date_fin_validite, compte:comptes(nom)')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const liste = (expires ?? []).map((m) => {
    const compte = m.compte as { nom: string } | { nom: string }[] | null
    return {
      id: m.id as string,
      compte: (Array.isArray(compte) ? compte[0]?.nom : compte?.nom) ?? '(compte inconnu)',
      fin: m.date_fin_validite as string,
    }
  })
  // Journalisé nommément : un mandat qui expire retire un compte des recommandations possibles, et
  // il faut pouvoir dire pourquoi sans relire la base.
  if (liste.length) console.log('[mandats/expirer] mandats expirés', liste)

  res.status(200).json({ ok: true, jour: aujourdhui, expires: liste.length, mandats: liste })
}
