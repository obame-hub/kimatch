import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockSignaux } from '@/lib/mockData'
import type { Signal } from '@/types/domain'

interface RawSignal {
  id: string
  site_id: string
  date_detection: string
  commentaire: string | null
  type_signal: { libelle: string } | null
  statut: { code: string } | null
  site: { nom: string } | null
  responsable: { prenom: string; nom: string } | null
}

async function fetchSignaux(): Promise<Signal[]> {
  if (!isSupabaseConfigured) return mockSignaux

  try {
    const { data, error } = await supabase
      .from('signaux')
      .select(
        'id, site_id, date_detection, commentaire, type_signal:types_signaux(libelle), statut:statuts_signaux(code), site:sites(nom), responsable:profils(prenom, nom)',
      )
      .order('date_detection', { ascending: false })
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    return (data as unknown as RawSignal[]).map((s) => ({
      id: s.id,
      site_id: s.site_id,
      site_nom: s.site?.nom ?? '',
      type_signal: s.type_signal?.libelle ?? '',
      statut: s.statut?.code ?? '',
      priorite: 'normale' as const,
      conseiller: s.responsable ? `${s.responsable.prenom} ${s.responsable.nom}` : '',
      date_creation: s.date_detection,
      description: s.commentaire ?? '',
    }))
  } catch {
    return mockSignaux
  }
}

export function useSignaux() {
  return useQuery({ queryKey: ['signaux'], queryFn: fetchSignaux })
}
