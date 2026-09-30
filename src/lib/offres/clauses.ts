import type { ClausesOffre } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CLAUSES CONTRACTUELLES D'UNE OFFRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le modèle de proposition commerciale validé le 30/09/2026 (William, Michel, les commerciaux) les
 * affiche en page 2 et en tire une note. Ce module dit, pour chacune, ce qu'elle est, son défaut, et
 * de quel côté elle pèse.
 *
 * « Le score valorise les protections du contrat (contrat sécurisé, renégociation anticipée, SWAP)
 * et pénalise les contraintes (dépôt de garantie, engagement de consommation, tacite
 * reconduction) » — texte du modèle, page 2.
 *
 * LA NOTE ELLE-MÊME N'EST PAS CALCULÉE ICI : combien pèse chaque clause, et où tombent les seuils
 * de A à E, reste à fixer avec William. `pointsDesClauses` rend seulement le décompte — protections
 * présentes, contraintes présentes — sur lequel la règle se posera.
 */

export interface DefinitionClause {
  cle: keyof ClausesOffre
  libelle: string
  aide: string
  /** Vrai : elle protège le client. Faux : elle le contraint. */
  protection: boolean
  /** La valeur par défaut, selon la règle de William. */
  defaut: boolean
}

export const CLAUSES: DefinitionClause[] = [
  { cle: 'renegociation_anticipee', libelle: 'Renégociation anticipée', aide: 'Le client peut renégocier avant la fin du contrat.', protection: true, defaut: false },
  { cle: 'swap', libelle: 'SWAP', aide: 'Le client peut passer du fixe à l’indexé (ou l’inverse) en cours de contrat.', protection: true, defaut: false },
  { cle: 'depot_garantie', libelle: 'Dépôt de garantie', aide: 'Le fournisseur exige un dépôt avant de fournir.', protection: false, defaut: false },
  { cle: 'engagement_consommation', libelle: 'Engagement de consommation', aide: 'Le client s’engage sur un volume (Picoty, sur certains dossiers).', protection: false, defaut: false },
  { cle: 'tacite_reconduction', libelle: 'Tacite reconduction', aide: 'Cochée par défaut : décochez si le fournisseur ne la prévoit pas.', protection: false, defaut: true },
]

/** « Contrat sécurisé, ça veut dire est-ce que j'ai demandé un prix fixe ? » (William, 30/09/2026). */
export function contratSecurise(typePrix: string | null | undefined): boolean {
  return /fixe/i.test(typePrix ?? '')
}

export function pointsDesClauses(clauses: ClausesOffre, typePrix: string | null | undefined) {
  const protections = [contratSecurise(typePrix), clauses.renegociation_anticipee, clauses.swap].filter(Boolean).length
  const contraintes = [clauses.depot_garantie, clauses.engagement_consommation, clauses.tacite_reconduction].filter(Boolean).length
  return { protections, contraintes, protectionsPossibles: 3, contraintesPossibles: 3 }
}
