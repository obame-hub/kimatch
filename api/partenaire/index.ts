import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exigerCle } from './_cle.js'

/**
 * GET /api/partenaire — CE QUE CETTE API SAIT FAIRE
 *
 * Une API sans porte d'entrée lisible oblige à envoyer un PDF par mail, qui sera périmé au premier
 * changement. Ici la documentation vient de l'API elle-même : elle ne peut pas mentir sur ce qui
 * existe, puisqu'elle est servie par le même déploiement.
 *
 * ELLE EXIGE UNE CLÉ VALIDE, comme les autres. Publier la liste des ressources à qui la demande
 * renseignerait sur la structure interne sans contrepartie.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ erreur: 'Cette API est en lecture seule.' })
    return
  }

  const partenaire = await exigerCle(req, res)
  if (!partenaire) return

  res.status(200).json({
    api: 'KiWee Énergie — API partenaire',
    version: 1,
    lecture_seule: true,
    votre_cle: partenaire.libelle,
    ressources: [
      {
        chemin: 'GET /api/partenaire/patrimoine',
        rend: 'Vos comptes, leurs sites et leurs compteurs.',
        champs: {
          comptes: 'id, reference, nom, siret, siren, ville, code_postal, rue, segment, type_compte, actif, date_creation',
          sites: 'id, reference, compte_id, nom, adresse, code_postal, ville, surface_m2, actif',
          compteurs: 'id, reference, site_id, numero_point, libelle, consommation_annuelle_mwh, date_echeance, actif',
        },
      },
      {
        chemin: 'GET /api/partenaire/recommandations',
        rend: 'Les affaires ouvertes sur vos comptes, leur étape et votre marge d’apporteur.',
        champs: 'id, reference, nom, compte_id, date_ouverture, date_cloture, montant, duree_mois, marge_apporteur, priorite, actif, type_opportunite, finalite_cloture, etape, compte',
      },
    ],
    authentification: {
      entete: 'Authorization: Bearer <votre clé>',
      remarque: 'La clé vous est remise une seule fois. KiWee ne peut pas la relire ; en cas de perte, une nouvelle clé est émise et l’ancienne révoquée.',
    },
    perimetre:
      'Vous ne voyez que votre propre compte et les comptes dont vous êtes l’apporteur. Aucun paramètre ne permet d’élargir ce périmètre : il est déduit de votre clé.',
  })
}
