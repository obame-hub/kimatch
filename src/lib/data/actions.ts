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
/**
 * LES TROIS OBJETS DU CYCLE COMMERCIAL PEUVENT PORTER DES TÂCHES.
 *
 * Michel, 31/08/2026 : « permettre de créer et de suivre des actions dans les recommandations, les
 * opportunités et les pistes ». La lecture ne connaissait que les recommandations et les sites.
 *
 * UN SEUL RATTACHEMENT À LA FOIS, et l'ordre des tests le dit : on lit les tâches D'UN objet, jamais
 * l'union de plusieurs. Une fiche demande ce qui la concerne ; mélanger produirait une liste dont
 * personne ne saurait dire d'où vient chaque ligne.
 */
async function fetchActions(
  siteIds?: string[],
  actionId?: string,
  recommandationId?: string,
  opportuniteId?: string,
  pisteId?: string,
  suiviContratId?: string,
): Promise<ActionItem[]> {
  try {
    if (siteIds && siteIds.length === 0) return []
    const data = await fetchAllRows<RawAction>(
      'actions',
      'id, titre, site_id, contact_id, recommandation_id, opportunite_id, piste_id, suivi_contrat_id, date_creation, date_prevue, date_realisation, priorite, commentaire, proprietaire_id, responsable_profil_id, type_action:types_actions(libelle), statut:statuts_actions(code), responsable:profils!actions_responsable_profil_id_fkey(prenom, nom), site:sites(nom), contact:contacts(prenom, nom), recommandation:recommandations!recommandation_id(nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => {
        if (actionId) return q.eq('id', actionId)
        if (recommandationId) return q.eq('recommandation_id', recommandationId).order('date_prevue')
        if (opportuniteId) return q.eq('opportunite_id', opportuniteId).order('date_prevue')
        if (pisteId) return q.eq('piste_id', pisteId).order('date_prevue')
        if (suiviContratId) return q.eq('suivi_contrat_id', suiviContratId).order('date_prevue')
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

/** Tâches d'un suivi de contrat (colonne ajoutée le 31/08/2026 avec l'objet). */
export function useActionsParSuiviContrat(suiviId: string | undefined) {
  return useQuery({
    queryKey: ['actions', 'suivi-contrat', suiviId],
    queryFn: () => fetchActions(undefined, undefined, undefined, undefined, undefined, suiviId as string),
    enabled: !!suiviId,
  })
}

/** Tâches d'une opportunité. La colonne `opportunite_id` existait déjà, rien ne la lisait. */
export function useActionsParOpportunite(opportuniteId: string | undefined) {
  return useQuery({
    queryKey: ['actions', 'opportunite', opportuniteId],
    queryFn: () => fetchActions(undefined, undefined, undefined, opportuniteId as string),
    enabled: !!opportuniteId,
  })
}

/** Tâches d'une piste. `piste_id` vient de la migration 20260831200000. */
export function useActionsParPiste(pisteId: string | undefined) {
  return useQuery({
    queryKey: ['actions', 'piste', pisteId],
    queryFn: () => fetchActions(undefined, undefined, undefined, undefined, pisteId as string),
    enabled: !!pisteId,
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
  /** Opportunité ou piste d'origine — même rôle que `recommandation_id` (Michel, 31/08/2026). */
  opportunite_id?: string | null
  piste_id?: string | null
  /** Suivi de contrat — le cinquième rattachement possible d'une tâche. */
  suivi_contrat_id?: string | null
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
        // Renseigné juste après, une fois l'utilisateur connu : l'affichage optimiste doit porter le
        // même responsable que la ligne écrite, sinon la tâche apparaît puis s'évanouit au rechargement.
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

      /**
       * UNE TÂCHE SANS RESPONSABLE N'APPARAÎT DANS AUCUNE JOURNÉE, et c'était le cas des trois seules
       * tâches en base — signalé par Naoëlle le 27/08 : « pourquoi moi et Michel on ne voit rien dans
       * ce bloc Ma journée ». `responsable_profil_id` était laissé vide à la création, et « Ma
       * journée » filtre dessus. Trois tâches créées, zéro visible.
       *
       * LE CRÉATEUR EN EST DONC RESPONSABLE PAR DÉFAUT. C'est le comportement juste : on crée une
       * tâche parce qu'on a quelque chose à faire, pas pour le confier à quelqu'un d'anonyme. Elle se
       * réassigne ensuite depuis sa fiche.
       *
       * `getUser()` PLUTÔT QUE LE PROFIL EN CACHE : la mutation peut partir depuis n'importe quel
       * écran, y compris ceux qui n'ont pas chargé `useMonProfil`. L'identifiant du profil est celui
       * du compte authentifié — la table `profils` partage la clé de `auth.users`.
       */
      const { data: utilisateur } = await supabase.auth.getUser()
      const moi = utilisateur?.user?.id ?? null

      const { data, error } = await supabase
        .from('actions')
        .insert({
          titre: input.titre,
          site_id: input.site_id,
          contact_id: input.contact_id,
          priorite: input.priorite,
          date_prevue: input.echeance,
          commentaire: input.commentaire,
          ...(moi ? { responsable_profil_id: moi, proprietaire_id: moi } : {}),
          ...(input.recommandation_id ? { recommandation_id: input.recommandation_id } : {}),
          ...(input.opportunite_id ? { opportunite_id: input.opportunite_id } : {}),
          ...(input.piste_id ? { piste_id: input.piste_id } : {}),
          ...(input.suivi_contrat_id ? { suivi_contrat_id: input.suivi_contrat_id } : {}),
          ...(input.type_action_id ? { type_action_id: input.type_action_id } : {}),
          ...(input.statut_id ? { statut_id: input.statut_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        action = { ...action, id: (data as { id: string }).id, responsable_id: moi }
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
  /** Le statut, changé depuis la frise de la fiche (Naoëlle, 03/09/2026). */
  statut_id: string | null
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
      // ET LES LISTES PAR OBJET. `setQueryData(['actions'])` ci-dessus ne touche QUE la clé exacte :
      // les tâches d'une recommandation, d'une opportunité ou d'une piste vivent sous
      // ['actions', 'opportunite', id] et gardaient leur ancienne valeur. Invalider le préfixe les
      // couvre toutes, y compris celles que personne n'a encore écrites.
      queryClient.invalidateQueries({ queryKey: ['actions'] })
      return { persisted }
    },
  })
}
