import type { VercelRequest, VercelResponse } from '@vercel/node'
import { NON_CONNECTE, profilAppelant, clientService, sessionQuelconque } from './_oauth.js'
import { clientAdmin } from './_archivage.js'
import { doitEcrire, statutAEcrire, statutMetierContrat } from './_decision.js'

/**
 * Où en est vraiment une enveloppe, d'après DocuSign lui-même.
 *
 * POURQUOI CET APPEL EXISTE. Naoëlle, 21/08/2026, après avoir envoyé le contrat de SDC AMPLITUDE 2 :
 * « j'ai envoyé ce contrat mais j'ai rien qui me montre s'il a bien été envoyé. Comment je suis sûre
 * que ça a envoyé ? » Le statut affiché venait du webhook, et un webhook peut ne pas arriver — un
 * réseau qui tombe, une notification perdue, une session absente au moment de la vérification. Dans
 * ce cas Kimatch affiche un état périmé sans le savoir, ce qui est pire que de n'afficher rien.
 *
 * Cet appel ne fait donc pas confiance à ce qu'on a en base : il demande à DocuSign, et REMET la base
 * d'accord avec lui. C'est la seule réponse honnête à « comment je suis sûre ».
 *
 * Lecture seule du point de vue de DocuSign : on ne modifie jamais l'enveloppe.
 *
 * ══ LIRE UN STATUT N'EXIGE PAS D'AVOIR SON PROPRE COMPTE DOCUSIGN ═══════════════════════════════
 *
 * Naoëlle, 03/09/2026 : « une personne qui utilise Kimatch devrait voir les statuts à jour même si
 * elle n'utilise pas DocuSign. »
 *
 * Elle a raison, et c'est ce qui produisait le défaut de Michel. Cet appel prenait la session de
 * L'APPELANT : les sept personnes qui en ont une lisaient l'état réel, Michel — qui n'envoie aucun
 * mandat et n'a donc jamais connecté DocuSign — recevait NON_CONNECTE et restait sur le statut
 * stocké. Le même contrat affichait « signé » chez les uns, « envoyé » chez lui.
 *
 * OR LE STATUT D'UN CONTRAT APPARTIENT À L'ENTREPRISE, PAS À CELUI QUI LE REGARDE. Les sept
 * sessions pointent le même compte DocuSign (« KIWEE ENERGIE ») : n'importe laquelle sait lire
 * n'importe quelle enveloppe de ce compte. On se rabat donc sur une autre session quand l'appelant
 * n'en a pas — exactement ce que fait déjà le cron `rattraper-enveloppes`, qui n'a aucun
 * utilisateur derrière lui et lit pourtant très bien.
 *
 * CE N'EST PAS UN CONTOURNEMENT DE DROITS. L'appelant est authentifié, et il ne voit ce contrat que
 * si les politiques de la base le lui montrent : le repli ne décide pas de CE QU'IL PEUT VOIR, il
 * décide seulement AVEC QUEL JETON on interroge DocuSign.
 *
 * L'ENVOI, LUI, RESTE PERSONNEL. Une enveloppe part au nom de quelqu'un, avec sa licence
 * d'expéditeur : `send.ts` continue d'exiger la session de l'appelant, et NON_CONNECTE y garde tout
 * son sens. Lire et signer ne demandent pas les mêmes droits.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }
  const profilId = await profilAppelant(authHeader)
  if (!profilId) {
    res.status(401).json({ error: 'Session invalide' })
    return
  }

  /* UN MANDAT OU UN CONTRAT. Cet appel ne connaissait que les contrats, et les mandats bloques du
     31/08/2026 n'avaient aucun moyen d'etre verifies — ni bouton, ni appel.

     ══ LES DEUX OBJETS NE PORTENT PAS LES MEMES COLONNES ══

     Le commentaire precedent affirmait le contraire, et c'est ce qui cassait le bouton « Verifier
     aupres de DocuSign » sur un mandat : il repondait « Mandat introuvable ». Verifie le 31/08 :

       statut_signature      contrats SEULEMENT
       date_envoi_signature  contrats SEULEMENT
       date_envoi            mandats  SEULEMENT
       date_signature        les deux
       docusign_envelope_id  les deux
       statut_id             les deux (mais vers des tables de reference differentes)

     Selectionner `statut_signature` sur `mandats` faisait echouer la requete PostgREST ; `data`
     valait null, et le handler concluait « introuvable ». Le mandat existait parfaitement.

     Le statut d'un mandat vit dans `statut_id` -> `statuts_mandats`, celui de la signature d'un
     contrat dans une colonne texte. Ce sont deux modeles differents : on les traite differemment. */
  const contratId = typeof req.query.contratId === 'string' ? req.query.contratId : null
  const mandatId = typeof req.query.mandatId === 'string' ? req.query.mandatId : null
  if (!contratId && !mandatId) {
    res.status(400).json({ error: 'contratId ou mandatId requis' })
    return
  }
  if (contratId && mandatId) {
    res.status(400).json({ error: 'contratId ou mandatId, pas les deux' })
    return
  }
  const table = contratId ? 'contrats' : 'mandats'
  const objetId = (contratId ?? mandatId) as string

  const admin = clientAdmin()
  if (!admin) {
    res.status(500).json({ error: 'Supabase (service role) non configuré côté serveur' })
    return
  }

  /* LES DATES SONT INDISPENSABLES : les deux règles de traduction s'appuient sur la fenêtre de
     validité pour trancher entre signé, à venir, actif et terminé. */
  const colonnes = contratId
    ? 'id, docusign_envelope_id, statut_signature, date_debut, date_fin'
    : 'id, docusign_envelope_id, date_debut_validite, date_fin_validite, statut:statuts_mandats(code)'
  const { data: objet, error: eLecture } = await admin
    .from(table)
    .select(colonnes)
    .eq('id', objetId)
    .maybeSingle()
  /* L'ERREUR DE LECTURE EST DITE, ET NON TRADUITE EN « INTROUVABLE ». C'est ce mensonge qui a coute
     le plus de temps : une colonne inexistante se lisait comme un mandat absent, donc on cherchait
     du cote des donnees au lieu du code. */
  if (eLecture) {
    res.status(502).json({ error: `Lecture ${table} impossible : ${eLecture.message}` })
    return
  }
  if (!objet) {
    res.status(404).json({ error: contratId ? 'Contrat introuvable' : 'Mandat introuvable' })
    return
  }
  const contrat = objet as unknown as {
    id: string
    docusign_envelope_id: string | null
    statut_signature?: string | null
    date_debut?: string | null
    date_fin?: string | null
    date_debut_validite?: string | null
    date_fin_validite?: string | null
    statut?: { code: string } | { code: string }[] | null
  }
  const fenetre = contratId
    ? { debut: contrat.date_debut ?? null, fin: contrat.date_fin ?? null }
    : { debut: contrat.date_debut_validite ?? null, fin: contrat.date_fin_validite ?? null }
  /* L'etat connu de notre cote, pour savoir s'il faut corriger. Cote contrat c'est
     `statut_signature` ; cote mandat c'est le code de son statut metier. */
  const statutConnu = contratId
    ? (contrat.statut_signature ?? null)
    : (Array.isArray(contrat.statut) ? contrat.statut[0]?.code : contrat.statut?.code) ?? null
  if (!contrat.docusign_envelope_id) {
    res.status(200).json({ envoye: false, raison: 'Aucune enveloppe DocuSign pour ce contrat.' })
    return
  }

  try {
    /* `sessionQuelconque` essaie D'ABORD celle de l'appelant : quand il en a une, rien ne change —
       même jeton, même compte, même réponse. Elle ne cherche ailleurs que s'il n'en a pas, ou si
       son jeton ne se renouvelle plus. */
    const session = await sessionQuelconque(clientService(), profilId)
    if (!session) throw new Error(NON_CONNECTE)
    const base = `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/envelopes/${contrat.docusign_envelope_id}`
    const entetes = { Authorization: `Bearer ${session.access_token}` }

    const [rEnv, rDest] = await Promise.all([
      fetch(base, { headers: entetes }),
      fetch(`${base}/recipients`, { headers: entetes }),
    ])
    if (!rEnv.ok) {
      res.status(502).json({ error: `DocuSign a refusé la lecture de l'enveloppe (${rEnv.status})` })
      return
    }
    const env = (await rEnv.json()) as { status?: string; sentDateTime?: string; completedDateTime?: string }
    const dest = rDest.ok
      ? ((await rDest.json()) as { signers?: { name?: string; email?: string; status?: string; deliveredDateTime?: string }[] })
      : { signers: [] }
    const signataire = dest.signers?.[0] ?? null

    // ON REMET LA BASE D'ACCORD AVEC DOCUSIGN. C'est tout l'intérêt : si le webhook n'est jamais
    // arrivé, cet appel rattrape le retard au lieu de laisser un statut périmé à l'écran.
    const PAR_STATUT: Record<string, string> = {
      created: 'BROUILLON',
      sent: 'ENVOYE',
      delivered: 'ENVOYE',
      completed: 'SIGNE',
      declined: 'REFUSE',
      voided: 'ANNULE',
    }
    const statut = env.status ? PAR_STATUT[env.status] : undefined
    let corrige = false

    /* ══ ON COMPARE AU STATUT CIBLE, PAS À CELUI DE L'ENVELOPPE ══
       C'était le défaut : l'enveloppe dit « completed », donc SIGNE, et un mandat déjà à « Signé »
       paraissait à jour — alors qu'il devait passer « Actif ». Recliquer n'y changeait rien.

       La cible est ce que les règles de traduction produisent, et c'est elle qui doit être comparée à
       ce qu'on a en base. Sans quoi un objet arrêté à mi-chemin y reste pour toujours. */
    const cible = statut
      ? contratId
        ? statutMetierContrat(statut, fenetre)
        : statut === 'BROUILLON'
          ? null
          : statutAEcrire(statut, fenetre)
      : null

    if (statut && cible && cible !== statutConnu) {
      if (contratId) {
        /* Le statut métier suit la signature, par la MÊME règle que le webhook — `cible` la porte. */
        const { data: ligne } = await admin
          .from('statuts_contrats')
          .select('id')
          .eq('code', cible)
          .maybeSingle()
        const statutMetierId = (ligne as { id: string } | null)?.id ?? null
        const { error } = await admin
          .from('contrats')
          .update({
            statut_signature: statut,
            ...(statutMetierId ? { statut_id: statutMetierId } : {}),
            ...(env.sentDateTime ? { date_envoi_signature: env.sentDateTime } : {}),
            ...(statut === 'SIGNE' && env.completedDateTime ? { date_signature: env.completedDateTime } : {}),
            date_modification: new Date().toISOString(),
          })
          .eq('id', contrat.id)
        corrige = !error
      } else {
        /* CÔTÉ MANDAT, LE STATUT EST UNE CLÉ ÉTRANGÈRE. « BROUILLON » n'existe pas dans
           `statuts_mandats` — l'équivalent d'une enveloppe encore en brouillon est « À préparer »,
           qui est déjà l'état du mandat. On ne touche donc à rien dans ce cas : rien à corriger.

           On ne fait pas non plus reculer un statut : `doitEcrire` porte cette règle, et une
           signature acquise ne se défait pas parce qu'une notification est rejouée. */
        /* `cible` porte déjà la règle de Michel du 21/08/2026 : une signature rend le mandat ACTIF
           quand la fenêtre de validité le permet. Un mandat qui reste à « Signé » est invisible pour
           les recommandations, alors qu'il est signé. */
        const codeCible = cible
        if (codeCible && doitEcrire(statutConnu, codeCible)) {
          const { data: ligne } = await admin
            .from('statuts_mandats')
            .select('id')
            .eq('code', codeCible)
            .maybeSingle()
          const statutId = (ligne as { id: string } | null)?.id ?? null
          if (statutId) {
            const { error } = await admin
              .from('mandats')
              .update({
                statut_id: statutId,
                ...(env.sentDateTime ? { date_envoi: env.sentDateTime } : {}),
                ...(statut === 'SIGNE' && env.completedDateTime ? { date_signature: env.completedDateTime } : {}),
                date_modification: new Date().toISOString(),
              })
              .eq('id', contrat.id)
            corrige = !error
          } else {
            console.error('[etat-enveloppe] statut de mandat introuvable', { codeCible })
          }
        }
      }
    }

    res.status(200).json({
      envoye: env.status !== 'created',
      statut: statut ?? null,
      statutDocusign: env.status ?? null,
      envoyeLe: env.sentDateTime ?? null,
      signeLe: env.completedDateTime ?? null,
      signataire: signataire ? { nom: signataire.name, email: signataire.email, statut: signataire.status, recuLe: signataire.deliveredDateTime ?? null } : null,
      // Le lien vers l'enveloppe dans DocuSign, construit depuis la région du compte plutôt que
      // devine : `eu.docusign.net` cote API correspond a `apps-eu.docusign.com` cote site.
      lien: lienVersEnveloppe(session.base_uri, contrat.docusign_envelope_id),
      statutConnuAvant: statutConnu,
      corrige,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur DocuSign inconnue'
    if (message === NON_CONNECTE) {
      /* Ce cas ne dépend plus du compte de l'appelant : on n'y arrive que si PERSONNE dans
         l'équipe n'a de session utilisable. Le message le dit, plutôt que de renvoyer quelqu'un
         connecter un compte qui ne changerait rien à l'affaire. */
      res.status(409).json({
        error:
          'Aucun compte DocuSign de l’équipe n’est utilisable en ce moment : le statut ne peut pas être vérifié. ' +
          'Une reconnexion depuis « Mon profil » — la vôtre ou celle d’un collègue — rétablira la lecture.',
        code: NON_CONNECTE,
      })
      return
    }
    res.status(502).json({ error: message })
  }
}

/** L'adresse de l'enveloppe sur le site DocuSign, déduite de la région du compte. */
function lienVersEnveloppe(baseUri: string, envelopeId: string): string {
  const hote = baseUri.includes('demo.docusign.net')
    ? 'appdemo.docusign.com'
    : baseUri.includes('eu.docusign.net')
      ? 'apps-eu.docusign.com'
      : baseUri.includes('au.docusign.net')
        ? 'apps-au.docusign.com'
        : baseUri.includes('ca.docusign.net')
          ? 'apps-ca.docusign.com'
          : 'app.docusign.com'
  return `https://${hote}/documents/details/${envelopeId}`
}
