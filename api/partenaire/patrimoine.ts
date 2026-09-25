import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerCle, comptesDuPartenaire, lire, enListe } from './_cle.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GET /api/partenaire/patrimoine — LES COMPTES, SITES ET COMPTEURS DU PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ LES CHAMPS SONT CHOISIS UN PAR UN ══
 *
 * Pas de `select *`. `comptes` porte 39 colonnes, dont `taux_commission_courtier`,
 * `taux_repartition`, `limite_ellipro` et `score_ellipro` : les conditions commerciales de KiWee et
 * la solidité financière d'un client n'ont rien à faire chez un apporteur. Un `*` les aurait
 * livrées, et le jour où une colonne s'ajoute il les livrerait encore sans que personne ne l'ait
 * décidé.
 *
 * La liste ci-dessous est donc la définition de ce qu'on accepte de rendre. Elle se relit.
 *
 * ══ LE PÉRIMÈTRE NE VIENT JAMAIS DE LA REQUÊTE ══
 *
 * Aucun paramètre ne désigne un compte. Le périmètre est déduit de la clé, par
 * `comptesDuPartenaire`. C'est la règle de toute cette API, et c'est elle qui la rend tenable : les
 * trois failles trouvées côté Kimatch venaient toutes d'un identifiant accepté depuis le corps de
 * la requête.
 */

const CHAMPS_COMPTE = 'id,reference,nom,siret,siren,ville,code_postal,rue,segment,type_compte,actif,date_creation'
const CHAMPS_SITE = 'id,reference,compte_id,nom,adresse,code_postal,ville,surface_m2,actif'
const CHAMPS_COMPTEUR = 'id,reference,site_id,numero_point,libelle,consommation_annuelle_mwh,date_echeance,actif'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* LECTURE SEULE, ET DITE COMME TELLE. Un POST refusé par un 405 explicite vaut mieux qu'un
     endpoint qui ignore la méthode : le jour où quelqu'un tente une écriture, il doit lire
     pourquoi elle n'existe pas plutôt que de croire à une panne. */
  if (req.method !== 'GET') {
    res.status(405).json({ erreur: 'Cette API est en lecture seule.' })
    return
  }

  const partenaire = await exigerCle(req, res)
  if (!partenaire) return

  const comptes = await comptesDuPartenaire(partenaire.compteId)
  if (comptes.length === 0) {
    res.status(200).json({ comptes: [], sites: [], compteurs: [] })
    return
  }

  const lesComptes = await lire<Record<string, unknown>>(
    `comptes?id=${enListe(comptes)}&select=${CHAMPS_COMPTE}&order=nom`)
  if (!lesComptes) {
    res.status(502).json({ erreur: 'Lecture impossible.' })
    return
  }

  const sites = (await lire<{ id: string }>(
    `sites?compte_id=${enListe(comptes)}&select=${CHAMPS_SITE}&order=nom`)) ?? []

  /* LES COMPTEURS SUIVENT LEURS SITES, pas le compte : `compteurs.compte_id` existe mais c'est
     `site_id` qui fait foi dans le modèle. Passer par les sites évite de rendre un compteur dont le
     site aurait changé de main. */
  const idsSites = sites.map((s) => s.id)
  const compteurs = idsSites.length
    ? (await lire(`compteurs?site_id=${enListe(idsSites)}&select=${CHAMPS_COMPTEUR}&order=numero_point`)) ?? []
    : []

  res.status(200).json({ comptes: lesComptes, sites, compteurs })
}
