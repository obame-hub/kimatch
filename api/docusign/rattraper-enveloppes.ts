import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clientService, sessionQuelconque } from './_oauth.js'

/**
 * RATTRAPE LES SIGNATURES DONT LA NOTIFICATION NE NOUS EST JAMAIS PARVENUE.
 *
 * ── LE FAIT QUI A DÉCLENCHÉ ÇA ─────────────────────────────────────────────────────────────────
 *
 * Michel, appel du 31/08/2026 : le contrat gaz de SDC 77 Joffre (compte SAS TVPJ) affichait
 * « Signature préparée — l'enveloppe existe mais n'a pas encore été envoyée », alors que Marie
 * l'avait signé. Enveloppe créée à 11 h 57, document déposé à 11 h 59, et plus rien ensuite.
 *
 * En regardant autour, le même silence sur cinq mandats : CABINET MOLINIER et KIWEE ENERGIE FRANCE
 * bloqués à « À préparer » depuis le 14 et le 15 août, Cabinet Louis Porcheret, TRANTRANYUE et RGR
 * BY CABINET WURM à « Envoyé » depuis le 20 et le 25. CABINET MOLINIER est nommément l'incident du
 * 14/08 qui a fait réécrire ce webhook — et il est toujours bloqué dix-sept jours après. Ce n'est
 * donc pas un accident : c'est un mode de défaillance permanent.
 *
 * ── POURQUOI ÇA NE POUVAIT PAS SE RÉPARER EN CORRIGEANT LE WEBHOOK ────────────────────────────
 *
 * Kimatch n'apprend qu'une enveloppe a bougé que si DocuSign le lui dit. Cette notification dépend
 * d'une configuration « Connect » qui vit dans l'administration DocuSign, hors du dépôt, que
 * personne dans Kimatch ne peut voir ni vérifier. Elle a déjà lâché deux fois pour deux raisons
 * différentes — la signature HMAC calculée sur un corps re-sérialisé, puis une clé Connect
 * différente de la nôtre — et les deux fois le symptôme était identique : rien, en silence.
 *
 * Et le silence est le pire des cas. Un contrat signé qui s'affiche « pas encore envoyé » ne
 * ressemble pas à une panne : il ressemble à un contrat pas encore envoyé. Personne ne va chercher.
 *
 * On arrête donc de dépendre de la notification SEULE. Trois fois par jour, cette tâche demande à
 * DocuSign où en est chaque enveloppe qui n'a pas atteint d'état terminal, et rattrape l'écart.
 * Une notification perdue coûte alors quelques heures d'affichage périmé, plus dix-sept jours.
 *
 * ── COMMENT ELLE RATTRAPE : EN SE RENVOYANT SA PROPRE NOTIFICATION ────────────────────────────
 *
 * Elle n'écrit pas les statuts elle-même. Quand DocuSign et la base divergent, elle POSTe sur
 * `/api/docusign/webhook` la notification qui aurait dû arriver.
 *
 * C'est possible — et propre — parce que ce webhook ne fait AUCUNE confiance au contenu de ce qu'on
 * lui envoie : il n'en retient que l'identifiant d'enveloppe, puis va demander le vrai statut à
 * DocuSign. Le rejeu emprunte donc le chemin complet, déjà éprouvé : le statut, le passage du
 * mandat signé à actif, l'archivage du PDF signé sur la fiche, la synchro GRD, l'avis Slack. Écrire
 * un second chemin ici en aurait oublié la moitié — et l'aurait oubliée en silence, exactement
 * comme la notification qu'on répare.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────────────────────────
 *
 * Elle ne touche jamais à l'enveloppe chez DocuSign : elle lit. Elle ne rejoue rien quand les deux
 * côtés sont d'accord — le cas normal, donc le coût habituel est un appel de lecture par enveloppe
 * en attente, et elles se comptent sur les doigts d'une main.
 */

/** Les états DocuSign qui ne bougeront plus : inutile de les redemander. */
const TERMINES = new Set(['completed', 'declined', 'voided'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // LA MÊME GARDE QUE `refresh-sessions` : `CRON_SECRET` fait autorité, l'en-tête `x-vercel-cron`
  // ne vaut que par défaut — n'importe qui peut le poser (vérifié le 21/08/2026 au curl).
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

  // ── CE QU'ON VA REDEMANDER ────────────────────────────────────────────────────────────────
  //
  // Un mandat compte comme « en attente » tant qu'il n'est ni signé, ni actif, ni refusé, ni
  // annulé : c'est-à-dire tant qu'une notification pourrait encore avoir été perdue. Même
  // raisonnement pour un contrat sur `statut_signature`.
  const enAttente: { objet: 'mandat' | 'contrat'; id: string; envelopeId: string; etat: string }[] = []

  const { data: mandats } = await admin
    .from('mandats')
    .select('id, docusign_envelope_id, statut:statuts_mandats(code)')
    .not('docusign_envelope_id', 'is', null)
  /* `unknown` D'ABORD : PostgREST type une jointure comme un TABLEAU, alors qu'une clé étrangère
     simple n'en rend qu'un. Le cast direct est refusé par TypeScript — à juste titre, les deux
     formes ne se recouvrent pas — mais la forme réelle est bien l'objet seul, vérifiée à
     l'exécution par le `?.` juste en dessous. */
  for (const m of (mandats ?? []) as unknown as { id: string; docusign_envelope_id: string; statut: { code: string } | null }[]) {
    const code = m.statut?.code ?? ''
    // Les etats terminaux de `statuts_mandats`, verifies dans la table : SIGNE, ACTIF, EXPIRE,
    // REFUSE, ANNULE. `A_PREPARER`, `ENVOYE` et `EN_SIGNATURE` sont des attentes — et « En
    // signature » est precisement l'etat ou une notification perdue laisse un mandat.
    if (['SIGNE', 'ACTIF', 'EXPIRE', 'REFUSE', 'ANNULE'].includes(code)) continue
    enAttente.push({ objet: 'mandat', id: m.id, envelopeId: m.docusign_envelope_id, etat: code })
  }

  const { data: contrats } = await admin
    .from('contrats')
    .select('id, docusign_envelope_id, statut_signature')
    .not('docusign_envelope_id', 'is', null)
  for (const c of (contrats ?? []) as { id: string; docusign_envelope_id: string; statut_signature: string | null }[]) {
    const s = c.statut_signature ?? ''
    if (['SIGNE', 'REFUSE', 'ANNULE'].includes(s)) continue
    enAttente.push({ objet: 'contrat', id: c.id, envelopeId: c.docusign_envelope_id, etat: s })
  }

  if (enAttente.length === 0) {
    res.status(200).json({ examinees: 0, rattrapees: 0, message: 'aucune enveloppe en attente' })
    return
  }

  const session = await sessionQuelconque(admin, null)
  if (!session) {
    // Sans session, on ne peut rien lire. On le dit franchement plutôt que de rendre un rapport
    // rassurant : c'est justement le genre de silence que cette tâche existe pour supprimer.
    res.status(200).json({
      examinees: 0,
      rattrapees: 0,
      erreur: 'aucune session DocuSign utilisable — personne ne peut interroger DocuSign',
      enAttente: enAttente.length,
    })
    return
  }

  // L'adresse de notre propre webhook. `VERCEL_URL` est l'hôte du déploiement courant : on rejoue
  // donc sur la version qui tourne, pas sur une autre.
  const hote = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'

  const rapport: {
    objet: string
    id: string
    etatBase: string
    statutDocusign: string | null
    rejoue: boolean
    erreur?: string
  }[] = []

  for (const e of enAttente) {
    try {
      const r = await fetch(
        `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${e.envelopeId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      )
      if (!r.ok) {
        rapport.push({ objet: e.objet, id: e.id, etatBase: e.etat, statutDocusign: null, rejoue: false, erreur: `lecture refusée (${r.status})` })
        continue
      }
      const env = (await r.json()) as { status?: string }
      const statut = env.status ?? null

      // RIEN À FAIRE QUAND DOCUSIGN DIT LA MÊME CHOSE QUE NOUS : une enveloppe encore en brouillon
      // chez eux et « à préparer » chez nous est simplement une enveloppe qu'on n'a pas envoyée.
      const docusignAvance =
        statut !== null && statut !== 'created' && (TERMINES.has(statut) || statut === 'sent' || statut === 'delivered')
      const nousSommesEnRetard =
        docusignAvance && !(e.objet === 'contrat' && e.etat === 'ENVOYE' && (statut === 'sent' || statut === 'delivered'))

      if (!nousSommesEnRetard) {
        rapport.push({ objet: e.objet, id: e.id, etatBase: e.etat, statutDocusign: statut, rejoue: false })
        continue
      }

      // LE REJEU. Même forme qu'une notification Connect, sans signature : le webhook ne s'y fie
      // pas et redemande lui-même le statut à DocuSign.
      const rejeu = await fetch(`${hote}/api/docusign/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: `envelope-${statut}`, data: { envelopeId: e.envelopeId } }),
      })
      rapport.push({
        objet: e.objet,
        id: e.id,
        etatBase: e.etat,
        statutDocusign: statut,
        rejoue: rejeu.ok,
        ...(rejeu.ok ? {} : { erreur: `rejeu refusé (${rejeu.status})` }),
      })
    } catch (err) {
      rapport.push({
        objet: e.objet,
        id: e.id,
        etatBase: e.etat,
        statutDocusign: null,
        rejoue: false,
        erreur: err instanceof Error ? err.message : 'erreur inconnue',
      })
    }
  }

  const rattrapees = rapport.filter((l) => l.rejoue).length
  // Journalisé même quand tout va bien : c'est la trace qui permet de dire « la tâche tourne » sans
  // avoir à la croire.
  console.log('[docusign rattrapage]', { examinees: rapport.length, rattrapees })
  res.status(200).json({ examinees: rapport.length, rattrapees, rapport })
}
