/**
 * LES DONNÉES DE LA PROPOSITION COMMERCIALE PDF — exactement ce que les trois pages affichent, déjà
 * calculé et classé. Le gabarit (`gabarit.ts`) ne fait que les poser ; `construction.ts` les tire du
 * Pricer (les mêmes budgets que son tableau et que son « détail du calcul »).
 */

export type EnergieOffre = 'gaz' | 'electricite'

/** Une cellule de prix unitaire : un nombre, ou « inclus » (compris dans le P0), ou rien. */
export type PrixCellule = number | 'inclus' | null

export interface LigneOffrePdf {
  id: string
  fournisseurId: string
  fournisseur: string
  /** Une image prête à poser (adresse `data:`), ou rien : les initiales prennent la place. */
  logo: string | null
  typePrix: string | null
  dureeMois: number | null
  actuelle: boolean
  abonnement: number
  energie: number
  /** Électricité : les quatre composantes du TURPE. */
  turpe: number | null
  taxes: number
  totalHt: number
  totalTtc: number
  unitaires: {
    abonnementMois: number | null
    /** Gaz. */
    molecule?: PrixCellule
    cee?: PrixCellule
    cpb?: PrixCellule
    totalMwh?: number | null
    tqd?: PrixCellule
    ag?: PrixCellule
    /** Électricité, par poste (POINTE, HPH, HCH, HPE, HCE). */
    postes?: Record<string, PrixCellule>
    capacite?: PrixCellule
    ae?: PrixCellule
    cta: number | null
  }
  clauses: { securise: boolean; depot: boolean; engagement: boolean; renegociation: boolean; swap: boolean; tacite: boolean }
  score: number
  note: 'A' | 'B' | 'C' | 'D' | 'E'
}

export interface CarteFournisseurPdf {
  id: string
  nom: string
  logo: string | null
  qualification: string | null
  origine: string | null
  creation: number | null
  presentation: string | null
  siege: string | null
  clients: string | null
  tags: string[]
}

export interface DonneesOffrePdf {
  energie: EnergieOffre
  /** « AO-2026-0418 ». */
  reference: string
  /** Le nom du client, repris en tête des pages 2 et 3. */
  clientNom: string
  clientAdresse: string | null
  /** Date d'édition (« Consultation du »), ISO. */
  dateEdition: string
  /** Validité de l'offre, date et heure locales (« 2026-10-06T16:00 »). */
  validite: string
  ttc: boolean
  /** Le tableau des clauses contractuelles (et leur score) en page 2 — oui par défaut (04/10/2026). */
  afficherClauses: boolean
  consultant: { nom: string; email: string | null; telephone: string | null }
  contact: { nom: string; email: string | null; telephone: string | null } | null
  compteur: {
    libelle: string
    numero: string
    tarif: string | null
    profil: string | null
    car: number | null
    segment: string | null
    fta: string | null
    echeance: string | null
    /** Le dernier contrat connu n'a pas de fin : le PDF écrit « Indéterminée » (05/10/2026). */
    echeanceIndeterminee?: boolean
    conso: Record<string, number>
    puissances: Record<string, number | null>
  }
  /** L'offre de référence (l'offre actuelle), absente d'un appel d'offres sans comparatif. */
  actuelle: LigneOffrePdf | null
  /** Les offres proposées, de la moins chère à la plus chère. */
  offres: LigneOffrePdf[]
  fournisseurs: CarteFournisseurPdf[]
}
