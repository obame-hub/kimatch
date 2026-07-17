import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

interface GrdData {
  segment?: string | null
  tension?: string | null
  fta?: string | null
  puissance_souscrite_kva?: number | null
  consommation_annuelle_mwh?: number | null
}

interface CreateCompteurInput {
  site_id: string
  site_nom: string
  type_energie_id: string | null
  type_energie: 'electricite' | 'gaz'
  numero_pdl: string
  utilisation: string
  grd?: GrdData
}

interface CreateCompteurResult {
  compteur: Compteur
  persisted: boolean
}

export function useCreateCompteur() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCompteurInput): Promise<CreateCompteurResult> => {
      let persisted = false
      const derniereSynchro = input.grd ? new Date().toISOString() : null
      let compteur: Compteur = {
        id: `local-${Date.now()}`,
        site_id: input.site_id,
        site_nom: input.site_nom,
        type_energie: input.type_energie,
        numero_pdl: input.numero_pdl,
        utilisation: input.utilisation,
        statut: 'actif',
        segment: input.grd?.segment ?? null,
        tension: input.grd?.tension ?? null,
        fta: input.grd?.fta ?? null,
        puissance_souscrite_kva: input.grd?.puissance_souscrite_kva ?? null,
        consommation_annuelle_mwh: input.grd?.consommation_annuelle_mwh ?? null,
        derniere_synchro_grd: derniereSynchro,
      }

      if (isSupabaseConfigured) {
        // Les colonnes GRD (segment, tension, fta, puissance_souscrite_kva,
        // consommation_annuelle_mwh, derniere_synchro_grd) doivent exister sur
        // `compteurs` — si elles ne sont pas encore ajoutées, l'insert échoue
        // et on retombe sur le cache local (mêmes garanties que les autres formulaires).
        const { data, error } = await supabase
          .from('compteurs')
          .insert({
            site_id: input.site_id,
            numero_point: input.numero_pdl,
            utilisation: input.utilisation,
            actif: true,
            ...(input.type_energie_id ? { type_energie_id: input.type_energie_id } : {}),
            ...(input.grd
              ? {
                  segment: input.grd.segment ?? null,
                  tension: input.grd.tension ?? null,
                  fta: input.grd.fta ?? null,
                  puissance_souscrite_kva: input.grd.puissance_souscrite_kva ?? null,
                  consommation_annuelle_mwh: input.grd.consommation_annuelle_mwh ?? null,
                  derniere_synchro_grd: derniereSynchro,
                }
              : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          compteur = { ...compteur, id: (data as { id: string }).id }
          persisted = true
        }
      }

      queryClient.setQueryData<Compteur[]>(['compteurs'], (old) => (old ? [...old, compteur] : [compteur]))
      return { compteur, persisted }
    },
  })
}
