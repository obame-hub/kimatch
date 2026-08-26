/**
 * LA PROCHAINE ACTION D'UN SIGNAL — les libellés de la maquette de Michel du 26/08/2026.
 *
 * Son écran Signaux porte, en pied de chaque carte, « Prochaine action » et un libellé précis :
 * « Qualifier la variation », « Analyser les compteurs », « Associer un contact », « Compléter les
 * données », « Vérifier la date », « Contacter le responsable énergie », « Créer une piste ».
 *
 * C'était ma question ouverte depuis deux jours, et sa maquette y répond — mais pas comme je
 * l'attendais. Je cherchais une action PAR TYPE ; ses libellés dépendent du type ET DE LA COLONNE.
 * Un pic de consommation qui vient d'arriver se « qualifie » ; le même, une fois passé à qualifier,
 * s'« analyse ». C'est logique : la question n'est pas la même selon qu'on découvre le signal ou qu'on
 * l'instruit.
 *
 * ══ CE QUI EST REPRIS DE SA MAQUETTE, ET CE QUI EST DÉDUIT ══
 *
 * Les six combinaisons qu'il montre sont reprises à la lettre. Pour les autres, un repli par statut,
 * et c'est assumé : ses badges — « Consommation », « Données », « Échéance », « Qualité »,
 * « Puissance », « Piste » — sont son vocabulaire de maquette, pas nos onze types de référence. En
 * face de `MARCHE_FAVORABLE` ou `NOUVELLE_FACTURE`, il n'a rien dessiné, et inventer un verbe par type
 * aurait produit onze libellés dont dix n'auraient été validés par personne.
 *
 * LE REPLI DIT LA SEULE CHOSE VRAIE À CE STADE : un signal nouveau se qualifie, un signal qualifié
 * devient une piste. C'est le mouvement de son pipeline, quel que soit le motif du signal.
 */

export interface ProchaineAction {
  /** Le libellé affiché — et le titre de la tâche créée, mot pour mot. */
  libelle: string
}

/**
 * @param codeType   code de `types_signaux` — ECHEANCE_CONTRAT, CONSOMMATION_ANORMALE, …
 * @param codeStatut code de `statuts_signaux` — NOUVEAU, A_QUALIFIER, CONVERTI, ECARTE
 */
export function prochaineActionSignal(
  codeType: string | null | undefined,
  codeStatut: string | null | undefined,
): ProchaineAction | null {
  // Un signal écarté n'a plus de prochaine action : c'est le sens de « écarté ».
  if (codeStatut === 'ECARTE') return null

  // ── Le troisième temps de son pipeline : un signal qualifié devient une piste. Trois cartes sur
  //    trois portent ce libellé dans sa colonne « Qualifiés », sans égard pour le type. ──
  if (codeStatut === 'CONVERTI') return { libelle: 'Créer une piste' }

  const nouveau = codeStatut === 'NOUVEAU'

  switch (codeType) {
    // « Pic de consommation » → qualifier ; « Baisse de consommation » → analyser.
    case 'CONSOMMATION_ANORMALE':
      return { libelle: nouveau ? 'Qualifier la variation' : 'Analyser les compteurs' }

    // « Compteurs sans contact » → associer ; « Données incomplètes » → compléter.
    case 'DONNEE_MANQUANTE':
      return { libelle: nouveau ? 'Associer un contact' : 'Compléter les données' }

    // « Échéance en approche » → vérifier la date, à tous les stades : c'est la date qui décide.
    case 'ECHEANCE_CONTRAT':
      return { libelle: 'Vérifier la date' }

    // « Hausse de puissance appelée » → contacter le responsable énergie. Le type le plus proche
    // dans notre référentiel est la demande client ; sa maquette l'appelle « Puissance ».
    case 'DEMANDE_CLIENT':
      return { libelle: 'Contacter le responsable énergie' }

    default:
      return { libelle: nouveau ? 'Qualifier le signal' : 'Créer une piste' }
  }
}
