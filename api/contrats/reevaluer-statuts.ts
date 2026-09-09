import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService } from '../docusign/_oauth.js'

/**
 * Fait passer chaque nuit à « Actif » les contrats dont la date de début est arrivée.
 *
 * ══ CE QUI MANQUAIT, ET LA MESURE QUI L'A MONTRÉ ═══════════════════════════════════════════════
 *
 * Rien ne faisait avancer le statut d'un contrat. Il y avait `/api/mandats/expirer` pour les
 * mandats, `/api/docusign/rattraper-enveloppes` pour les signatures, `/api/signaux/echeances` pour
 * les signaux — et rien pour les contrats.
 *
 * Résultat mesuré le 08/09/2026 : 19 contrats affichaient un statut que leurs propres dates
 * contredisaient. Le 09/09 au matin, ils étaient 20 — un contrat de plus avait franchi sa date de
 * début pendant la nuit. La dérive n'est donc pas un reste historique, elle est en cours, et elle
 * grossit d'environ un contrat par jour.
 *
 * ══ UNE SEULE TRANSITION, ET C'EST DÉLIBÉRÉ ════════════════════════════════════════════════════
 *
 * Cette tâche ne fait qu'une chose : « À venir » → « Actif » quand la date de début est arrivée.
 * 11 contrats sont dans ce cas. C'est la seule transition dont le sens ne se discute pas.
 *
 * CE QU'ELLE NE FAIT PAS, ET POURQUOI :
 *
 * ① « ACTIF » → « TERMINÉ » quand la date de fin est passée. 8 contrats sont concernés, et ils sont
 *   peut-être JUSTES : dans l'énergie, un contrat tacitement reconduit court au-delà de sa date de
 *   fin d'origine. La question « un contrat tacitement reconduit garde-t-il sa date de fin ? » est
 *   posée à Michel et sans réponse à ce jour. Écrire cette transition maintenant terminerait
 *   peut-être huit contrats vivants — et personne ne le verrait, puisque le statut aurait l'air
 *   normal. On attend la réponse.
 *
 * ② Un contrat « Actif » dont la date de début est dans le futur — 1 cas. Là, soit la date est
 *   fausse, soit le statut l'est, et rien dans les données ne dit lequel. Trancher serait deviner :
 *   ce contrat est signalé dans la réponse, pas corrigé.
 *
 * ③ Les statuts d'avant-signature (Nouveau, En préparation, À signer, Signé) et les sorties
 *   (Résilié, Annulé). Ils disent ce qui est ARRIVÉ au contrat ; les écraser par une date effacerait
 *   l'information. C'est la même règle que pour les mandats — voir `api/mandats/expirer.ts`.
 *
 * ══ UNE RÉSERVE SUR LA COLONNE ÉCRITE ══════════════════════════════════════════════════════════
 *
 * `contrats` porte TROIS colonnes de statut remplies en parallèle — `statut_id`, `statut_vie_id` et
 * `statut_avancement_id` — et la question de savoir laquelle fait foi est posée à Michel, sans
 * réponse. Cette tâche écrit `statut_id`, la seule que l'application lise réellement : 42 endroits
 * du code contre zéro pour les deux autres. Si l'arbitrage désigne une autre colonne, c'est cette
 * ligne-là qu'il faudra changer, et elle est seule.
 *
 * ══ POURQUOI UNE TÂCHE ET NON UN CALCUL À LA LECTURE ═══════════════════════════════════════════
 *
 * Même raison que pour les mandats : le statut est une colonne que tout lit — les listes, la santé
 * d'un site, le portefeuille. Le dériver à la lecture obligerait à refaire le calcul partout, et une
 * seule lecture oubliée rétablirait l'écart. Une tâche quotidienne garde une seule vérité.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LA GARDE, à l'identique de `api/mandats/expirer.ts` — et pour la même raison : l'en-tête
     `x-vercel-cron` n'est PAS une barrière, n'importe qui peut la poser sur une requête (vérifié le
     21/08/2026 au curl). La barrière réelle est `CRON_SECRET`, que Vercel envoie lui-même sur ses
     invocations planifiées. Tant qu'elle n'est pas définie, on accepte l'en-tête pour ne pas casser
     la planification, mais on le journalise. */
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
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const { data: statuts, error: erreurStatuts } = await admin
    .from('statuts_contrats')
    .select('id, code')
    .in('code', ['A_VENIR', 'ACTIF'])
  if (erreurStatuts) {
    res.status(500).json({ error: erreurStatuts.message })
    return
  }
  const idAVenir = statuts?.find((s) => s.code === 'A_VENIR')?.id
  const idActif = statuts?.find((s) => s.code === 'ACTIF')?.id
  if (!idAVenir || !idActif) {
    // Le référentiel a changé sous nos pieds : mieux vaut ne rien écrire et le dire.
    console.error('[contrats/reevaluer-statuts] statut A_VENIR ou ACTIF introuvable dans le référentiel')
    res.status(500).json({ error: 'Statuts A_VENIR / ACTIF introuvables' })
    return
  }

  /* ON EXCLUT LES CONTRATS DÉJÀ ÉCHUS. Un contrat « À venir » dont la date de début est passée ET
     la date de fin aussi ne doit pas devenir « Actif » le temps d'une nuit avant qu'on le termine :
     il relève de la question du tacite laissée à Michel. On le laisse donc où il est, et on le
     compte à part pour qu'il ne disparaisse pas du rapport. */
  const { data: passesActifs, error } = await admin
    .from('contrats')
    .update({ statut_id: idActif, date_modification: new Date().toISOString() })
    .eq('statut_id', idAVenir)
    .not('date_debut', 'is', null)
    .lte('date_debut', aujourdhui)
    .or(`date_fin.is.null,date_fin.gte.${aujourdhui}`)
    .select('id, reference, date_debut, date_fin')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  /* LES CAS LAISSÉS EN L'ÉTAT SONT COMPTÉS ET NOMMÉS. Une tâche qui corrige en silence ce qu'elle
     sait corriger et se taît sur le reste laisse croire que tout est en ordre. Ces deux compteurs
     sont la trace de ce qui attend une décision humaine. */
  const { count: aTerminer } = await admin
    .from('contrats')
    .select('id', { count: 'exact', head: true })
    .eq('statut_id', idActif)
    .not('date_fin', 'is', null)
    .lt('date_fin', aujourdhui)

  const { count: actifsPasCommences } = await admin
    .from('contrats')
    .select('id', { count: 'exact', head: true })
    .eq('statut_id', idActif)
    .not('date_debut', 'is', null)
    .gt('date_debut', aujourdhui)

  const liste = (passesActifs ?? []).map((c) => ({
    id: c.id as string,
    reference: (c.reference as string | null) ?? '(sans référence)',
    debut: c.date_debut as string,
  }))
  // Journalisé nommément : un contrat qui devient actif entre dans le portefeuille et dans les
  // chiffres de couverture. Il faut pouvoir dire pourquoi sans relire la base.
  if (liste.length) console.log('[contrats/reevaluer-statuts] passés à Actif', liste)

  res.status(200).json({
    ok: true,
    jour: aujourdhui,
    passes_actifs: liste.length,
    contrats: liste,
    // Ce que la tâche a vu mais n'a pas touché, faute d'arbitrage.
    en_attente_arbitrage: {
      a_terminer_si_pas_de_tacite: aTerminer ?? 0,
      actifs_dont_le_debut_est_futur: actifsPasCommences ?? 0,
    },
  })
}
