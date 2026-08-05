import type { Compteur } from '@/types/domain'

/** Commission estimée d'une cotation -- même formule que computeEstimatedAmount() dans
 * salesforce-actions.ts (Tools) :
 * - PDL électricité segment "C5" : forfait fixe de 140 € par PDL (sans durée ni ×3).
 * - Autres PDL : (consommation annuelle MWh / 12) × durée max sélectionnée, sommé puis ×3.
 * Kimatch choisit les durées une seule fois pour toute la cotation (pas de durée par PDL comme
 * dans Tools) -- la durée max de cette sélection globale est donc appliquée à chaque PDL non-C5. */
const C5_FLAT_AMOUNT = 140

export function computeEstimatedCommission(compteurs: Compteur[], durees: number[]): number {
  const maxDuree = durees.length > 0 ? Math.max(...durees) : 12
  let variableTotal = 0
  let c5Total = 0
  for (const c of compteurs) {
    if (c.type_energie === 'electricite' && c.segment === 'C5') {
      c5Total += C5_FLAT_AMOUNT
      continue
    }
    const conso = c.consommation_annuelle_mwh ?? 0
    variableTotal += (conso / 12) * maxDuree
  }
  return variableTotal * 3 + c5Total
}
