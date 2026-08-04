// Moteur d'éligibilité fournisseur, porté depuis Tools (src/lib/eligibility.ts) -- même logique,
// mêmes critères, adapté aux types Kimatch (Compte fournisseur / Compteur / Recommandation) à la
// place des objets Salesforce-shaped (Account/Opportunity/PointDeLivraison). Chaque critère est
// individuellement activable/désactivable et conditionnable via la table `eligibility_rules`
// (voir eligibilityRules.ts), rien n'est codé en dur ici.
import type { Compte, Compteur } from '@/types/domain'
import { resolveMapping, isAndOperator, type MappingRule, type MappingContext } from '@/lib/data/mappingRules'
import { makeRuleConfig, type EligibilityRule } from '@/lib/data/eligibilityRules'

export interface EligibilityResult {
  fournisseur: Compte
  eligible: boolean
  reasons: string[]
}

export interface CotationCharacteristics {
  /** Durées choisies (mois), globales ou par compteur (pdlDurations prioritaire si présent). */
  durations: number[]
  pdlDurations?: Record<string, number[]>
  desiredDate?: Date
  /** "premiere_demande" | "actualisation" -- pilote response_delay vs update_delay. */
  requestType: string
}

function normText(s: string): string {
  return s.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function matchesViaMapping(rules: MappingRule[], fieldName: string, value: string, supplierValues: string[], context?: MappingContext): boolean {
  const mapped = resolveMapping(rules, fieldName, value, context)
  const isAnd = isAndOperator(rules, fieldName, value, context)
  return isAnd ? mapped.every((m) => supplierValues.includes(m)) : mapped.some((m) => supplierValues.includes(m))
}

function detectGaz(pdlEnergy: string, rules: MappingRule[], context?: MappingContext): boolean {
  const mapped = resolveMapping(rules, 'energy', pdlEnergy, context)
  return mapped.some((v) => normText(v).includes('gaz')) || normText(pdlEnergy).includes('gaz')
}

/** Jours ouvrés (lun-ven) entre deux dates, bornes exclues -- calendrier français uniquement
 * (Tools a un bug connu mélangeant un calendrier espagnol, volontairement non reproduit ici). */
function businessDaysBetween(from: Date, to: Date): number {
  let count = 0
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    const day = cur.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

const energieLabel = (e: 'electricite' | 'gaz') => (e === 'gaz' ? 'Gaz' : 'Électricité')

export function checkEligibility(
  fournisseur: Compte,
  compte: Compte,
  compteurs: Compteur[],
  characteristics: CotationCharacteristics,
  eligibilityRules: EligibilityRule[],
  mappingRules: MappingRule[],
): EligibilityResult {
  const reasons: string[] = []
  const { isRuleActive, isConditionMet } = makeRuleConfig(eligibilityRules)
  const shouldRun = (key: string, ctx: Record<string, string | undefined>) => isRuleActive(key) && isConditionMet(key, ctx)

  const compteContext: MappingContext = { target: compte.segment }

  if (shouldRun('partnership', compteContext)) {
    const p = normText(fournisseur.partnership ?? '')
    if (p !== 'kiwee' && p !== 'intermediaire') reasons.push('Partenariat non reconnu')
  }

  if (shouldRun('target', compteContext)) {
    const targets = fournisseur.targets ?? []
    if (targets.length === 0) reasons.push(`Ne gère pas la cible ${compte.segment || 'non renseignée'}`)
    else if (compte.segment && !matchesViaMapping(mappingRules, 'target', compte.segment, targets, compteContext)) {
      reasons.push(`Ne gère pas la cible ${compte.segment}`)
    }
  }

  if (shouldRun('score_ellipro', compteContext)) {
    const minScore = fournisseur.min_ellipro_score
    if (minScore != null) {
      const score = compte.score_ellipro != null ? parseFloat(compte.score_ellipro) : null
      if (score == null || Number.isNaN(score)) reasons.push(`La note Ellisphere du client n'est pas renseignée (minimum ${minScore})`)
      else if (score < minScore) reasons.push(`La note Ellisphere du client (${score}) est insuffisante (minimum ${minScore})`)
    }
  }

  for (const c of compteurs) {
    const pdlLabel = c.utilisation || c.site_nom
    const pdlEnergy = energieLabel(c.type_energie)
    const pdlContext: MappingContext = { ...compteContext, energy: pdlEnergy, segment: c.segment ?? undefined, tariff: c.tarif_distribution ?? undefined, profile: undefined }
    const isGaz = detectGaz(pdlEnergy, mappingRules, pdlContext)
    const condCtx: Record<string, string | undefined> = { ...pdlContext, energy: isGaz ? 'Gaz' : 'Électricité' }

    if (shouldRun('energy', condCtx)) {
      const energyTypes = fournisseur.energy_types ?? []
      if (energyTypes.length === 0) reasons.push(`Le fournisseur ne fournit pas ${pdlEnergy} (${pdlLabel})`)
      else if (!matchesViaMapping(mappingRules, 'energy', pdlEnergy, energyTypes, pdlContext)) {
        reasons.push(`Le fournisseur ne fournit pas ${pdlEnergy} (${pdlLabel})`)
      }
    }

    const echeance = c.date_echeance ? new Date(c.date_echeance) : null
    const ddf = echeance ? new Date(echeance.getTime() + 86400000) : null
    if (shouldRun('ddf', condCtx) && ddf && fournisseur.max_ddf) {
      if (ddf > new Date(fournisseur.max_ddf)) reasons.push(`Le début de fourniture pour ${pdlLabel} est trop tardif pour le fournisseur`)
    }

    if (shouldRun('tariff', condCtx)) {
      const tariffs = fournisseur.tariffs ?? []
      if (tariffs.length === 0) reasons.push(`Le fournisseur ne gère pas les tarifs pour ${pdlLabel}`)
      else if (c.tarif_distribution && !matchesViaMapping(mappingRules, 'tariff', c.tarif_distribution, tariffs, pdlContext)) {
        reasons.push(`Le fournisseur ne gère pas le tarif ${c.tarif_distribution} pour ${pdlLabel}`)
      }
    }

    if (shouldRun('segment', condCtx)) {
      const segs = fournisseur.segments ?? []
      if (segs.length === 0) reasons.push(`Le fournisseur ne gère pas les segments pour ${pdlLabel}`)
      else if (c.segment && !matchesViaMapping(mappingRules, 'segment', c.segment, segs, pdlContext)) {
        reasons.push(`Le fournisseur ne gère pas le segment ${c.segment} pour ${pdlLabel}`)
      }
    }

    if (shouldRun('consumption', condCtx) && c.consommation_annuelle_mwh != null) {
      if (fournisseur.min_consumption != null && c.consommation_annuelle_mwh < fournisseur.min_consumption) {
        reasons.push(`La consommation est trop faible (${c.consommation_annuelle_mwh} MWh) pour le fournisseur (minimum ${fournisseur.min_consumption} MWh) — ${pdlLabel}`)
      }
      if (fournisseur.max_consumption != null && c.consommation_annuelle_mwh > fournisseur.max_consumption) {
        reasons.push(`La consommation est trop élevée (${c.consommation_annuelle_mwh} MWh) pour le fournisseur (maximum ${fournisseur.max_consumption} MWh) — ${pdlLabel}`)
      }
    }

    if (shouldRun('dff', condCtx) && echeance && fournisseur.max_dff) {
      const maxDff = new Date(fournisseur.max_dff)
      const durees = characteristics.pdlDurations?.[c.id] ?? characteristics.durations
      const hasValidDuration = durees.some((mois) => {
        const dff = new Date(echeance)
        dff.setMonth(dff.getMonth() + mois)
        return dff <= maxDff
      })
      if (!hasValidDuration) reasons.push(`La fin de fourniture pour ${pdlLabel} excède la limite du fournisseur`)
    }
  }

  const charCtx: Record<string, string | undefined> = { ...compteContext, request_type: characteristics.requestType }

  if (shouldRun('response_delay', charCtx) && characteristics.desiredDate) {
    const jours = businessDaysBetween(new Date(), characteristics.desiredDate)
    if (fournisseur.response_delay_days == null) reasons.push('Délai de réponse non renseigné')
    else if (fournisseur.response_delay_days > jours) {
      reasons.push(`Le fournisseur ne dispose pas d'assez de temps (${fournisseur.response_delay_days} jours nécessaires, ${jours} jours demandés)`)
    }
  }

  if (shouldRun('update_delay', charCtx) && characteristics.desiredDate) {
    const jours = businessDaysBetween(new Date(), characteristics.desiredDate)
    if (fournisseur.update_delay_days == null) reasons.push("Délai d'actualisation non renseigné")
    else if (fournisseur.update_delay_days > jours) {
      reasons.push(`Le fournisseur ne dispose pas d'assez de temps pour actualiser (${fournisseur.update_delay_days} jours nécessaires, ${jours} jours demandés)`)
    }
  }

  return { fournisseur, eligible: reasons.length === 0, reasons }
}
