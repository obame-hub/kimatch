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
 * « Le score valorise les protections du contrat (contrat sécurisé, renégociation anticipée, SWAP — retiré le 05/10/2026)
 * et pénalise les contraintes (dépôt de garantie, engagement de consommation, tacite
 * reconduction) » — texte du modèle, page 2.
 *
 * `pointsDesClauses` rend le décompte — protections présentes, contraintes présentes ;
 * `scoreDesClauses` la note, selon la règle de Claude Design (04/10/2026, plus bas).
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
  { cle: 'depot_garantie', libelle: 'Dépôt de garantie', aide: 'Le fournisseur exige un dépôt avant de fournir.', protection: false, defaut: false },
  { cle: 'engagement_consommation', libelle: 'Engagement de consommation', aide: 'Le client s’engage sur un volume (Picoty, sur certains dossiers).', protection: false, defaut: false },
  { cle: 'tacite_reconduction', libelle: 'Tacite reconduction', aide: 'Cochée par défaut : décochez si le fournisseur ne la prévoit pas.', protection: false, defaut: true },
]

/** « Contrat sécurisé, ça veut dire est-ce que j'ai demandé un prix fixe ? » (William, 30/09/2026). */
export function contratSecurise(typePrix: string | null | undefined): boolean {
  return /fixe/i.test(typePrix ?? '')
}

export function pointsDesClauses(clauses: ClausesOffre, typePrix: string | null | undefined) {
  const protections = [contratSecurise(typePrix), clauses.renegociation_anticipee].filter(Boolean).length
  const contraintes = [clauses.depot_garantie, clauses.engagement_consommation, clauses.tacite_reconduction].filter(Boolean).length
  return { protections, contraintes, protectionsPossibles: 2, contraintesPossibles: 3 }
}

/**
 * ══ LE SCORE DES CLAUSES (de 0 à 100) ET SA NOTE (A à E) — 04/10/2026 ══
 *
 * La règle du modèle de Claude Design (cahier « proposition commerciale », § 6.4), qui redonne tous les
 * scores des deux maquettes (gaz 70, 95, 65, 45, 85 ; électricité 85, 95, 25, 85) :
 *
 *                              Gaz (base 65)      Électricité (base 70)
 *   Contrat sécurisé          +15 / −15 absent    +25 / −15 absent
 *   Renégociation anticipée   +10 / −10 absente   —
 *   Dépôt de garantie         −15 si présent      −20 si présent
 *   Engagement de conso.      −10 si présent      —
 *   Tacite reconduction        −5 si présente     −10 si présente
 *
 * Note : ≥ 85 A · ≥ 70 B · ≥ 55 C · ≥ 40 D · sinon E. Borné de 0 à 100.
 */
export interface ScoreClauses { score: number; note: 'A' | 'B' | 'C' | 'D' | 'E' }

export function scoreDesClauses(
  clauses: Pick<ClausesOffre, 'depot_garantie' | 'engagement_consommation' | 'renegociation_anticipee' | 'swap' | 'tacite_reconduction'>,
  typePrix: string | null | undefined,
  energie: 'gaz' | 'electricite',
): ScoreClauses {
  const securise = contratSecurise(typePrix)
  let score: number
  if (energie === 'gaz') {
    /* Sans le SWAP depuis le 05/10/2026 (William : « supprime-la ») : le critère sort, ni bonus ni
       malus — la base reste 65, et le meilleur contrat vaut 90 (toujours A). */
    score = 65 + (securise ? 15 : -15) + (clauses.renegociation_anticipee ? 10 : -10)
      - (clauses.depot_garantie ? 15 : 0) - (clauses.engagement_consommation ? 10 : 0) - (clauses.tacite_reconduction ? 5 : 0)
  } else {
    score = 70 + (securise ? 25 : -15) - (clauses.depot_garantie ? 20 : 0) - (clauses.tacite_reconduction ? 10 : 0)
  }
  score = Math.max(0, Math.min(100, score))
  const note = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'E'
  return { score, note }
}
