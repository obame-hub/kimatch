import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ActionItem } from '@/types/domain'
import { fetchComptesVisibles, fetchSitesVisiblesIds } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawAction {
  id: string
  titre: string
  site_id: string | null
  contact_id: string | null
  recommandation_id: string | null
  date_creation: string
  date_prevue: string | null
  date_realisation: string | null
  priorite: number
  commentaire: string | null
  proprietaire_id: string | null
  responsable_profil_id: string | null
  type_action: { libelle: string } | null
  statut: { code: string } | null
  responsable: { prenom: string; nom: string } | null
  site: { nom: string } | null
  contact: { prenom: string; nom: string } | null
  recommandation: { nom: string } | null
}

/** `siteIds` restreint la lecture aux tâches d'un périmètre de sites. Les tâches sans site
 *  (purement personnelles ou liées à un seul contact) ne concernent pas une fiche compte : elles
 *  sont donc hors périmètre quand le filtre est fourni. */
async function fetchActions(siteIds?: string[], actionId?: string, recommandationId?: string): Promise<ActionItem[]> {
  try {
    if (siteIds && siteIds.length === 0) return []
    const data = await fetchAllRows<RawAction>(
      'actions',
      'id, titre, site_id, contact_id, recommandation_id, date_creation, date_prevue, date_realisation, priorite, commentaire, proprietaire_id, responsable_profil_id, type_action:types_actions(libelle), statut:statuts_actions(code), responsable:profils!actions_responsable_profil_id_fkey(prenom, nom), site:sites(nom), contact:contacts(prenom, nom), recommandation:recommandations!recommandation_id(nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => {
        if (actionId) return q.eq('id', actionId)
        if (recommandationId) return q.eq('recommandation_id', recommandationId).order('date_prevue')
        return (siteIds ? q.in('site_id', siteIds) : q).order('date_prevue')
      },
    )

    const comptesVisibles = await fetchComptesVisibles()
    const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)

    // Une tâche sans site_id (ex. liée seulement à un contact, ou purement personnelle)
    // reste visible — on ne restreint que celles clairement rattachées à un site hors périmètre.
    const visibles = sitesVisibles === null ? data : data.filter((a) => a.site_id == null || sitesVisibles.includes(a.site_id))

    return visibles.map((a) => ({
      id: a.id,
      titre: a.titre,
      type_action: a.type_action?.libelle ?? a.titre,
      statut: a.statut?.code ?? '',
      priorite: a.priorite,
      responsable: a.responsable ? `${a.responsable.prenom} ${a.responsable.nom}` : '',
      responsable_id: a.responsable_profil_id,
      date_creation: a.date_creation,
      echeance: a.date_prevue ?? '',
      date_realisation: a.date_realisation,
      commentaire: a.commentaire,
      cible_label: a.site?.nom ?? '',
      site_id: a.site_id,
      contact_id: a.contact_id,
      contact_nom: a.contact ? `${a.contact.prenom} ${a.contact.nom}` : '',
      recommandation_id: a.recommandation_id,
      recommandation_titre: a.recommandation?.nom ?? '',
      proprietaire_id: a.proprietaire_id ?? null,
    }))
  } catch (error) {
    console.error('fetchActions', error)
    return []
  }
}


/**
 * Une tache lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useAction(actionId: string | undefined) {
  return useQuery({
    queryKey: ['actions', 'un', actionId],
    queryFn: async () => (await fetchActions(undefined, actionId as string))[0] ?? null,
    enabled: !!actionId,
  })
}
export function useActions() {
  return useQuery({ queryKey: ['actions'], queryFn: () => fetchActions() })
}

/**
 * Tâches rattachées à une recommandation — le fil d'activité de la fiche.
 *
 * `actions.recommandation_id` existe depuis longtemps mais ne comptait ZÉRO ligne au 17/08/2026 :
 * rien ne créait de tâche depuis une recommandation. Le bouton « Rappel » du fil est le premier à
 * en produire.
 */
export function useActionsParRecommandation(recoId: string | undefined) {
  return useQuery({
    queryKey: ['actions', 'recommandation', recoId],
    queryFn: () => fetchActions(undefined, undefined, recoId as string),
    enabled: !!recoId,
  })
}

/** Tâches d'un périmètre de sites, filtrées côté serveur. À préférer sur toute fiche. */
export function useActionsParSites(siteIds: string[] | undefined) {
  const cle = [...(siteIds ?? [])].sort()
  return useQuery({
    queryKey: ['actions', 'sites', cle],
    queryFn: () => fetchActions(cle),
    enabled: !!siteIds,
  })
}

interface CreateActionInput {
  titre: string
  type_action_id: string | null
  type_action_libelle: string
  site_id: string | null
  site_nom: string
  contact_id: string | null
  contact_nom: string
  priorite: number
  echeance: string | null
  commentaire: string | null
  statut_id: string | null
  /** Recommandation d'origine — le bouton « Rappel » du fil d'activité de la fiche. Sans elle, la
   *  tâche existe mais ne revient jamais dans le fil de la recommandation qui l'a créée. */
  recommandation_id?: string | null
  recommandation_titre?: string
}

interface CreateActionResult {
  action: ActionItem
  persisted: boolean
}

export function useCreateAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateActionInput): Promise<CreateActionResult> => {
      let persisted = false
      let action: ActionItem = {
        id: `local-${Date.now()}`,
        titre: input.titre,
        type_action: input.type_action_libelle,
        statut: 'A_FAIRE',
        priorite: input.priorite,
        responsable: '',
        responsable_id: null,
        date_creation: new Date().toISOString(),
        echeance: input.echeance ?? '',
        date_realisation: null,
        commentaire: input.commentaire,
        cible_label: input.site_nom,
        site_id: input.site_id,
        contact_id: input.contact_id,
        contact_nom: input.contact_nom,
        recommandation_id: input.recommandation_id ?? null,
        recommandation_titre: input.recommandation_titre ?? '',
        proprietaire_id: null,
      }

      const { data, error } = await supabase
        .from('actions')
        .insert({
          titre: input.titre,
          site_id: input.site_id,
          contact_id: input.contact_id,
          priorite: input.priorite,
          date_prevue: input.echeance,
          commentaire: input.commentaire,
          ...(input.recommandation_id ? { recommandation_id: input.recommandation_id } : {}),
          ...(input.type_action_id ? { type_action_id: input.type_action_id } : {}),
          ...(input.statut_id ? { statut_id: input.statut_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        action = { ...action, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<ActionItem[]>(['actions'], (old) => (old ? [action, ...old] : [action]))
      return { action, persisted }
    },
    /** Même motif que pour les interactions : les fiches lisent des clés dérivées
     *  (`['actions','recommandation',…]`, `['actions','sites',…]`) que le `setQueryData` ci-dessus
     *  ne touche pas. Sans invalidation du préfixe, un rappel créé depuis une fiche n'y apparaît
     *  qu'après rechargement de la page. */
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['actions'] }) },
  })
}

export interface UpdateActionInput {
  id: string
  titre: string
  priorite: number
  echeance: string | null
  commentaire: string | null
  site_id: string | null
  contact_id: string | null
}

export function useUpdateAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateActionInput) => {
      const { error } = await supabase
        .from('actions')
        .update({
          titre: input.titre,
          priorite: input.priorite,
          date_prevue: input.echeance,
          commentaire: input.commentaire,
          site_id: input.site_id,
          contact_id: input.contact_id,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['actions'] }) },
  })
}

/**
 * Colonnes réellement modifiables de `actions`, pour l'édition en place.
 *
 * Attention au nom : l'échéance s'appelle `date_prevue` en base et `echeance` dans le type de
 * domaine. C'est la colonne qui compte ici.
 */
export type PatchAction = Partial<{
  titre: string
  priorite: number
  date_prevue: string | null
  commentaire: string | null
  site_id: string | null
  contact_id: string | null
  responsable_profil_id: string | null
}>

/** Mise à jour d'un seul champ, sans réécrire toute la tâche. */
export function useUpdateActionPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchAction }) => {
      const { error } = await supabase.from('actions').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actions'] }),
  })
}

export function useDeleteAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('actions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['actions'] }) },
  })
}

interface CompleteActionResult {
  persisted: boolean
}

export function useCompleteAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (actionId: string): Promise<CompleteActionResult> => {
      const now = new Date().toISOString()
      const { error } = await supabase.from('actions').update({ date_realisation: now }).eq('id', actionId)
      const persisted = !error
      queryClient.setQueryData<ActionItem[]>(['actions'], (old) =>
        old?.map((a) => (a.id === actionId ? { ...a, statut: 'TERMINEE', date_realisation: now } : a)),
      )
      // « Ma journée » du tableau de bord lit sa propre requête : sans cette invalidation, la case
      // se cochait et la ligne restait « à réaliser » jusqu'au rechargement de la page.
      queryClient.invalidateQueries({ queryKey: ['tableau-de-bord', 'mes-actions'] })
      return { persisted }
    },
  })
}
