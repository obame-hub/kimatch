import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockActions } from '@/lib/mockData'
import type { ActionItem } from '@/types/domain'

interface RawAction {
  id: string
  titre: string
  date_prevue: string | null
  type_action: { libelle: string } | null
  statut: { code: string } | null
  responsable: { prenom: string; nom: string } | null
  site: { nom: string } | null
}

async function fetchActions(): Promise<ActionItem[]> {
  if (!isSupabaseConfigured) return mockActions
  try {
    const { data, error } = await supabase
      .from('actions')
      .select(
        'id, titre, date_prevue, type_action:types_actions(libelle), statut:statuts_actions(code), responsable:profils(prenom, nom), site:sites(nom)',
      )
      .order('date_prevue')
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    return (data as unknown as RawAction[]).map((a) => ({
      id: a.id,
      type_action: a.type_action?.libelle ?? a.titre,
      statut: a.statut?.code ?? '',
      responsable: a.responsable ? `${a.responsable.prenom} ${a.responsable.nom}` : '',
      echeance: a.date_prevue ?? '',
      cible_label: a.site?.nom ?? '',
    }))
  } catch {
    return mockActions
  }
}

export function useActions() {
  return useQuery({ queryKey: ['actions'], queryFn: fetchActions })
}
