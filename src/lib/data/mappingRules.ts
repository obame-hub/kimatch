import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface MappingRule {
  id: string
  field_name: string
  salesforce_value: string
  supplier_value: string
  condition_field: string | null
  condition_value: string | null
  operator: string
}

export interface MappingContext {
  energy?: string
  segment?: string
  tariff?: string
  profile?: string
  target?: string
  [key: string]: string | undefined
}

async function fetchMappingRules(): Promise<MappingRule[]> {
  try {
    const { data, error } = await supabase.from('mapping_rules').select('*').order('field_name').order('salesforce_value')
    if (error) throw error
    return (data ?? []) as MappingRule[]
  } catch (error) {
    console.error('fetchMappingRules', error)
    return []
  }
}

export function useMappingRules() {
  return useQuery({ queryKey: ['mapping_rules'], queryFn: fetchMappingRules })
}

function normText(s: string): string {
  return s.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function matchingRules(rules: MappingRule[], fieldName: string, value: string, context?: MappingContext): MappingRule[] {
  return rules.filter((r) => {
    if (r.field_name !== fieldName || r.salesforce_value !== value) return false
    if (r.condition_field && r.condition_value) {
      const ctxVal = context?.[r.condition_field]
      if (!ctxVal) return false
      if (normText(ctxVal) !== normText(r.condition_value)) return false
    }
    return true
  })
}

/** Traduit une valeur Kimatch brute vers le(s) vocabulaire(s) fournisseur (Tools:
 * use-mapping-rules.ts). Repli : si aucune règle n'existe pour ce champ/valeur, comparaison en
 * exact match sur la valeur brute -- les règles ne servent qu'aux cas d'exception. */
export function resolveMapping(rules: MappingRule[], fieldName: string, value: string, context?: MappingContext): string[] {
  const matching = matchingRules(rules, fieldName, value, context)
  if (matching.length === 0) return [value]
  return matching.map((r) => r.supplier_value)
}

export function isAndOperator(rules: MappingRule[], fieldName: string, value: string, context?: MappingContext): boolean {
  return matchingRules(rules, fieldName, value, context).some((r) => r.operator === 'ET')
}
