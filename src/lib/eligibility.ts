// Moteur d'éligibilité fournisseur, porté depuis Tools (src/lib/eligibility.ts) -- même logique,
// mêmes critères, adapté aux types Kimatch (Compte fournisseur / Compteur / Recommandation) à la
// place des objets Salesforce-shaped (Account/Opportunity/PointDeLivraison). Chaque critère est
// individuellement activable/désactivable et conditionnable via la table `eligibility_rules`
// (voir eligibilityRules.ts), rien n'est codé en dur ici.
import type { Compte, Compteur } from '@/types/domain'
import { resolveMapping, isAndOperator, type MappingRule, type MappingContext } from '@/lib/data/mappingRules'
import { makeRuleConfig, type EligibilityRule } from '@/lib/data/eligibilityRules'
import { estJourOuvreFR } from '@/lib/joursFeries'

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
  /**
   * ══ LES MANDATS DU PÉRIMÈTRE — William, 06/10/2026 ══
   * « Périmètre couvert par un mandat KiWee (donne accès à tous les fournisseurs KiWee) et par un
   * mandat ENERGIX (optionnel — donne accès à tous les fournisseurs ENERGIX). » Absent : la règle
   * ne joue pas (ancien assistant de version).
   */
  mandats?: { kiwee: boolean; energix: boolean }
  /** Le début de fourniture de chaque compteur (lendemain de l'échéance retenue, à défaut une date posée). */
  debutsFourniture?: Record<string, Date>
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

/** Jours ouvrés entre deux dates, du lendemain de `from` jusqu'à `to` compris — calendrier français,
 * week-ends ET jours fériés exclus (06/10/2026 : un fournisseur ne répond pas un 15 août). */
export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0
  const cur = new Date(from)
  cur.setHours(12, 0, 0, 0)
  const end = new Date(to)
  end.setHours(12, 0, 0, 0)
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    if (estJourOuvreFR(cur)) count++
  }
  return count
}

const dateFr = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('fr-FR')
const nb = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

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

  if (characteristics.mandats && shouldRun('mandat', compteContext)) {
    const energix = normText(fournisseur.intermediary ?? '') === 'energix'
    const kiwee = normText(fournisseur.partnership ?? '') === 'kiwee'
    if (energix && !characteristics.mandats.energix) reasons.push('Aucun mandat Energix actif ne couvre ces compteurs : les fournisseurs Energix ne sont pas accessibles')
    if (kiwee && !characteristics.mandats.kiwee) reasons.push('Aucun mandat KiWee actif ne couvre ces compteurs')
  }

  if (shouldRun('target', compteContext)) {
    const targets = fournisseur.targets ?? []
    if (targets.length === 0) reasons.push('Cibles non renseignées sur la fiche du fournisseur')
    else if (!compte.segment) reasons.push('Type de compte non renseigné (Entreprise, Syndic professionnel…)')
    else if (!matchesViaMapping(mappingRules, 'target', compte.segment, targets, compteContext)) {
      reasons.push(`Ne travaille pas avec les comptes « ${compte.segment} » (${targets.join(', ')})`)
    }
  }

  if (shouldRun('score_ellipro', compteContext)) {
    const minScore = fournisseur.min_ellipro_score
    if (minScore != null) {
      const score = compte.score_ellipro != null ? parseFloat(compte.score_ellipro) : null
      if (score == null || Number.isNaN(score)) reasons.push(`Note Ellipro du client inconnue : ce fournisseur demande au moins ${minScore}/10`)
      else if (score < minScore) reasons.push(`Note Ellipro du client ${Math.round(score)}/10 : ce fournisseur demande au moins ${minScore}/10`)
    }
  }

  for (const c of compteurs) {
    const pdlLabel = c.utilisation || c.site_nom
    const pdlEnergy = energieLabel(c.type_energie)
    const pdlContext: MappingContext = { ...compteContext, energy: pdlEnergy, segment: c.segment ?? undefined, tariff: c.tarif_distribution ?? undefined, profile: c.profil_consommation ?? undefined }
    const isGaz = detectGaz(pdlEnergy, mappingRules, pdlContext)
    const condCtx: Record<string, string | undefined> = { ...pdlContext, energy: isGaz ? 'Gaz' : 'Électricité' }

    if (shouldRun('energy', condCtx)) {
      const energyTypes = fournisseur.energy_types ?? []
      if (energyTypes.length === 0) reasons.push('Énergies non renseignées sur la fiche du fournisseur')
      else if (!matchesViaMapping(mappingRules, 'energy', pdlEnergy, energyTypes, pdlContext)) {
        reasons.push(`Ne fournit pas ${isGaz ? 'le gaz' : 'l’électricité'}`)
      }
    }

    const echeance = c.date_echeance ? new Date(c.date_echeance) : null
    const ddf = characteristics.debutsFourniture?.[c.id] ?? (echeance ? new Date(echeance.getTime() + 86400000) : null)
    if (shouldRun('ddf', condCtx) && ddf && fournisseur.max_ddf) {
      if (ddf > new Date(fournisseur.max_ddf)) reasons.push(`Début de fourniture le ${dateFr(ddf)} : ce fournisseur ne livre pas après le ${dateFr(fournisseur.max_ddf)} (${pdlLabel})`)
    }

    if (shouldRun('tariff', condCtx)) {
      const tariffs = fournisseur.tariffs ?? []
      if (tariffs.length === 0) reasons.push('Tarifs gaz non renseignés sur la fiche du fournisseur')
      else if (c.tarif_distribution && !matchesViaMapping(mappingRules, 'tariff', c.tarif_distribution, tariffs, pdlContext)) {
        reasons.push(`Tarif ${c.tarif_distribution} non pris en charge (${tariffs.join(', ')}) — ${pdlLabel}`)
      }
    }

    /* ══ LE PROFIL GAZ — 06/10/2026 ══ La règle existait, active, mais n'était vérifiée nulle part. */
    if (shouldRun('profile', condCtx) && isGaz) {
      const profils = fournisseur.profiles ?? []
      if (profils.length === 0) reasons.push('Profils gaz non renseignés sur la fiche du fournisseur')
      else if (c.profil_consommation && !matchesViaMapping(mappingRules, 'profile', c.profil_consommation, profils, pdlContext)) {
        reasons.push(`Profil ${c.profil_consommation} non pris en charge (${profils.join(', ')}) — ${pdlLabel}`)
      }
    }

    if (shouldRun('segment', condCtx)) {
      const segs = fournisseur.segments ?? []
      if (segs.length === 0) reasons.push('Segments électricité non renseignés sur la fiche du fournisseur')
      else if (c.segment && !matchesViaMapping(mappingRules, 'segment', c.segment, segs, pdlContext)) {
        reasons.push(`Segment ${c.segment} non pris en charge (${segs.join(', ')}) — ${pdlLabel}`)
      }
    }

    if (shouldRun('consumption', condCtx) && c.consommation_annuelle_mwh != null) {
      if (fournisseur.min_consumption != null && c.consommation_annuelle_mwh < fournisseur.min_consumption) {
        reasons.push(`Consommation trop faible : ${nb(c.consommation_annuelle_mwh)} MWh pour un minimum de ${nb(fournisseur.min_consumption)} MWh — ${pdlLabel}`)
      }
      if (fournisseur.max_consumption != null && c.consommation_annuelle_mwh > fournisseur.max_consumption) {
        reasons.push(`Consommation trop élevée : ${nb(c.consommation_annuelle_mwh)} MWh pour un maximum de ${nb(fournisseur.max_consumption)} MWh — ${pdlLabel}`)
      }
    }

    if (shouldRun('dff', condCtx) && ddf && fournisseur.max_dff) {
      const maxDff = new Date(fournisseur.max_dff)
      const durees = characteristics.pdlDurations?.[c.id] ?? characteristics.durations
      const hasValidDuration = durees.some((mois) => {
        const dff = new Date(ddf)
        dff.setMonth(dff.getMonth() + mois)
        return dff <= maxDff
      })
      if (!hasValidDuration) {
        reasons.push(durees.length === 1 && durees[0] <= 1
          ? `Fin de fourniture au plus tard le ${dateFr(maxDff)} : trop tôt pour un début le ${dateFr(ddf)} (${pdlLabel})`
          : `Fin de fourniture au plus tard le ${dateFr(maxDff)} : aucune des durées demandées n'y tient (${pdlLabel})`)
      }
    }
  }

  const charCtx: Record<string, string | undefined> = { ...compteContext, request_type: characteristics.requestType }

  if (shouldRun('response_delay', charCtx) && characteristics.desiredDate) {
    const jours = businessDaysBetween(new Date(), characteristics.desiredDate)
    if (fournisseur.response_delay_days == null) reasons.push('Délai de réponse non renseigné sur la fiche du fournisseur')
    else if (fournisseur.response_delay_days > jours) {
      reasons.push(`Pas assez de temps : il lui faut ${fournisseur.response_delay_days} jour${fournisseur.response_delay_days > 1 ? 's' : ''} ouvré${fournisseur.response_delay_days > 1 ? 's' : ''} pour répondre, la date demandée en laisse ${jours}`)
    }
  }

  if (shouldRun('update_delay', charCtx) && characteristics.desiredDate) {
    const jours = businessDaysBetween(new Date(), characteristics.desiredDate)
    if (fournisseur.update_delay_days == null) reasons.push('Délai d’actualisation non renseigné sur la fiche du fournisseur')
    else if (fournisseur.update_delay_days > jours) {
      reasons.push(`Pas assez de temps : il lui faut ${fournisseur.update_delay_days} jour${fournisseur.update_delay_days > 1 ? 's' : ''} ouvré${fournisseur.update_delay_days > 1 ? 's' : ''} pour actualiser son offre, la date demandée en laisse ${jours}`)
    }
  }

  /* Une même raison sur plusieurs compteurs ne se répète pas (multisite). */
  const uniques = [...new Set(reasons)]
  return { fournisseur, eligible: uniques.length === 0, reasons: uniques }
}
