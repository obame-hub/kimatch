import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TarifContratCompteur } from '@/types/domain'

export interface FormuleTarifaire {
  id: string
  code: string
  libelle: string
  type_energie_id: string | null
  ordre: number
}

async function fetchFormulesTarifaires(): Promise<FormuleTarifaire[]> {
  try {
    const { data, error } = await supabase
      .from('types_formules_tarifaires')
      .select('id, code, libelle, type_energie_id, ordre')
      .eq('actif', true)
      .order('ordre')
    if (error) throw error
    return (data ?? []) as unknown as FormuleTarifaire[]
  } catch (error) {
    console.error('fetchFormulesTarifaires', error)
    return []
  }
}

export function useFormulesTarifaires() {
  return useQuery({ queryKey: ['formules_tarifaires'], queryFn: fetchFormulesTarifaires })
}

interface RawTarif {
  id: string
  contrat_compteur_id: string
  type_formule_tarifaire_id: string | null
  indexation: string | null
  prix_base_eur_mwh: number | null
  prix_hp_eur_mwh: number | null
  prix_hc_eur_mwh: number | null
  prix_pointe_eur_mwh: number | null
  prix_hph_eur_mwh: number | null
  prix_hch_eur_mwh: number | null
  prix_hpe_eur_mwh: number | null
  prix_hce_eur_mwh: number | null
  prix_gaz_eur_mwh: number | null
  abonnement_mensuel_ht: number | null
  abonnement_annuel_ht: number | null
  date_debut_validite: string | null
  date_fin_validite: string | null
  actif: boolean
  formule: { code: string; libelle: string } | null
}

const TARIF_SELECT =
  'id, contrat_compteur_id, type_formule_tarifaire_id, indexation, prix_base_eur_mwh, prix_hp_eur_mwh, prix_hc_eur_mwh, prix_pointe_eur_mwh, prix_hph_eur_mwh, prix_hch_eur_mwh, prix_hpe_eur_mwh, prix_hce_eur_mwh, prix_gaz_eur_mwh, abonnement_mensuel_ht, abonnement_annuel_ht, date_debut_validite, date_fin_validite, actif, formule:types_formules_tarifaires(code, libelle)'

function mapTarif(t: RawTarif): TarifContratCompteur {
  return {
    id: t.id,
    contrat_compteur_id: t.contrat_compteur_id,
    type_formule_tarifaire_id: t.type_formule_tarifaire_id,
    formule_code: t.formule?.code ?? null,
    formule_libelle: t.formule?.libelle ?? null,
    indexation: t.indexation,
    prix_base_eur_mwh: t.prix_base_eur_mwh,
    prix_hp_eur_mwh: t.prix_hp_eur_mwh,
    prix_hc_eur_mwh: t.prix_hc_eur_mwh,
    prix_pointe_eur_mwh: t.prix_pointe_eur_mwh,
    prix_hph_eur_mwh: t.prix_hph_eur_mwh,
    prix_hch_eur_mwh: t.prix_hch_eur_mwh,
    prix_hpe_eur_mwh: t.prix_hpe_eur_mwh,
    prix_hce_eur_mwh: t.prix_hce_eur_mwh,
    prix_gaz_eur_mwh: t.prix_gaz_eur_mwh,
    abonnement_mensuel_ht: t.abonnement_mensuel_ht,
    abonnement_annuel_ht: t.abonnement_annuel_ht,
    date_debut_validite: t.date_debut_validite,
    date_fin_validite: t.date_fin_validite,
    actif: t.actif,
  }
}

async function fetchTarifsByContratCompteurIds(contratCompteurIds: string[]): Promise<TarifContratCompteur[]> {
  if (contratCompteurIds.length === 0) return []
  try {
    const { data, error } = await supabase
      .from('contrats_compteurs_tarifs')
      .select(TARIF_SELECT)
      .in('contrat_compteur_id', contratCompteurIds)
      .order('date_debut_validite', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as RawTarif[]).map(mapTarif)
  } catch (error) {
    console.error('fetchTarifsByContratCompteurIds', error)
    return []
  }
}

export function useTarifsByContratCompteurs(contratCompteurIds: string[]) {
  return useQuery({
    queryKey: ['tarifs', ...contratCompteurIds.slice().sort()],
    queryFn: () => fetchTarifsByContratCompteurIds(contratCompteurIds),
    enabled: contratCompteurIds.length > 0,
  })
}

export interface CreateTarifInput {
  contrat_compteur_id: string
  type_formule_tarifaire_id: string | null
  indexation: string | null
  prix_base_eur_mwh: number | null
  prix_hp_eur_mwh: number | null
  prix_hc_eur_mwh: number | null
  prix_pointe_eur_mwh: number | null
  prix_hph_eur_mwh: number | null
  prix_hch_eur_mwh: number | null
  prix_hpe_eur_mwh: number | null
  prix_hce_eur_mwh: number | null
  prix_gaz_eur_mwh: number | null
  abonnement_mensuel_ht: number | null
  abonnement_annuel_ht: number | null
  date_debut_validite: string | null
  date_fin_validite: string | null
}

export function useCreateTarif() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateTarifInput) => {
      const { error } = await supabase.from('contrats_compteurs_tarifs').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tarifs'] }),
  })
}

export function useDeleteTarif() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contrats_compteurs_tarifs').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tarifs'] }),
  })
}
