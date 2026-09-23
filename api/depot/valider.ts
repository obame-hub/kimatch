import type { VercelRequest, VercelResponse } from '@vercel/node'
import { admin, lireBoite, SEAU } from './_boite.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * « J'AI FINI » — LE SEUL MOMENT QUI COMPTE DANS TOUT LE PARCOURS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « dès que c'est fait et envoyé, le commercial doit recevoir une
 * notification lui indiquant que des factures ont été reçues. Elles doivent être jointes à la piste
 * ou à l'opportunité en attendant la création du périmètre. »
 *
 * ══ POURQUOI UNE VALIDATION EXPLICITE, ET NON LE DERNIER TÉLÉVERSEMENT ══
 *
 * Un client qui dépose trois fichiers en dépose parfois un quatrième deux minutes plus tard.
 * Notifier au premier fichier ferait trois notifications pour un seul envoi, et surtout ferait
 * partir le commercial avant que tout soit arrivé. C'est le client qui dit qu'il a fini.
 *
 * ══ QUATRE ÉCRITURES, ET L'ORDRE COMPTE ══
 *
 * 1. LES DOCUMENTS, sur la piste ou l'opportunité — c'est la demande de William, « en attendant la
 *    création du périmètre ». Ils sont posés d'abord : une notification qui pointe vers des
 *    documents absents est pire que pas de notification.
 * 2. LE DÉPÔT est daté. C'est LUI le fait qui manquait à la base : « j'ai reçu une facture » n'avait
 *    aucune trace jusqu'ici, et la conversion devait se contenter du statut « En attente de
 *    facture », c'est-à-dire de ce qu'on avait DEMANDÉ.
 * 3. L'INTERACTION, pour que le fil d'activité le montre à sa place chronologique, du côté du
 *    client — c'est lui qui a agi, pas nous.
 * 4. LA NOTIFICATION, en dernier : elle annonce un état qui est déjà vrai.
 *
 * ══ AUCUNE DES QUATRE NE FAIT ÉCHOUER LES AUTRES ══
 *
 * Le client a envoyé ses fichiers ; ils sont dans le seau. Si la notification ne part pas, on ne va
 * pas lui répondre « échec » et lui faire tout recommencer — on enregistre ce qu'on peut et on le
 * remercie. Le commercial verra les documents sur la fiche même sans cloche.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const db = admin()
  if (!db) {
    res.status(200).json({ ok: false, erreur: 'Dépôt indisponible pour le moment.' })
    return
  }

  const { jeton } = (req.body ?? {}) as { jeton?: string }
  const lu = await lireBoite(db, jeton)
  if ('refus' in lu) {
    res.status(200).json({ ok: false, refus: lu.refus })
    return
  }
  const boite = lu.boite

  const { data: fichiers } = await db
    .from('depots_fichiers')
    .select('id, nom_fichier, chemin, mime_type')
    .eq('depot_id', boite.id)
  const lot = (fichiers ?? []) as { id: string; nom_fichier: string; chemin: string; mime_type: string | null }[]
  if (lot.length === 0) {
    res.status(200).json({ ok: false, erreur: 'Aucun fichier déposé.' })
    return
  }

  const cible = boite.opportunite_id
    ? { type: 'opportunite', id: boite.opportunite_id }
    : { type: 'piste', id: boite.piste_id as string }

  /* ── 1 · Les documents, sur la fiche ── */
  const { data: typeFacture } = await db
    .from('types_documents').select('id').eq('code', 'FACTURE').maybeSingle()
  const typeId = (typeFacture as { id: string } | null)?.id ?? null

  if (typeId) {
    for (const f of lot) {
      /* L'URL EST CELLE DU SEAU PRIVÉ : elle ne s'ouvre qu'avec une session Kimatch. Le lien public
         du client ne sert qu'à DÉPOSER, jamais à relire ce qu'il a envoyé. */
      const { data: doc } = await db.from('documents').insert({
        type_document_id: typeId,
        nom: f.nom_fichier,
        nom_fichier: f.nom_fichier,
        url: `${SEAU}/${f.chemin}`,
        mime_type: f.mime_type,
        entite_type: cible.type,
        entite_id: cible.id,
        proprietaire_id: boite.destinataire_profil_id,
        commentaire: 'Déposé par le client depuis le lien de dépôt de factures.',
        actif: true,
      }).select('id').maybeSingle()
      const docId = (doc as { id: string } | null)?.id
      if (docId) await db.from('depots_fichiers').update({ document_id: docId }).eq('id', f.id)
    }
  }

  /* ── 2 · Le fait, daté ── */
  await db.from('depots_factures')
    .update({ depose_le: new Date().toISOString() })
    .eq('id', boite.id)

  /* ── 3 · Le fil d'activité, du côté du client ── */
  const { data: typeAutre } = await db
    .from('types_interactions').select('id').eq('code', 'AUTRE').maybeSingle()
  const typeInteraction = (typeAutre as { id: string } | null)?.id
  if (typeInteraction) {
    await db.from('interactions').insert({
      type_interaction_id: typeInteraction,
      date_interaction: new Date().toISOString(),
      sens: 'ENTRANT',
      objet: `${lot.length} facture${lot.length > 1 ? 's' : ''} reçue${lot.length > 1 ? 's' : ''}`,
      resume: lot.map((f) => f.nom_fichier).join('\n'),
      piste_id: boite.piste_id,
      opportunite_id: boite.opportunite_id,
      contact_id: boite.contact_id,
      compte_id: boite.compte_id,
      proprietaire_id: boite.destinataire_profil_id,
      actif: true,
    })
  }

  /* ── 4 · La cloche ── */
  if (boite.destinataire_profil_id) {
    await db.from('notifications').insert({
      destinataire_profil_id: boite.destinataire_profil_id,
      titre: `${lot.length} facture${lot.length > 1 ? 's' : ''} reçue${lot.length > 1 ? 's' : ''}`,
      message: lot.map((f) => f.nom_fichier).join(', '),
      lien: cible.type === 'opportunite' ? `/opportunites/${cible.id}` : `/pistes/${cible.id}`,
      entite_type: cible.type,
      entite_id: cible.id,
      categorie: 'factures_recues',
    })
  }

  res.status(200).json({ ok: true, fichiers: lot.length })
}
