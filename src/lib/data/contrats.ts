import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockContrats } from '@/lib/mockData'
import type { Contrat } from '@/types/domain'

interface RawContrat {
  id: string
  site_id: string
  fournisseur_compte_id: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  site: { nom: string } | null
  fournisseur: { nom: string } | null
  type_energie: { code: string } | null
  statut: { code: string } | null
}

async function fetchContrats(): Promise<Contrat[]> {
  if (!isSupabaseConfigured) return mockContrats
  try {
    const { data, error } = await supabase
      .from('contrats')
      .select(
        'id, site_id, fournisseur_compte_id, reference_fournisseur, date_debut, date_fin, site:sites(nom), fournisseur:comptes(nom), type_energie:types_energies(code), statut:statuts_contrats(code)',
      )
      .order('date_debut', { ascending: false })
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    return (data as unknown as RawContrat[]).map((c) => ({
      id: c.id,
      site_id: c.site_id,
      site_nom: c.site?.nom ?? '',
      fournisseur_compte_id: c.fournisseur_compte_id,
      fournisseur_nom: c.fournisseur?.nom ?? '',
      type_energie: (c.type_energie?.code?.toLowerCase() ?? 'electricite') as 'electricite' | 'gaz',
      reference_fournisseur: c.reference_fournisseur,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
      statut: c.statut?.code ?? '',
    }))
  } catch {
    return mockContrats
  }
}

export function useContrats() {
  return useQuery({ queryKey: ['contrats'], queryFn: fetchContrats })
}
