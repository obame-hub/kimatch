import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  issue: { libelle: string; couleur: string | null } | null
}

async function fetchInteractions(): Promise<Interaction[]> {
  if (!isSupabaseConfigured) return mockInteractions
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select(
        'id, date_interaction, sens, objet, resume, resultat, compte_id, site_id, contact_id, type_interaction:types_interactions(libelle), auteur:profils(prenom, nom), compte:comptes(nom), site:sites(nom), contact:contacts(prenom, nom), issue:issues_interactions(libelle, couleur)',
      )
      .order('date_interaction', { ascending: false })
    if (error) throw error

    return ((data ?? []) as unknown as RawInteraction[]).map((i) => ({
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
      issue_libelle: i.issue?.libelle,
      issue_couleur: i.issue?.couleur,
    }))
  } catch (error) {
    console.error('fetchInteractions', error)
    return []
  }
}

export function useInteractions() {
  return useQuery({ queryKey: ['interactions'], queryFn: fetchInteractions })
}

interface CreateInteractionInput {
  type_interaction_id: string | null
  type_interaction_libelle: string
  date_interaction: string
  sens: string | null
  objet: string | null
  resume: string | null
  resultat: string | null
  compte_id: string | null
  compte_nom: string
  site_id: string | null
  site_nom: string
  contact_id: string | null
  contact_nom: string
  issue_interaction_id: string | null
  issue_libelle?: string
}

interface CreateInteractionResult {
  interaction: Interaction
  persisted: boolean
}

export function useCreateInteraction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateInteractionInput): Promise<CreateInteractionResult> => {
      let persisted = false
      let interaction: Interaction = {
        id: `local-${Date.now()}`,
        type_interaction: input.type_interaction_libelle,
        date_interaction: input.date_interaction,
        sens: input.sens,
        objet: input.objet,
        resume: input.resume,
        resultat: input.resultat,
        auteur: '',
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        site_id: input.site_id,
        site_nom: input.site_nom,
        contact_id: input.contact_id,
        contact_nom: input.contact_nom,
        issue_libelle: input.issue_libelle,
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('interactions')
          .insert({
            date_interaction: input.date_interaction,
            sens: input.sens,
            objet: input.objet,
            resume: input.resume,
            resultat: input.resultat,
            compte_id: input.compte_id,
            site_id: input.site_id,
            contact_id: input.contact_id,
            ...(input.type_interaction_id ? { type_interaction_id: input.type_interaction_id } : {}),
            ...(input.issue_interaction_id ? { issue_interaction_id: input.issue_interaction_id } : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          interaction = { ...interaction, id: (data as { id: string }).id }
          persisted = true
        }
      }

      queryClient.setQueryData<Interaction[]>(['interactions'], (old) => (old ? [interaction, ...old] : [interaction]))
      return { interaction, persisted }
    },
  })
}
