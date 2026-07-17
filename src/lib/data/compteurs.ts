import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockCompteurs } from '@/lib/mockData'
import type { Compteur } from '@/types/domain'

interface RawCompteur {
  id: string
  site_id: string
  numero_point: string
  utilisation: string | null
  actif: boolean
  type_energie: { code: string } | null
  site: { nom: string } | null
}

async function fetchCompteurs(): Promise<Compteur[]> {
  if (!isSupabaseConfigured) return mockCompteurs
  try {
    const { data, error } = await supabase
      .from('compteurs')
      .select('id, site_id, numero_point, utilisation, actif, type_energie:types_energies(code), site:sites(nom)')
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    return (data as unknown as RawCompteur[]).map((c) => ({
      id: c.id,
      site_id: c.site_id,
      site_nom: c.site?.nom ?? '',
      type_energie: (c.type_energie?.code?.toLowerCase() ?? 'electricite') as 'electricite' | 'gaz',
      numero_pdl: c.numero_point,
      utilisation: c.utilisation ?? '',
      statut: c.actif ? 'actif' : 'inactif',
    }))
  } catch {
    return mockCompteurs
  }
}

export function useCompteurs() {
  return useQuery({ queryKey: ['compteurs'], queryFn: fetchCompteurs })
}
