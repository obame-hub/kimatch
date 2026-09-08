/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'APPEL EN COURS, VU DEPUIS KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 08/09/2026 : « il faut qu'on puisse appeler depuis Kimatch, raccrocher etc. sans devoir
 * ouvrir Allo en externe. »
 *
 * ══ ON NE PEUT PAS RACCROCHER. ON PEUT SAVOIR ══
 *
 * L'API d'Allo n'expose aucun contrôle d'appel — vérifié le 08/09/2026 sur leur table complète
 * portée-par-endpoint. Ce qu'elle expose, ce sont trois événements que `api/allo/webhook.ts` reçoit
 * et écrit dans `appels_en_cours`. Ce module les relit, pour que la carte s'ouvre, se remplisse et
 * se ferme sans que personne aille voir dans Allo.
 *
 * ══ POURQUOI UNE INTERROGATION RÉGULIÈRE ET NON LE TEMPS RÉEL ══
 *
 * Relevé avant de choisir : `supabase_realtime` ne publiait AUCUNE table, et aucun écran de Kimatch
 * n'appelait `.channel()`. Le temps réel n'a jamais servi ici.
 *
 * Introduire une première dépendance websocket la veille d'un test, sur une application dont
 * l'équipe a été arrêtée une heure la veille, serait mal choisir son moment. On interroge donc
 * toutes les quatre secondes — et seulement quand l'onglet est visible, ce qui met à zéro le coût
 * des douze onglets oubliés d'une équipe de treize personnes.
 *
 * La table est DÉJÀ dans la publication (migration 20260908160000) : le jour où quatre secondes
 * gênent, le passage au temps réel ne demande plus de migration, seulement de remplacer
 * `refetchInterval` par un abonnement ici.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMonProfil, emailAllo } from '@/lib/data/roles'

/** Les quatre valeurs, bornées en base par `appels_en_cours_qualification_check`. */
export type Qualification = 'HUMAIN' | 'REPONDEUR' | 'SERVEUR_VOCAL' | 'PAS_DE_REPONSE'

export interface AppelEnCours {
  id: string
  user_email: string
  numero: string
  sens: 'ENTRANT' | 'SORTANT'
  contact_id: string | null
  compte_id: string | null
  piste_id: string | null
  demarre_le: string
  decroche_le: string | null
  termine_le: string | null
  termine_par: 'ALLO' | 'COMMERCIAL' | null
  resultat: string | null
  duree_secondes: number | null
  enregistrement_url: string | null
  transcription: string | null
  resume_allo: string | null
  ivr_touches: unknown[] | null
  qualification: Qualification | null
}

/** Quatre secondes : assez pour que la carte paraisse instantanée, assez peu pour ne rien coûter. */
const INTERVALLE_MS = 4000

/**
 * L'onglet est-il regardé ?
 *
 * `document.visibilityState` et non le focus de la fenêtre : un commercial qui a Kimatch d'un côté
 * et Allo de l'autre n'a pas le focus sur Kimatch, mais il le VOIT — et c'est précisément le moment
 * où la carte doit vivre. Le focus aurait éteint l'interrogation au pire instant.
 */
function useOngletVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )
  useEffect(() => {
    const surChangement = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', surChangement)
    return () => document.removeEventListener('visibilitychange', surChangement)
  }, [])
  return visible
}

/**
 * Le dernier appel de la personne connectée qui mérite une carte.
 *
 * ON GARDE LES APPELS TERMINÉS RÉCENTS, et c'est tout l'intérêt. `call.completed` arrive environ
 * trente secondes après le raccrochage : si la carte disparaissait à `termine_le`, le commercial
 * n'aurait jamais le temps de qualifier. Elle reste donc dix minutes, le temps d'un clic — et
 * disparaît dès que la qualification est posée.
 */
export function useAppelEnCours() {
  const { data: profil } = useMonProfil()
  const visible = useOngletVisible()
  const queryClient = useQueryClient()

  /* ══ LA CARTE SUIT LE COMPTE ALLO, PAS LE PROFIL KIMATCH ══
   *
   * Elle interrogeait `profil_id`. Naoëlle, 08/09/2026 : « je suis connectée sur le compte de
   * Will », puis « pour le moment Will ne peut pas ajouter mon numéro, faut qu'on teste sans ».
   *
   * Sept membres dans l'espace Allo, dix profils actifs dans Kimatch : quelqu'un qui n'a pas de
   * compte Allo opère celui d'un collègue. Sur `profil_id`, sa carte ne s'ouvrirait jamais — les
   * appels sont attribués au profil du compte Allo qui les a passés.
   *
   * ET CE N'EST PAS UN ARRANGEMENT DE CIRCONSTANCE. La carte est une surface de travail éphémère :
   * elle répond à « quel appel se passe sur le compte que j'opère ». L'HISTORIQUE, lui, reste
   * attribué à `profils.email` par le webhook — un appel de William reste un appel de William, et
   * rien n'est falsifié. Deux questions différentes, deux clés différentes.
   *
   * Au passage, c'est plus robuste : sur `profil_id`, un appel venu d'une adresse Allo absente de
   * `profils` produisait une carte que personne ne voyait. */
  const adresseAllo = emailAllo(profil)

  const requete = useQuery({
    queryKey: ['appel-en-cours', adresseAllo],
    enabled: Boolean(adresseAllo),
    refetchInterval: visible ? INTERVALLE_MS : false,
    // Une carte d'appel périmée n'a aucun intérêt : on ne garde rien entre deux lectures.
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<AppelEnCours | null> => {
      const ilYaDixMinutes = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('appels_en_cours')
        .select('*')
        .eq('user_email', adresseAllo as string)
        .is('qualification', null)
        .gte('demarre_le', ilYaDixMinutes)
        .order('demarre_le', { ascending: false })
        .limit(1)
      if (error) throw new Error(error.message)
      return (data?.[0] as AppelEnCours | undefined) ?? null
    },
  })

  /* ══ QUAND L'APPEL SE TERMINE, LE FIL D'ACTIVITÉ SE RELIT ══
   *
   * Naoëlle, 08/09/2026 : « je viens d'appeler à l'instant et je ne vois pas l'appel dans
   * l'activité. »
   *
   * Son appel ÉTAIT bien capté — écrit en base trois secondes après le départ. Mais l'interaction
   * n'est écrite qu'à `call.completed`, qui arrive une trentaine de secondes après le raccrochage,
   * et le fil d'activité de la fiche, lui, ne se relit jamais tout seul : il fallait recharger la
   * page pour voir apparaître l'appel.
   *
   * On surveille donc le passage de « en cours » à « terminé » — la carte interroge déjà toutes les
   * quatre secondes, ça ne coûte pas une requête de plus — et on invalide les interactions à ce
   * moment-là. L'appel apparaît alors dans le fil sans que personne ne recharge.
   *
   * `useRef` ET NON UN ÉTAT : ce drapeau ne doit pas provoquer de rendu, sinon il déclencherait le
   * cycle qu'il observe. */
  const etaitTermine = useRef<string | null>(null)
  useEffect(() => {
    const appel = requete.data
    if (!appel?.termine_le) return
    // Une seule invalidation par appel, même si la carte relit dix fois la même ligne terminée.
    if (etaitTermine.current === appel.id) return
    etaitTermine.current = appel.id
    void queryClient.invalidateQueries({ queryKey: ['interactions'] })
    void queryClient.invalidateQueries({ queryKey: ['activite'] })
  }, [requete.data, queryClient])

  return requete
}

/**
 * Le clic qui qualifie, et qui referme la carte.
 *
 * Michel, 08/09/2026 : « si c'est mettre "je l'ai eu, je l'ai pas eu" et que dans l'application
 * c'est obligatoire, ils le feront. Mais qu'à chaque fois ils mettent une note, ils ne le feront
 * quasiment jamais. » D'où un seul geste, et rien d'autre à remplir.
 *
 * On écrit AUSSI `termine_le` quand Allo ne l'a pas encore dit : qualifier, c'est déclarer l'appel
 * fini. Sans cela, la carte d'un appel qualifié pendant les trente secondes d'attente de
 * `call.completed` resterait « en cours » alors que la personne est déjà passée à la suite.
 */
export function useQualifierAppel() {
  const queryClient = useQueryClient()
  const { data: profil } = useMonProfil()

  return useMutation({
    mutationFn: async ({ id, qualification }: { id: string; qualification: Qualification }) => {
      const { error } = await supabase
        .from('appels_en_cours')
        .update({
          qualification,
          qualifie_le: new Date().toISOString(),
          qualifie_par: (profil?.id as string | undefined) ?? null,
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appel-en-cours'] })
      // L'appel qualifié rejoint l'historique de la fiche : ces listes-là doivent se relire.
      void queryClient.invalidateQueries({ queryKey: ['interactions'] })
    },
  })
}

/** Fermer la carte sans qualifier — un appel raté, une fausse manœuvre. */
export function useEcarterAppel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('appels_en_cours')
        .update({
          qualification: 'PAS_DE_REPONSE',
          termine_le: new Date().toISOString(),
          termine_par: 'COMMERCIAL',
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appel-en-cours'] }),
  })
}

/**
 * Où en est l'appel, en un mot.
 *
 * Trois états seulement, parce qu'il n'y a que trois choses à savoir : ça sonne, on parle, c'est
 * fini. Le quatrième état — « Allo ne nous a encore rien dit » — est indistinguable du troisième
 * pendant trente secondes, et prétendre le contraire serait mentir à l'écran.
 */
export type EtatAppel = 'sonne' | 'en_ligne' | 'termine'

export function etatDeLAppel(a: AppelEnCours): EtatAppel {
  if (a.termine_le) return 'termine'
  if (a.decroche_le) return 'en_ligne'
  return 'sonne'
}

/** Le serveur vocal qu'Allo compte comme un décroché — voir `ivr_touches`. */
export function aRencontreUnServeurVocal(a: AppelEnCours): boolean {
  return Array.isArray(a.ivr_touches) && a.ivr_touches.length > 0
}

/** Les secondes écoulées depuis le décroché, ou depuis le départ si ça sonne encore. */
export function secondesEcoulees(a: AppelEnCours, maintenant: number): number {
  const depuis = a.decroche_le ?? a.demarre_le
  return Math.max(0, Math.floor((maintenant - new Date(depuis).getTime()) / 1000))
}

/** « 2 min 14 s ». */
export function dureeLisible(secondes: number): string {
  const m = Math.floor(secondes / 60)
  const s = secondes % 60
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`
}
