import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LES TROIS LECTURES DES ZONES DE LA FICHE COMPTE ══
 *
 * Une fonction SQL par zone, et une seule requête chacune. La fiche partait déjà avec 59 requêtes
 * au 12/09/2026 : il n'était pas question d'en ajouter quinze pour trois blocs. Le calcul, les
 * jointures et les exclusions sont en base — voir la migration `20260912100000`, qui explique aussi
 * ce que les données permettent réellement de dire.
 */

/** Réponse vide plutôt qu'écran blanc entre le push et l'application de la migration. */
function absente(message: string): boolean {
  return /does not exist|schema cache|404/i.test(message)
}

// ══ LES DOSSIERS OUVERTS ══════════════════════════════════════════════════════════════════════

export interface DossierEnCours {
  recommandation_id: string
  nom: string
  colonne_travail: string
  /** `marge_nette_coeff`. Rare avant la clôture — voir la migration. */
  montant: number | null
  /** La date à laquelle le pricing doit rendre. Ce n'est PAS une date de clôture. */
  date_souhaitee: string | null
  jours_restants: number | null
  action_titre: string | null
  action_echeance: string | null
  action_en_retard: boolean | null
}

export function useDossiersEnCours(compteId: string | undefined) {
  return useQuery({
    queryKey: ['dossiers-en-cours', compteId],
    enabled: Boolean(compteId),
    retry: false,
    queryFn: async (): Promise<DossierEnCours[]> => {
      const { data, error } = await supabase.rpc('lister_dossiers_en_cours', { p_compte_id: compteId })
      if (error) {
        if (absente(error.message)) return []
        throw new Error(error.message)
      }
      return (data ?? []) as DossierEnCours[]
    },
  })
}

// ══ CE QUI EST PARTI À LA SIGNATURE ═══════════════════════════════════════════════════════════

export interface SignaturesEnCours {
  mandats_n: number
  mandats_depuis: string | null
  contrats_n: number
  contrats_depuis: string | null
}

export function useSignaturesEnCours(compteId: string | undefined) {
  return useQuery({
    queryKey: ['signatures-en-cours', compteId],
    enabled: Boolean(compteId),
    retry: false,
    queryFn: async (): Promise<SignaturesEnCours | null> => {
      const { data, error } = await supabase.rpc('compter_signatures_en_cours', { p_compte_id: compteId })
      if (error) {
        if (absente(error.message)) return null
        throw new Error(error.message)
      }
      const l = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      if (!l) return null
      return {
        mandats_n: Number(l.mandats_n ?? 0),
        mandats_depuis: (l.mandats_depuis as string | null) ?? null,
        contrats_n: Number(l.contrats_n ?? 0),
        contrats_depuis: (l.contrats_depuis as string | null) ?? null,
      }
    },
  })
}

// ══ QUAND LES CONTRATS TOMBENT ════════════════════════════════════════════════════════════════

export interface MoisDEcheance {
  /** Le premier jour du mois, au format `AAAA-MM-JJ`. */
  mois: string
  compteurs: number
  mwh: number
  /** Combien, parmi eux, n'ont ni opportunité ouverte ni recommandation en cours. */
  sans_suite: number
}

export function useChargeEcheances(compteId: string | undefined) {
  return useQuery({
    queryKey: ['charge-echeances', compteId],
    enabled: Boolean(compteId),
    retry: false,
    queryFn: async (): Promise<MoisDEcheance[]> => {
      const { data, error } = await supabase.rpc('lister_charge_echeances', { p_compte_id: compteId })
      if (error) {
        if (absente(error.message)) return []
        throw new Error(error.message)
      }
      return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        mois: String(l.mois),
        compteurs: Number(l.compteurs ?? 0),
        mwh: Number(l.mwh ?? 0),
        sans_suite: Number(l.sans_suite ?? 0),
      }))
    },
  })
}
