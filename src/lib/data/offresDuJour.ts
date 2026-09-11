import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LES OFFRES DU JOUR ══
 *
 * William, 10/09/2026 : une section sous les cinq cartes, avec un tableau en trois sous-parties et
 * deux totaux à droite.
 *
 * ── LES TROIS SECTIONS ──
 *
 *   EN_RETARD    version actuelle « Disponible »,      date souhaitée < aujourd'hui
 *   A_ENVOYER    version actuelle « Disponible »,      date souhaitée = aujourd'hui
 *   EN_ATTENTE   version actuelle « En construction », date souhaitée = aujourd'hui
 *
 * `date_souhaitee` est la date à laquelle le commercial attend l'offre du service pricing —
 * William me l'a corrigé, je l'avais prise pour la date de début de fourniture. C'est un délai
 * INTERNE, d'où le sens des trois sections : ce qui a dépassé la date promise, ce qui est promis
 * pour aujourd'hui, et ce que le pricing doit encore rendre.
 *
 * ── DEUX APPELS, PARCE QUE DEUX PÉRIMÈTRES ──
 *
 * Le tableau ne montre que le jour. Les deux cartes mesurent tout autre chose : le pipe ouvert
 * court sur TOUTES mes recommandations ouvertes, le montant signé sur celles acceptées
 * aujourd'hui. Les déduire des lignes du tableau donnerait des totaux qui ne parlent que du
 * tableau, et qui bougeraient au moindre tri.
 *
 * ── LE FILTRE PAR UTILISATEUR EST EN BASE, PAS ICI ──
 *
 * Les deux fonctions lisent `auth.uid()`. Un filtre passé depuis le navigateur se change dans la
 * console ; celui-ci ne se contourne pas.
 */

export type SectionOffre = 'EN_RETARD' | 'A_ENVOYER' | 'EN_ATTENTE'

export interface LigneOffre {
  section: SectionOffre
  recommandation_id: string
  nom: string
  type_energie: string | null
  numero_version: number | null
  montant_estime: number | null
  date_souhaitee: string | null
  contact_id: string | null
  contact_nom: string | null
  compte_id: string | null
  compte_nom: string | null
}

export interface TotauxOffres {
  pipeOuvert: number
  montantSigne: number
}

/** Le fond de teint des deux crochets : une fonction absente ne doit pas blanchir la page. */
function absente(message: string): boolean {
  return /does not exist|schema cache|404/i.test(message)
}

export function useOffresDuJour() {
  const queryClient = useQueryClient()

  const requete = useQuery({
    queryKey: ['offres-du-jour'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<LigneOffre[]> => {
      const { data, error } = await supabase.rpc('lister_offres_du_jour')
      if (error) {
        if (absente(error.message)) return []
        throw new Error(error.message)
      }
      return (data ?? []) as LigneOffre[]
    },
  })

  /**
   * ══ LE TEMPS RÉEL ══
   *
   * Une version qui passe de « En construction » à « Disponible » change de section sous les yeux,
   * et une étude envoyée quitte le tableau. Sans cela, un commercial qui laisse sa page ouverte la
   * matinée verrait une liste périmée — exactement ce que la rangée de cartes évite déjà.
   *
   * ON RECOMPTE PLUTÔT QUE DE LIRE L'ÉVÉNEMENT : sa charge utile ne porte que les colonnes brutes
   * de la version, ni le statut lisible, ni le compte, ni le contact.
   */
  useEffect(() => {
    const rafraichir = () => {
      void queryClient.invalidateQueries({ queryKey: ['offres-du-jour'] })
      void queryClient.invalidateQueries({ queryKey: ['totaux-offres'] })
    }
    const canal = supabase
      .channel('offres-du-jour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'versions_recommandation' }, rafraichir)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recommandations' }, rafraichir)
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [queryClient])

  return requete
}

export function useTotauxOffres() {
  const requete = useQuery({
    queryKey: ['totaux-offres'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<TotauxOffres> => {
      const { data, error } = await supabase.rpc('compter_totaux_offres')
      if (error) {
        if (absente(error.message)) return { pipeOuvert: 0, montantSigne: 0 }
        throw new Error(error.message)
      }
      const l = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null
      return {
        pipeOuvert: Number(l?.pipe_ouvert ?? 0),
        montantSigne: Number(l?.montant_signe ?? 0),
      }
    },
  })

  return requete
}
