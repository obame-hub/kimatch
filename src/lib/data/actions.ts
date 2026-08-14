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
async function fetchActions(siteIds?: string[]): Promise<ActionItem[]> {
  try {
    if (siteIds && siteIds.length === 0) return []
    const data = await fetchAllRows<RawAction>(
      'actions',
      'id, titre, site_id, contact_id, recommandation_id, date_creation, date_prevue, date_realisation, priorite, commentaire, proprietaire_id, responsable_profil_id, type_action:types_actions(libelle), statut:statuts_actions(code), responsable:profils!actions_responsable_profil_id_fkey(prenom, nom), site:sites(nom), contact:contacts(prenom, nom), recommandation:recommandations!recommandation_id(nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => (siteIds ? q.in('site_id', siteIds) : q).order('date_prevue'),
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

export function useActions() {
  return useQuery({ queryKey: ['actions'], queryFn: () => fetchActions() })
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
        recommandation_id: null,
        recommandation_titre: '',
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['actions'] }),
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
      return { persisted }
    },
  })
}
