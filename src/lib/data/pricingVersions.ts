import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PRICING, RANGÉ PAR VERSION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « j'aimerais complètement repenser la page Pricing avec la nouvelle
 * articulation que l'on a mise au point pour les versions sur la page recommandation. »
 *
 * ══ TOUT EST CHARGÉ D'UN COUP, ET C'EST DÉLIBÉRÉ ══
 *
 * L'ancienne page passait par `useKanbanServeur` : dix cartes par colonne, pagination, tri et somme
 * en base. Cette mécanique existe parce qu'un kanban de consultations pouvait compter des milliers
 * de lignes.
 *
 * Ici, mesuré le 18/09/2026 : 102 versions, 174 consultations embarquées. La page entière tient en
 * une requête et quelques dizaines de kilo-octets. Paginer coûterait plus cher que ça ne rapporte —
 * et surtout, le zonage par échéance demande de voir TOUTE la colonne : une zone « en retard » qui
 * n'annoncerait que les dix premiers retards mentirait sur ce qui reste à rattraper.
 */

/**
 * Ce qu'on a demandé à un fournisseur : une ligne par durée × type de prix.
 *
 * William, 18/09/2026 : « il faudrait ajouter sur la ligne des fournisseurs les mois demandés ainsi
 * que le type de prix ». C'est ce qui distingue deux réponses d'un même fournisseur — « Demande
 * acceptée » ne dit pas si l'accord porte sur une durée ou sur trois.
 *
 * `statut` est celui de l'OFFRE et non de la consultation : EN_ATTENTE, DISPONIBLE ou INDISPONIBLE.
 * Une combinaison indisponible se barre à l'écran plutôt que de disparaître — l'effacer ferait
 * croire qu'on ne l'avait jamais demandée.
 */
export interface CombinaisonDemandee {
  id: string
  duree_mois: number | null
  type_prix: string | null
  statut: string | null
}

export interface FournisseurConsulteLite {
  id: string
  /** Le COMPTE du fournisseur : c'est par lui qu'on retrouve ses contacts pour écrire la demande. */
  fournisseur_compte_id: string | null
  fournisseur_nom: string
  statut_code: string
  statut_libelle: string
  date_evenement: string | null
  mode_consultation: 'EMAIL' | 'OUTIL_EN_LIGNE'
  /**
   * Comment ce fournisseur répond : MAIL et TRADEO reçoivent une demande dès la création de la
   * version, PLATEFORME et GRILLE se relèvent le jour de la livraison souhaitée. NULL quand le
   * fournisseur n'a jamais été qualifié — l'écran le dit plutôt que d'inventer un circuit.
   */
  mode_reponse: 'MAIL' | 'TRADEO' | 'PLATEFORME' | 'GRILLE' | null
  combinaisons: CombinaisonDemandee[]
}

export interface VersionPricing {
  version_id: string
  numero_version: number | null
  version_nom: string | null
  version_statut: 'EN_CONSTRUCTION' | 'DISPONIBLE'
  version_statut_libelle: string
  date_souhaitee: string | null
  /** `date_souhaitee - current_date`, calculé en base — voir la migration. */
  jours_avant_livraison: number | null
  date_presentation_client: string | null
  /** Le jour où la version a été créée : c'est de là que part le délai d'envoi des demandes. */
  version_date_creation: string | null
  recommandation_id: string
  recommandation_nom: string
  montant: number | null
  compte_id: string | null
  compte_nom: string | null
  compte_proprietaire_id: string | null
  recommandation_proprietaire_id: string | null
  type_energie: 'electricite' | 'gaz' | null
  nb_fournisseurs: number
  nb_recues: number
  nb_refusees: number
  nb_attendus: number
  fournisseurs: FournisseurConsulteLite[]
}

export function useVersionsPricing() {
  return useQuery({
    queryKey: ['pricing', 'versions'],
    // La page est consultée en continu par le pricing : une minute évite de la redemander à chaque
    // retour d'onglet sans jamais afficher un statut vieux d'une réunion.
    staleTime: 60 * 1000,
    queryFn: async (): Promise<VersionPricing[]> => {
      const { data, error } = await supabase
        .from('v_pricing_versions')
        .select('*')
        /* SEULES LES VERSIONS COURANTES DE DOSSIERS OUVERTS. Naoëlle, 27/08/2026 : « filtre juste les
           recos en cours, le pricing n'a besoin de voir que ça », puis « il faut aussi qu'on filtre
           sur les versions actives, sinon c'est pas logique ». Une recommandation reprise trois fois
           affichait sinon les consultations de ses trois versions — on demandait au pricing de
           relancer un fournisseur sur une offre qui n'existe plus. */
        .eq('reco_en_cours', true)
        .eq('version_courante', true)
      if (error) throw new Error(error.message)
      return (data ?? []) as VersionPricing[]
    },
  })
}
