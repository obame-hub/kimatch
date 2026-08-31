import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDocusignContext } from './_client.js'
import { NON_CONNECTE, profilAppelant } from './_oauth.js'
import { clientAdmin } from './_archivage.js'
import { doitEcrire } from './_decision.js'

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

  const colonnes = contratId
    ? 'id, docusign_envelope_id, statut_signature'
    : 'id, docusign_envelope_id, statut:statuts_mandats(code)'
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
    statut?: { code: string } | { code: string }[] | null
  }
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
    const ctx = await getDocusignContext(profilId)
    const base = `${ctx.baseUri}/restapi/v2.1/accounts/${ctx.accountId}/envelopes/${contrat.docusign_envelope_id}`
    const entetes = { Authorization: `Bearer ${ctx.accessToken}` }

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

    if (statut && statut !== statutConnu) {
      if (contratId) {
        const { error } = await admin
          .from('contrats')
          .update({
            statut_signature: statut,
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
        const codeCible = statut === 'BROUILLON' ? null : statut
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
      lien: lienVersEnveloppe(ctx.baseUri, contrat.docusign_envelope_id),
      statutConnuAvant: statutConnu,
      corrige,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur DocuSign inconnue'
    if (message === NON_CONNECTE) {
      res.status(409).json({
        error: 'Votre compte DocuSign n’est pas connecté. Ouvrez « Mon profil » et autorisez DocuSign.',
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
