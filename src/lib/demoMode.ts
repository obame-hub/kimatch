import { isSupabaseConfigured } from '@/lib/supabase'

export const DEMO_BYPASS_KEY = 'kiwee-demo-bypass'

/**
 * Vrai si Supabase n'est pas configuré, OU si l'utilisateur a cliqué "Continuer en
 * mode démo" — dans les deux cas, les fetchers doivent servir les données mockées
 * et ne jamais écrire dans le vrai Supabase, même si des identifiants sont présents.
 */
export function isDemoMode(): boolean {
  return !isSupabaseConfigured || sessionStorage.getItem(DEMO_BYPASS_KEY) === '1'
}
