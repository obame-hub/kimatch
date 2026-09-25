import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerCle, comptesDuPartenaire, lire, enListe } from './_cle.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GET /api/partenaire/recommandations — LES AFFAIRES DU PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ CE QU'ON NE REND PAS, ET POURQUOI ══
 *
 * `recommandations` porte 52 colonnes. Quatre sont expressément écartées :
 *
 *     commentaire_interne   il porte son nom : ce que les commerciaux se disent entre eux
 *     marge_brute           la marge de KiWee ne regarde pas l'apporteur
 *     marge_nette           idem
 *     marge_nette_coeff     idem
 *
 * `marge_apporteur` est rendue, elle : c'est SA rémunération, il a toutes les raisons de la
 * connaître, et la lui cacher l'obligerait à nous appeler pour la demander.
 *
 * ══ L'ÉTAPE EST RENDUE EN CLAIR ══
 *
 * `etape_id` seul obligerait le partenaire à deviner une table de correspondance qu'il n'a pas. On
 * joint donc le libellé — une API qui rend des identifiants opaques n'est utilisable que par celui
 * qui l'a écrite.
 */

const CHAMPS = [
  'id', 'reference', 'nom', 'compte_id', 'date_ouverture', 'date_cloture',
  'montant', 'duree_mois', 'marge_apporteur', 'priorite', 'actif',
  'type_opportunite', 'finalite_cloture', 'date_creation',
  'etape:etapes_recommandation(libelle)',
  /* LA RELATION EST NOMMÉE EXPLICITEMENT. `recommandations` a plusieurs clés étrangères vers
     `comptes` (le compte de l'affaire, mais aussi des colonnes de rattachement) : sans le nom de
     la contrainte, PostgREST répond 300 « PGRST201 » et refuse de choisir à notre place. */
  'compte:comptes!recommandations_compte_id_fkey(nom,ville)',
].join(',')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ erreur: 'Cette API est en lecture seule.' })
    return
  }

  const partenaire = await exigerCle(req, res)
  if (!partenaire) return

  const comptes = await comptesDuPartenaire(partenaire.compteId)
  if (comptes.length === 0) {
    res.status(200).json({ recommandations: [] })
    return
  }

  const recommandations = await lire(
    `recommandations?compte_id=${enListe(comptes)}&select=${encodeURIComponent(CHAMPS)}` +
    '&order=date_ouverture.desc')

  if (!recommandations) {
    res.status(502).json({ erreur: 'Lecture impossible.' })
    return
  }

  res.status(200).json({ recommandations })
}
