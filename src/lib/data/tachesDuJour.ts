import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { estJourOuvreFR } from '@/lib/joursFeries'

/**
 * ══ LES TÂCHES DU JOUR, ET LA CHARGE DES TROIS PROCHAINES SEMAINES ══
 *
 * William, 10/09/2026 : une seconde zone sous « Offres du jour » — un tableau de tâches à gauche,
 * une matrice de quinze jours ouvrés à droite.
 *
 * ── TROIS STATUTS, ET LE TROISIÈME TIENT À UNE CONVENTION ──
 *
 *   EN_RETARD    échéance passée
 *   DU_JOUR      échéance aujourd'hui, SANS heure choisie
 *   PROGRAMMEE   échéance aujourd'hui, AVEC une heure
 *
 * Depuis le 08/09/2026, l'heure est facultative à la saisie et une tâche sans heure est enregistrée
 * à minuit. « Minuit » ne veut donc pas dire « à minuit », il veut dire « pas d'heure » — et c'est
 * ce qui sépare une tâche à caler dans la journée d'un rendez-vous à 14 h 30.
 *
 * ── LES JOURS OUVRÉS SE CHOISISSENT ICI, PAS EN BASE ──
 *
 * La fonction SQL rend 30 jours calendaires ; on retient les 15 premiers jours ouvrés avec
 * `estJourOuvreFR`, qui connaît déjà les fériés français — Pâques calculée, pas listée.
 *
 * RÉIMPLÉMENTER MEEUS EN PL/pgSQL AURAIT CRÉÉ UNE SECONDE VÉRITÉ sur « quel jour est ouvré », et
 * c'est le genre de doublon qui diverge un lundi de Pentecôte. Trente jours calendaires couvrent
 * toujours quinze jours ouvrés, fériés compris — le pire cas théorique en France en compte 21.
 */

export type StatutTache = 'EN_RETARD' | 'DU_JOUR' | 'PROGRAMMEE'
export type PorteurTache = 'PISTE' | 'OPPORTUNITE' | 'RECOMMANDATION' | 'SUIVI_CONTRAT' | 'REQUETE' | 'AUCUN'

export interface LigneTache {
  id: string
  titre: string
  statut: StatutTache
  type_code: string | null
  type_libelle: string | null
  porteur_type: PorteurTache
  porteur_id: string | null
  porteur_nom: string | null
  contact_id: string | null
  contact_nom: string | null
  date_prevue: string
  a_une_heure: boolean
  /** Nécessaire au panneau d'édition, qui l'affiche et le modifie. */
  commentaire: string | null
}

export interface JourDeCharge {
  /** La date, au format `AAAA-MM-JJ`. */
  jour: string
  taches: number
}

function absente(message: string): boolean {
  return /does not exist|schema cache|404/i.test(message)
}

/**
 * Le nombre de jours ouvrés affichés : DEUX semaines de cinq jours.
 *
 * Trois semaines au départ. William, 11/09/2026, en trouvant la matrice trop serrée : « réduis à
 * 10 jours ouvrés ». C'est le bon arbitrage — la colonne de droite est étroite par construction,
 * et quinze cases dans cette largeur donnaient des vignettes de 65 px qu'il fallait déchiffrer.
 * À dix, chaque case double de hauteur et se lit d'un coup d'œil.
 *
 * ET DEUX SEMAINES SUFFISENT À CE QU'ON DEMANDE À CETTE MATRICE : « planifier sur les jours verts
 * et éviter les jours rouges ». On ne cale pas un appel de relance à trois semaines.
 */
export const JOURS_AFFICHES = 10

/** Au-delà, la journée est considérée comme saturée. William : « un objectif de 70 tâches maximum ». */
export const PLAFOND_JOURNALIER = 70

export function useTachesDuJour() {
  const queryClient = useQueryClient()

  const requete = useQuery({
    queryKey: ['taches-du-jour'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<LigneTache[]> => {
      const { data, error } = await supabase.rpc('lister_taches_du_jour')
      if (error) {
        if (absente(error.message)) return []
        throw new Error(error.message)
      }
      return (data ?? []) as LigneTache[]
    },
  })

  /* Une tâche cochée fait bouger le tableau ET la matrice : les deux requêtes s'invalident
     ensemble, sinon la charge de demain resterait fausse jusqu'au rechargement. */
  useEffect(() => {
    const rafraichir = () => {
      void queryClient.invalidateQueries({ queryKey: ['taches-du-jour'] })
      void queryClient.invalidateQueries({ queryKey: ['charge-a-venir'] })
    }
    const canal = supabase
      .channel('taches-du-jour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, rafraichir)
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [queryClient])

  return requete
}

export function useChargeAVenir() {
  const requete = useQuery({
    queryKey: ['charge-a-venir'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<JourDeCharge[]> => {
      const { data, error } = await supabase.rpc('compter_charge_a_venir')
      if (error) {
        if (absente(error.message)) return []
        throw new Error(error.message)
      }
      const jours = (data ?? []) as { jour: string; taches: number }[]
      return jours
        // LE FILTRE DES JOURS OUVRÉS EST ICI, avec les fériés — voir l'en-tête.
        .filter((j) => estJourOuvreFR(depuisIso(j.jour)))
        .slice(0, JOURS_AFFICHES)
        .map((j) => ({ jour: j.jour, taches: Number(j.taches ?? 0) }))
    },
  })

  return requete
}

/**
 * `AAAA-MM-JJ` vers une date LOCALE, et surtout pas `new Date('2026-09-11')`.
 *
 * Cette dernière est interprétée comme minuit UTC : à Paris en heure d'été, elle rend le 11 à 2 h,
 * ce qui est encore le bon jour — mais à l'ouest de Greenwich elle rendrait le 10 au soir, et la
 * matrice décalerait d'une case. On construit donc la date composant par composant.
 */
export function depuisIso(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(a, m - 1, j)
}
