import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService, rafraichirJeton, type SessionDocusign } from './_oauth.js'

/**
 * Renouvelle chaque nuit les sessions DocuSign, pour que personne n'ait jamais à se reconnecter.
 *
 * Pourquoi c'est nécessaire. Le refresh token de DocuSign vaut trente jours et se renouvelle
 * seulement quand on l'utilise. Sans cette tâche, la session de quelqu'un qui n'envoie pas de
 * mandat pendant un mois meurt en silence — et il l'apprend au pire moment, devant son client, à la
 * dernière étape du wizard. C'est exactement ce que William décrit avoir vécu sur Tools
 * (« il fallait se reconnecter tous les jours, c'est ingérable ») : une intégration qui lâche sans
 * prévenir, et des commerciaux qui concluent que « le process ne marche pas ».
 *
 * En rafraîchissant tous les jours, la fenêtre de trente jours est sans cesse repoussée : une
 * autorisation donnée une fois tient indéfiniment, tant que la personne ne la révoque pas côté
 * DocuSign et que l'application n'est pas modifiée.
 *
 * Une session qui ne se rafraîchit plus est supprimée : c'est ce qui déclenche la bannière
 * d'avertissement dans l'application (voir DocusignBanner) plutôt qu'un échec silencieux.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // LA GARDE. `CRON_SECRET` d'abord, l'en-tête ensuite — et dans cet ordre pour une raison précise.
  //
  // Le commentaire précédent affirmait qu'un appel extérieur ne peut pas fabriquer l'en-tête
  // `x-vercel-cron`. C'est FAUX : n'importe qui peut poser cet en-tête sur une requête, Vercel ne
  // le filtre pas. Vérifié le 21/08/2026 en déclenchant cette tâche depuis l'extérieur avec un
  // simple `curl -H "x-vercel-cron: 1"` — elle a tourné. Ce n'est donc pas une barrière.
  //
  // La barrière réelle est `CRON_SECRET` : quand la variable est définie, Vercel l'envoie lui-même
  // en `Authorization: Bearer …` sur ses invocations planifiées, et nous n'acceptons plus que ça.
  // Tant qu'elle n'est pas définie, on accepte l'en-tête pour ne pas casser la planification, mais
  // on le journalise : une tâche ouverte à tous doit se voir dans les journaux.
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
  const { data, error } = await admin.from('docusign_sessions').select('*')
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const sessions = (data ?? []) as SessionDocusign[]
  const renouvelees: string[] = []
  const perdues: { email: string | null; raison: string }[] = []

  for (const session of sessions) {
    try {
      const jetons = await rafraichirJeton(session.refresh_token)
      await admin
        .from('docusign_sessions')
        .update({
          access_token: jetons.access_token,
          // Indispensable : DocuSign renvoie un nouveau refresh token à chaque appel, et c'est son
          // enregistrement qui repousse l'échéance des trente jours. Ne pas le stocker reviendrait
          // à laisser la session mourir malgré la tâche.
          refresh_token: jetons.refresh_token ?? session.refresh_token,
          expire_le: new Date(Date.now() + jetons.expires_in * 1000).toISOString(),
          date_modification: new Date().toISOString(),
        })
        .eq('profil_id', session.profil_id)
      renouvelees.push(session.docusign_email ?? session.profil_id)
    } catch (err) {
      // Refresh token révoqué, expiré, ou application modifiée : la session est morte pour de bon.
      // On la retire afin que l'utilisateur voie la bannière et puisse se reconnecter, au lieu de
      // découvrir le problème au moment d'envoyer un mandat.
      await admin.from('docusign_sessions').delete().eq('profil_id', session.profil_id)
      perdues.push({
        email: session.docusign_email,
        raison: err instanceof Error ? err.message : 'inconnue',
      })
    }
  }

  res.status(200).json({
    total: sessions.length,
    renouvelees: renouvelees.length,
    perdues,
  })
}
