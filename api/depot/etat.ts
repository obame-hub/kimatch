import type { VercelRequest, VercelResponse } from '@vercel/node'
import { admin, lireBoite, societeDeLaBoite, MAX_FICHIERS, MAX_OCTETS, TYPES_ACCEPTES } from './_boite.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * « CE LIEN EST-IL ENCORE BON ? » — LA SEULE QUESTION QUE POSE LA PAGE AVANT DE S'AFFICHER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Point d'entrée PUBLIC : pas de session, le jeton fait foi. Il ne rend que ce qu'il faut pour
 * dessiner la page — l'état de la boîte, le nom de la société, et les limites de dépôt.
 *
 * ══ IL NE RÉVÈLE RIEN DE PLUS QUE CE QUE LE DESTINATAIRE SAIT DÉJÀ ══
 *
 * Pas de nom de contact, pas d'adresse, pas d'identifiant de piste. Quelqu'un qui récupère le lien
 * par accident — un mail transféré, un historique de navigation partagé — apprend le nom d'une
 * société qu'il avait déjà sous les yeux dans le mail. C'est le strict nécessaire pour que le
 * client reconnaisse SA boîte et ne dépose pas les factures d'un autre.
 *
 * ══ L'OUVERTURE EST DATÉE ══
 *
 * Un lien cliqué mais jamais rempli est une information : le client a vu la demande et n'a pas
 * donné suite. Le commercial le lira dans le fil, et relancera autrement qu'en redemandant.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const db = admin()
  if (!db) {
    res.status(200).json({ ok: false, refus: 'INDISPONIBLE' })
    return
  }

  const jeton = typeof req.query?.jeton === 'string' ? req.query.jeton : undefined
  const lu = await lireBoite(db, jeton)
  if ('refus' in lu) {
    res.status(200).json({ ok: false, refus: lu.refus })
    return
  }

  /* PREMIÈRE OUVERTURE SEULEMENT : `ouvert_le` dit quand le client a vu la demande, pas combien de
     fois il est revenu. Écraser la date à chaque visite effacerait le seul fait utile. */
  if (!lu.boite.ouvert_le) {
    await db.from('depots_factures').update({ ouvert_le: new Date().toISOString() }).eq('id', lu.boite.id)
  }

  res.status(200).json({
    ok: true,
    societe: await societeDeLaBoite(db, lu.boite),
    expire_le: lu.boite.expire_le,
    limites: {
      fichiers: MAX_FICHIERS,
      octets: MAX_OCTETS,
      types: TYPES_ACCEPTES,
    },
  })
}
