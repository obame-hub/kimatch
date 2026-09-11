import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LES ÉCHÉANCES À TRAITER D'UN COMPTE ══
 *
 * William, 11/09/2026 : « ressortir les urgences à traiter vis-à-vis des échéances — pour les
 * compteurs à échéance proche de moins d'un an et sans aucune opportunité ouverte ».
 *
 * Le calcul est en base et nulle part ailleurs : voir la migration `20260911150000`, qui explique
 * pourquoi une recommandation non clôturée compte, elle aussi, comme « déjà traitée ».
 *
 * ── POURQUOI CE BLOC PASSE DEVANT LES AUTRES ──
 *
 * Sur les 2 782 comptes actifs, 541 ont au moins une échéance sans rien en cours — contre 8 pour
 * les mandats en signature et 21 pour les contrats. C'est aussi le seul indicateur de la fiche qui
 * chiffre ce qu'on est en train de PERDRE plutôt que l'avancement de ce qu'on a commencé.
 */

export interface EcheanceATraiter {
  compteur_id: string
  numero_point: string
  site_nom: string | null
  type_energie: string | null
  /** En mégawattheures par an. `null` quand la consommation n'est pas connue. */
  consommation: number | null
  date_echeance: string
  nature_echeance: string | null
  jours_restants: number
}

export function useEcheancesATraiter(compteId: string | undefined) {
  return useQuery({
    queryKey: ['echeances-a-traiter', compteId],
    enabled: Boolean(compteId),
    /* La fonction n'existe pas entre le push et l'application de la migration : on rend une liste
       vide plutôt que de faire blanchir la fiche. Même garde que sur le tableau de bord. */
    retry: false,
    queryFn: async (): Promise<EcheanceATraiter[]> => {
      const { data, error } = await supabase.rpc('lister_echeances_a_traiter', { p_compte_id: compteId })
      if (error) {
        if (/does not exist|schema cache|404/i.test(error.message)) return []
        throw new Error(error.message)
      }
      return (data ?? []) as EcheanceATraiter[]
    },
  })
}
