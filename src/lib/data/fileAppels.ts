import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LA FILE DES APPELS NON RATTACHÉS ══
 *
 * Naoëlle, 07/09/2026 : « importe tout, avec la file des non rattachés. » Puis : « fais la table et
 * l'écran des appels non rattachés. »
 *
 * ══ POURQUOI UNE FILE, ET NON DES INTERACTIONS INVISIBLES ══
 *
 * C'est la base qui a tranché en refusant l'import : `interactions_contexte_check` exige qu'une
 * interaction soit liée à au moins un objet. Les 3 895 appels dont le numéro n'est encore sur aucune
 * fiche vivent donc dans `appels_non_rattaches` (migration 20260907220000) — une salle d'attente, pas
 * un second historique.
 *
 * ══ GROUPÉE PAR NUMÉRO, ET TRIÉE PAR NOMBRE D'APPELS ══
 *
 * 3 895 appels sur 1 439 numéros : rattacher un numéro rattache tous ses appels d'un coup, passés et
 * futurs. Le plus appelé l'a été 86 fois.
 *
 * Et le tri par nombre d'appels n'est pas un détail : 986 numéros n'ont été appelés qu'une seule fois
 * — 44 % des numéros pour 15 % des appels. Une file triée par date ferait tomber d'abord sur
 * ceux-là, et on abandonnerait avant d'atteindre celui qui en porte 86.
 */

export interface LigneFileAppels {
  numero: string
  nb_appels: number
  premier_appel: string
  dernier_appel: string
  nb_resumes: number
  nb_enregistrements: number
  duree_totale_secondes: number
  nb_decroches: number
  /** Qui a appelé ce numéro — souvent la personne qui saura de qui il s'agit. */
  commerciaux: string | null
  /** Ce que l'IA d'Allo a entendu le plus souvent. Un indice, jamais un fait. */
  societe_proposee: string | null
  societe_proposee_occurrences: number | null
  personne_proposee: string | null
  fonction_proposee: string | null
  dernier_resume: string | null
  /** Non nul quand la société devinée correspond EXACTEMENT à un compte existant. */
  compte_propose_id: string | null
  compte_propose_nom: string | null
}

const ABSENTE = /does not exist|schema cache|404/i

export interface FileAppels {
  lignes: LigneFileAppels[]
  /** Faux quand la migration n'est pas appliquée : l'écran le dit au lieu d'afficher « vide ». */
  pretMigration: boolean
}

export function useFileAppels() {
  return useQuery({
    queryKey: ['file-appels'],
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<FileAppels> => {
      const { data, error } = await supabase
        .from('v_file_appels')
        .select('*')
        .order('nb_appels', { ascending: false })
        .limit(500)
      if (error) {
        if (ABSENTE.test(error.message)) return { lignes: [], pretMigration: false }
        throw new Error(error.message)
      }
      return { lignes: (data ?? []) as LigneFileAppels[], pretMigration: true }
    },
  })
}

/** Les appels d'un numéro, pour les lire avant de décider à qui les rattacher. */
export function useAppelsDuNumero(numero: string | null) {
  return useQuery({
    queryKey: ['file-appels', numero],
    enabled: Boolean(numero),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appels_non_rattaches')
        .select('id, date_appel, sens, duree_secondes, resultat, decroche_par, resume_ia, transcription, enregistrement_url')
        .eq('numero', numero)
        .order('date_appel', { ascending: false })
      if (error) {
        if (ABSENTE.test(error.message)) return []
        throw new Error(error.message)
      }
      return data ?? []
    },
  })
}

export interface Rattachement {
  numero: string
  contactId?: string
  compteId?: string
  pisteId?: string
}

/**
 * Rattache tous les appels d'un numéro, et ajoute ce numéro à la fiche.
 *
 * LE SECOND EFFET COMPTE AUTANT QUE LE PREMIER : sans le numéro sur la fiche, les appels SUIVANTS de
 * ce même correspondant retomberaient dans la file, et on rattacherait le même prospect chaque
 * semaine. C'est ce qui transforme le geste en correction durable.
 */
export function useRattacherAppels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (r: Rattachement) => {
      const { data, error } = await supabase.rpc('fn_rattacher_appels', {
        p_numero: r.numero,
        p_contact_id: r.contactId ?? null,
        p_compte_id: r.compteId ?? null,
        p_piste_id: r.pisteId ?? null,
      })
      if (error) throw new Error(error.message)
      const ligne = (data as { appels_rattaches: number; numero_ajoute_a_la_fiche: boolean }[])?.[0]
      return ligne ?? { appels_rattaches: 0, numero_ajoute_a_la_fiche: false }
    },
    // Les appels apparaissent sur des fiches : on invalide large, une opération rare et jamais dans
    // un chemin sensible à la vitesse.
    onSuccess: () => { void queryClient.invalidateQueries() },
  })
}

/**
 * Retire un numéro de la file sans rien créer.
 *
 * Tous les numéros ne méritent pas une fiche : un appelant masqué — « + », 59 appels — un faux
 * numéro, un démarcheur. Sans moyen de les écarter, la file garderait un fond permanent qu'on
 * réexaminerait chaque semaine, et une file qu'on n'arrive jamais à vider, on cesse de l'ouvrir.
 */
export function useEcarterAppels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (numero: string) => {
      const { data, error } = await supabase.rpc('fn_ecarter_appels', { p_numero: numero })
      if (error) throw new Error(error.message)
      return (data ?? 0) as number
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['file-appels'] }) },
  })
}
