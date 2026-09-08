import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerSession } from '../_auth.js'
import { clientService, sessionQuelconque } from './_oauth.js'
import { archiverDocumentsSignes } from './_archivage.js'

/**
 * ══ RÉCUPÉRER À NOUVEAU LES PIÈCES SIGNÉES D'UN MANDAT ══
 *
 * William, 08/09/2026 : « rattrape les 4 mandats déjà signés. »
 *
 * ── POURQUOI LE RATTRAPAGE EXISTANT NE POUVAIT PAS LE FAIRE ──
 *
 * `rattraper-enveloppes` ne rejoue QUE les enveloppes restées en attente : il saute tout mandat déjà
 * SIGNE, ACTIF, EXPIRE, REFUSE ou ANNULE. C'est sa raison d'être — il répare des notifications
 * perdues, il ne repasse pas sur ce qui a abouti. Les quatre mandats visés sont signés depuis
 * longtemps : ils lui sont invisibles, et c'est très bien ainsi.
 *
 * Rejouer le webhook à la main n'était pas une option non plus : il vérifie une signature HMAC
 * calculée avec la clé Connect, qui vit dans l'administration DocuSign. Fabriquer cette signature
 * demanderait de sortir un secret de son coffre pour un rattrapage ponctuel.
 *
 * ── CE QUE FAIT CETTE ROUTE, ET CE QU'ELLE NE FAIT PAS ──
 *
 * Elle relit l'enveloppe chez DocuSign et redépose ses pièces, une par PDF (voir
 * `archiverDocumentsSignes`). Elle ne touche NI au statut du mandat, NI à ses dates, NI à la synchro
 * GRD : ces trois-là ont déjà eu lieu au moment de la signature, et les rejouer relancerait des
 * appels Enedis/GRDF et une notification Slack pour un mandat vieux de trois semaines.
 *
 * ── LE PDF COMBINÉ D'ORIGINE PART, UNE FOIS LES PIÈCES EN PLACE ──
 *
 * Sans cela, la fiche afficherait le fichier fusionné ET les trois pièces qu'on vient d'en extraire :
 * quatre lignes pour deux documents. La suppression suit la même discipline que
 * `retirerDocumentsEnvoyes` — elle n'a lieu qu'APRÈS un archivage réussi, pour qu'un échec de
 * téléchargement laisse la fiche avec ce qu'elle avait plutôt qu'avec rien. Et le fichier n'est pas
 * perdu pour autant : DocuSign le régénère à la demande, c'est précisément ce que fait cette route.
 *
 * ── RÉSERVÉE AUX PERSONNES CONNECTÉES ──
 *
 * `exigerSession` valide vraiment le jeton auprès de Supabase. La route consomme des appels DocuSign
 * et écrit dans le stockage : elle n'a rien à faire ouverte à Internet — c'est l'audit du 28/08/2026
 * qui a établi cette règle, après avoir trouvé six fonctions sans garde.
 */

/** Les lignes que l'ancien archivage créait : un seul PDF, tous documents fusionnés. */
const LIBELLES_COMBINES = ['Mandat signé', 'Contrat signé']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }
  const utilisateur = await exigerSession(req, res)
  if (!utilisateur) return

  const corps = (req.body ?? {}) as { mandatIds?: unknown; contratIds?: unknown }
  const mandatIds = Array.isArray(corps.mandatIds) ? corps.mandatIds.filter((v): v is string => typeof v === 'string') : []
  const contratIds = Array.isArray(corps.contratIds) ? corps.contratIds.filter((v): v is string => typeof v === 'string') : []
  if (mandatIds.length === 0 && contratIds.length === 0) {
    res.status(400).json({ error: 'Aucun identifiant fourni' })
    return
  }
  // Une reprise se fait sur une poignée d'enveloppes. Au-delà, c'est une erreur d'appel, et chaque
  // enveloppe coûte un aller-retour DocuSign par document.
  if (mandatIds.length + contratIds.length > 25) {
    res.status(400).json({ error: 'Reprise limitée à 25 enveloppes par appel' })
    return
  }

  const admin = clientService()
  const session = await sessionQuelconque(admin, null)
  if (!session) {
    res.status(503).json({ error: 'Aucune session DocuSign utilisable — reconnecte DocuSign.' })
    return
  }

  const rapport: { objet: string; id: string; pieces?: number; supprimes?: number; erreur?: string }[] = []

  for (const [type, ids] of [['mandat', mandatIds], ['contrat', contratIds]] as const) {
    for (const id of ids) {
      const table = type === 'mandat' ? 'mandats' : 'contrats'
      const { data: ligne } = await admin
        .from(table)
        .select('id, docusign_envelope_id, compte:comptes(nom)')
        .eq('id', id)
        .maybeSingle()

      const envelopeId = (ligne as { docusign_envelope_id?: string } | null)?.docusign_envelope_id
      if (!envelopeId) {
        rapport.push({ objet: type, id, erreur: 'aucune enveloppe DocuSign sur cet enregistrement' })
        continue
      }
      const compte = (ligne as { compte?: { nom?: string } | { nom?: string }[] } | null)?.compte
      const compteNom = (Array.isArray(compte) ? compte[0]?.nom : compte?.nom) ?? 'compte inconnu'

      try {
        const pieces = await archiverDocumentsSignes(admin, session, envelopeId, { type, id }, compteNom)

        // Le combiné d'origine ne part qu'une fois les pièces bien enregistrées.
        const { data: anciens } = await admin
          .from('documents')
          .select('id, url')
          .eq('entite_type', type)
          .eq('entite_id', id)
          .in('nom', LIBELLES_COMBINES)

        const url = process.env.VITE_SUPABASE_URL as string
        const cle = process.env.SUPABASE_SERVICE_ROLE_KEY as string
        const prefixe = `${url}/storage/v1/object/public/documents/`
        let supprimes = 0
        for (const doc of (anciens ?? []) as { id: string; url: string | null }[]) {
          if (doc.url?.startsWith(prefixe)) {
            await fetch(`${url}/storage/v1/object/documents/${doc.url.slice(prefixe.length)}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${cle}` },
            }).catch(() => { /* le fichier a pu disparaitre autrement : la ligne part quand meme */ })
          }
          await admin.from('documents').delete().eq('id', doc.id)
          supprimes += 1
        }

        rapport.push({ objet: type, id, pieces, supprimes })
      } catch (err) {
        rapport.push({ objet: type, id, erreur: err instanceof Error ? err.message : 'échec inconnu' })
      }
    }
  }

  const reussis = rapport.filter((r) => !r.erreur).length
  console.log('[docusign reprise-archivage]', { par: utilisateur.email, reussis, total: rapport.length })
  res.status(200).json({ reussis, total: rapport.length, rapport })
}
