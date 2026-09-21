import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * La seconde moitié du travail d'Erwan : les contrats qu'il demande, relance, réceptionne et
 * transmet — voir `v_pricing_contrats` et la migration du 18/09/2026.
 *
 * ELLE S'ARRÊTE OÙ SON PÉRIMÈTRE S'ARRÊTE. La vue écarte les contrats validés par un manager :
 * « c'est ensuite à un manager de valider le contrat », et un contrat validé n'attend plus rien de
 * lui. Mesuré le 18/09/2026 : 48 contrats restent dans son périmètre.
 */
export interface ContratPricing {
  contrat_id: string
  reference_fournisseur: string | null
  avancement_code: string | null
  avancement_libelle: string
  statut_signature: string | null
  date_reception_souhaitee: string | null
  jours_avant_reception: number | null
  date_creation: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  docusign_envelope_id: string | null
  fournisseur_nom: string | null
  fournisseur_compte_id: string | null
  compte_id: string | null
  compte_nom: string | null
  compte_proprietaire_id: string | null
  recommandation_id: string | null
  recommandation_nom: string | null
  recommandation_proprietaire_id: string | null
}

export function useContratsPricing() {
  return useQuery({
    queryKey: ['pricing', 'contrats'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ContratPricing[]> => {
      const { data, error } = await supabase.from('v_pricing_contrats').select('*')
      if (error) throw new Error(error.message)
      return (data ?? []) as ContratPricing[]
    },
  })
}
