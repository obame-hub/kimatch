import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'

export interface ReferenceRow {
  id: string
  code: string
  libelle: string
  ordre: number
  couleur: string | null
  icone: string | null
}

async function fetchReferenceTable(table: string): Promise<ReferenceRow[]> {
  if (isDemoMode()) return []
  try {
    const { data, error } = await supabase.from(table).select('id, code, libelle, ordre, couleur, icone').order('ordre')
    if (error || !data) throw error ?? new Error('empty')
    return data as unknown as ReferenceRow[]
  } catch {
    return []
  }
}

/** Pilote statuts/étapes/types depuis Supabase (ordre, couleur, libellé réels) plutôt que de les coder en dur côté front. */
export function useReferenceTable(table: string) {
  return useQuery({ queryKey: ['reference', table], queryFn: () => fetchReferenceTable(table) })
}
