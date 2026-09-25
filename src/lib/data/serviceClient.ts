import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { estJourOuvreFR } from '@/lib/joursFeries'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE REGARDE LE SERVICE CLIENT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « pour les rôles service client, comme celui de l'utilisateur Fabien
 * DUBARRY, il faut proposer une vue d'ensemble différente ».
 *
 * Son travail n'est pas celui d'un commercial : il ne suit pas un pipe, il tient des dossiers et
 * des requêtes. La vue d'ensemble change donc de contenu, pas seulement d'ordre.
 *
 * TOUT EST CALCULÉ EN BASE. Le tableau des tâches de suivi porte 284 lignes ouvertes ; les compter
 * au navigateur imposerait de les rapatrier toutes, avec leurs requêtes, leurs suivis, leurs
 * contrats et leurs contacts, pour n'en afficher que les premières.
 */

export interface ChiffresServiceClient {
  requetes_du_jour: number
  taches_requetes_en_retard: number
  /**
   * Le délai moyen, en jours, des requêtes résolues DEPUIS LE 25/09/2026.
   *
   * `null` tant qu'aucune ne l'a été — et l'écran doit alors afficher « — », jamais « 0 » : un
   * délai moyen nul se lirait comme une performance parfaite là où il n'y a rien à mesurer.
   */
  jours_moyens_resolution: number | null
  /** Combien de requêtes sont derrière cette moyenne. Deux ou soixante ne se lisent pas pareil. */
  resolutions_comptees: number
  contrats_valides_du_jour: number
  taches_suivis_en_retard: number
  contrats_en_attente_activation: number
}

export function useChiffresServiceClient() {
  return useQuery({
    queryKey: ['service-client', 'chiffres'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ChiffresServiceClient> => {
      const { data, error } = await supabase.rpc('chiffres_service_client')
      if (error) { console.error('chiffres_service_client', error); throw new Error(error.message) }
      return data as ChiffresServiceClient
    },
  })
}

export interface TacheRequete {
  id: string
  titre: string
  echeance: string | null
  en_retard: boolean
  requete_id: string
  requete_reference: string | null
  requete_objet: string | null
  compte_id: string | null
  compte_nom: string | null
  contact_id: string | null
  contact_nom: string | null
}

export interface TacheSuivi {
  id: string
  titre: string
  echeance: string | null
  en_retard: boolean
  suivi_id: string
  contrat_id: string | null
  contrat_reference: string | null
  compte_nom: string | null
  contact_id: string | null
  contact_nom: string | null
  etape_libelle: string | null
  etape_ordre: number | null
}

/**
 * Les tâches de requêtes qui me reviennent.
 *
 * `jour` — `AAAA-MM-JJ` — restreint à une journée, quand on a cliqué dans la charge. Le filtre est
 * fait EN BASE : rapatrier 284 lignes pour n'en garder que celles d'un mardi serait payer le
 * transport de tout pour en afficher trois, et le refaire à chaque clic.
 */
export function useTachesDesRequetes(jour?: string | null) {
  return useQuery({
    queryKey: ['service-client', 'taches-requetes', jour ?? 'tout'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TacheRequete[]> => {
      const { data, error } = await supabase.rpc('taches_ouvertes_des_requetes', { p_jour: jour ?? null })
      if (error) { console.error('taches_ouvertes_des_requetes', error); throw new Error(error.message) }
      return (data ?? []) as TacheRequete[]
    },
  })
}

/** Les tâches de suivis qui me reviennent. Voir `useTachesDesRequetes` pour le paramètre `jour`. */
export function useTachesDesSuivis(jour?: string | null) {
  return useQuery({
    queryKey: ['service-client', 'taches-suivis', jour ?? 'tout'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TacheSuivi[]> => {
      const { data, error } = await supabase.rpc('taches_ouvertes_des_suivis', { p_jour: jour ?? null })
      if (error) { console.error('taches_ouvertes_des_suivis', error); throw new Error(error.message) }
      return (data ?? []) as TacheSuivi[]
    },
  })
}

/**
 * La charge à venir sur une fenêtre large — jusqu'à M+6.
 *
 * ELLE NE GARDE QUE LES JOURS OUVRÉS, fériés compris, comme celle des commerciaux : une case vide
 * un samedi n'apprend rien et mange la largeur de six mois.
 */
export function useChargeLargeur(jours: number) {
  return useQuery({
    queryKey: ['service-client', 'charge', jours],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ jour: string; taches: number }[]> => {
      const { data, error } = await supabase.rpc('compter_charge_a_venir_sur', { p_jours: jours })
      if (error) { console.error('compter_charge_a_venir_sur', error); throw new Error(error.message) }
      return ((data ?? []) as { jour: string; taches: number }[])
        .filter((j) => estJourOuvreFR(new Date(`${j.jour}T12:00:00`)))
        .map((j) => ({ jour: j.jour, taches: Number(j.taches ?? 0) }))
    },
  })
}
