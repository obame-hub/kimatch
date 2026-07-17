import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockInteractions } from '@/lib/mockData'
import type { Interaction } from '@/types/domain'

interface RawInteraction {
  id: string
  date_interaction: string
  sens: string | null
  objet: string | null
  resume: string | null
  resultat: string | null
  compte_id: string | null
  site_id: string | null
  contact_id: string | null
  type_interaction: { libelle: string } | null
  auteur: { prenom: string; nom: string } | null
  compte: { nom: string } | null
  site: { nom: string } | null
  contact: { prenom: string; nom: string } | null
}

async function fetchInteractions(): Promise<Interaction[]> {
  if (!isSupabaseConfigured) return mockInteractions
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select(
        'id, date_interaction, sens, objet, resume, resultat, compte_id, site_id, contact_id, type_interaction:types_interactions(libelle), auteur:profils(prenom, nom), compte:comptes(nom), site:sites(nom), contact:contacts(prenom, nom)',
      )
      .order('date_interaction', { ascending: false })
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    return (data as unknown as RawInteraction[]).map((i) => ({
      id: i.id,
      type_interaction: i.type_interaction?.libelle ?? '',
      date_interaction: i.date_interaction,
      sens: i.sens,
      objet: i.objet,
      resume: i.resume,
      resultat: i.resultat,
      auteur: i.auteur ? `${i.auteur.prenom} ${i.auteur.nom}` : '',
      compte_id: i.compte_id,
      compte_nom: i.compte?.nom ?? '',
      site_id: i.site_id,
      site_nom: i.site?.nom ?? '',
      contact_id: i.contact_id,
      contact_nom: i.contact ? `${i.contact.prenom} ${i.contact.nom}` : '',
    }))
  } catch {
    return mockInteractions
  }
}

export function useInteractions() {
  return useQuery({ queryKey: ['interactions'], queryFn: fetchInteractions })
}
