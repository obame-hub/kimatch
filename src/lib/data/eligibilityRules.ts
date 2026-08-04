import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EligibilityRule {
  id: string
  rule_key: string
  name: string
  description: string | null
  level: string
  is_active: boolean
  condition_field: string | null
  condition_operator: string
  condition_value: string | null
  value_operator: string
  sort_order: number
}

async function fetchEligibilityRules(): Promise<EligibilityRule[]> {
  try {
    const { data, error } = await supabase.from('eligibility_rules').select('*').order('sort_order')
    if (error) throw error
    return (data ?? []) as EligibilityRule[]
  } catch (error) {
    console.error('fetchEligibilityRules', error)
    return []
  }
}

export function useEligibilityRules() {
  return useQuery({ queryKey: ['eligibility_rules'], queryFn: fetchEligibilityRules })
}

function normText(s: string): string {
  return s.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Pilote le moteur d'éligibilité (src/lib/eligibility.ts) depuis les vraies règles
 * configurables (table `eligibility_rules`, portée de Tools) -- chaque critère est
 * individuellement activable/désactivable et conditionnable, jamais codé en dur. */
export function makeRuleConfig(rules: EligibilityRule[]) {
  const byKey = new Map(rules.map((r) => [r.rule_key, r]))

  function isRuleActive(ruleKey: string): boolean {
    return byKey.get(ruleKey)?.is_active ?? true
  }

  function getValueOperator(ruleKey: string): string {
    return byKey.get(ruleKey)?.value_operator ?? 'OU'
  }

  function isConditionMet(ruleKey: string, context: Record<string, string | undefined>): boolean {
    const rule = byKey.get(ruleKey)
    if (!rule || !rule.condition_field || !rule.condition_value) return true
    const ctxVal = context[rule.condition_field]
    if (!ctxVal) return false
    switch (rule.condition_operator) {
      case 'eq':
        return normText(ctxVal) === normText(rule.condition_value)
      case 'neq':
        return normText(ctxVal) !== normText(rule.condition_value)
      case 'in':
        return rule.condition_value.split(',').map(normText).includes(normText(ctxVal))
      case 'not_in':
        return !rule.condition_value.split(',').map(normText).includes(normText(ctxVal))
      default:
        return true
    }
  }

  return { isRuleActive, isConditionMet, getValueOperator }
}
