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

// `select('*')` plutôt qu'une liste de colonnes fixe : plusieurs tables de référence
// (types_comptes, types_sites, etapes_recommandation, types_energies, etc.) n'ont pas
// de colonnes couleur/icone. Un select nommé sur ces colonnes fait échouer la requête
// (400) pour TOUTES les tables qui ne les ont pas, ce qui vide silencieusement les
// listes déroulantes correspondantes et peut faire échouer une création qui dépend
// d'un id NOT NULL résolu depuis cette liste (ex. comptes.type_compte_id).
async function fetchReferenceTable(table: string): Promise<ReferenceRow[]> {
  if (isDemoMode()) return []
  try {
    const { data, error } = await supabase.from(table).select('*').order('ordre')
    if (error || !data) throw error ?? new Error('empty')
    return (data as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      code: r.code as string,
      libelle: r.libelle as string,
      ordre: (r.ordre as number) ?? 0,
      couleur: (r.couleur as string | null) ?? null,
      icone: (r.icone as string | null) ?? null,
    }))
  } catch {
    return []
  }
}

/** Pilote statuts/étapes/types depuis Supabase (ordre, couleur, libellé réels) plutôt que de les coder en dur côté front. */
export function useReferenceTable(table: string) {
  return useQuery({ queryKey: ['reference', table], queryFn: () => fetchReferenceTable(table) })
}
