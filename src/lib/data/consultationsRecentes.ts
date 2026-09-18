import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { SearchKind } from '@/lib/search'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ON VIENT D'OUVRIR
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « afficher les 5 derniers enregistrements sur lesquels j'ai cliqué ».
 *
 * La table et son raisonnement sont dans la migration 20260916170000 — en base plutôt que dans le
 * navigateur pour que la liste suive la personne d'une machine à l'autre, une ligne par
 * enregistrement plutôt qu'une par visite, et le libellé recopié plutôt que joint.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ConsultationRecente {
  entite_type: SearchKind
  entite_id: string
  libelle: string
  sous_libelle: string | null
  chemin: string
  date_consultation: string
}

const CLE = ['consultations-recentes'] as const

export function useConsultationsRecentes(limite = 5) {
  const { session } = useAuth()
  return useQuery({
    queryKey: [...CLE, limite],
    enabled: Boolean(session?.user.id),
    /* Cinq minutes de fraîcheur : la liste bouge quand on navigue, et c'est justement pendant
       qu'on navigue qu'on ne regarde pas la palette. L'écriture invalide de toute façon le cache. */
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultations_recentes')
        .select('entite_type, entite_id, libelle, sous_libelle, chemin, date_consultation')
        .order('date_consultation', { ascending: false })
        .limit(limite)
      if (error) throw new Error(error.message)
      return (data ?? []) as ConsultationRecente[]
    },
  })
}

/** Ce que la fiche doit dire d'elle-même pour être retrouvée. */
export interface Trace {
  type: SearchKind
  id: string | undefined
  libelle: string | null | undefined
  sousLibelle?: string | null
  chemin: string
}

/**
 * ══ LA FICHE SIGNALE SON OUVERTURE, SANS RIEN RALENTIR ══
 *
 * L'écriture part en arrière-plan et son échec est ignoré : perdre une ligne de récents n'est pas
 * une raison de faire échouer l'affichage d'une fiche, ni de montrer une erreur à quelqu'un qui n'a
 * rien demandé.
 *
 * ELLE N'ÉCRIT QU'UNE FOIS PAR FICHE ET PAR MONTAGE. Sans ce garde, chaque rendu de la page — et
 * une fiche se rend plusieurs fois pendant que ses requêtes arrivent — enverrait son écriture.
 *
 * ET ELLE ATTEND QUE LA FICHE AIT UN NOM. Une fiche s'affiche avant que ses données ne soient là :
 * écrire au premier rendu enregistrerait « — » comme libellé, c'est-à-dire exactement ce qu'on ne
 * veut pas relire dans la palette.
 */
export function useNoterConsultation(trace: Trace) {
  const { session } = useAuth()
  const monId = session?.user.id
  const client = useQueryClient()
  const dejaEcrit = useRef<string | null>(null)

  const { type, id, libelle, sousLibelle, chemin } = trace

  useEffect(() => {
    if (!monId || !id || !libelle) return
    const empreinte = `${type}:${id}`
    if (dejaEcrit.current === empreinte) return
    dejaEcrit.current = empreinte

    void supabase
      .from('consultations_recentes')
      .upsert(
        {
          profil_id: monId,
          entite_type: type,
          entite_id: id,
          libelle,
          sous_libelle: sousLibelle ?? null,
          chemin,
          date_consultation: new Date().toISOString(),
        },
        { onConflict: 'profil_id,entite_type,entite_id' },
      )
      .then(({ error }) => {
        if (error) {
          // Journalisé, jamais montré : c'est un confort, pas une donnée métier.
          console.warn('[récents] écriture ignorée :', error.message)
          return
        }
        void client.invalidateQueries({ queryKey: CLE })
      })
  }, [monId, type, id, libelle, sousLibelle, chemin, client])
}
