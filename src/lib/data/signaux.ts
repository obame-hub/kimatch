import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Signal } from '@/types/domain'
import { fetchComptesVisibles, fetchSitesVisiblesIds, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawSignal {
  id: string
  site_id: string
  contrat_id: string | null
  gravite: number | null
  date_creation: string
  commentaire: string | null
  proprietaire_id: string | null
  type_signal: { libelle: string; poids_defaut: number | null } | null
  statut: { code: string } | null
  site: { nom: string } | null
  responsable: { prenom: string; nom: string } | null
  recommandation_id: string | null
  recommandation: { nom: string } | null
}

/** `siteIds` restreint la lecture aux signaux d'un périmètre de sites — celui d'un compte, en
 *  pratique. Les signaux n'ont pas de compte_id : ils se rattachent au site. */
async function fetchSignaux(siteIds?: string[], signalId?: string): Promise<Signal[]> {

  try {
    if (siteIds && siteIds.length === 0) return []
    const data = await fetchAllRows<RawSignal>(
      'signaux',
      // `recommandations!recommandation_id` : hint de FK explicite -- la table recommandations a
      // plus d'une relation possible avec signaux, un embed non qualifié renvoie une erreur
      // PostgREST PGRST201 (relation ambiguë) qui faisait échouer tout le chargement des signaux.
      'id, site_id, contrat_id, gravite, date_creation, commentaire, proprietaire_id, type_signal:types_signaux(libelle, poids_defaut), statut:statuts_signaux(code), site:sites(nom), responsable:profils!signaux_responsable_profil_id_fkey(prenom, nom), recommandation_id, recommandation:recommandations!recommandation_id(nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => {
        if (signalId) return q.eq('id', signalId)
        return (siteIds ? q.in('site_id', siteIds) : q).order('date_creation', { ascending: false })
      },
    )

    const comptesVisibles = await fetchComptesVisibles()
    const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)

    return filterVisibles(data, sitesVisibles, (s) => s.site_id).map((s) => ({
      id: s.id,
      site_id: s.site_id,
      site_nom: s.site?.nom ?? '',
      contrat_id: s.contrat_id,
      type_signal: s.type_signal?.libelle ?? '',
      gravite: s.gravite,
      statut: s.statut?.code ?? '',
      conseiller: s.responsable ? `${s.responsable.prenom} ${s.responsable.nom}` : '',
      date_creation: s.date_creation,
      description: s.commentaire ?? '',
      proprietaire_id: s.proprietaire_id ?? null,
      recommandation_id: s.recommandation_id,
      recommandation_nom: s.recommandation?.nom ?? null,
    }))
  } catch (error) {
    console.error('fetchSignaux', error)
    return []
  }
}


/**
 * Un signal lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useSignal(signalId: string | undefined) {
  return useQuery({
    queryKey: ['signaux', 'un', signalId],
    queryFn: async () => (await fetchSignaux(undefined, signalId as string))[0] ?? null,
    enabled: !!signalId,
  })
}
export function useSignaux() {
  return useQuery({ queryKey: ['signaux'], queryFn: () => fetchSignaux() })
}

/** Signaux d'un périmètre de sites, filtrés côté serveur. À préférer sur toute fiche. */
export function useSignauxParSites(siteIds: string[] | undefined) {
  const cle = [...(siteIds ?? [])].sort()
  return useQuery({
    queryKey: ['signaux', 'sites', cle],
    queryFn: () => fetchSignaux(cle),
    enabled: !!siteIds,
  })
}

interface CreateSignalInput {
  site_id: string
  site_nom: string
  type_signal_id: string | null
  type_signal_libelle: string
  statut_id: string | null
  description: string
}

interface CreateSignalResult {
  signal: Signal
  persisted: boolean
}

export function useCreateSignal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSignalInput): Promise<CreateSignalResult> => {
      const now = new Date().toISOString()
      let persisted = false
      let signal: Signal = {
        id: `local-${Date.now()}`,
        site_id: input.site_id,
        site_nom: input.site_nom,
        contrat_id: null,
        type_signal: input.type_signal_libelle,
        gravite: null,
        statut: 'NOUVEAU',
        conseiller: '',
        date_creation: now,
        description: input.description,
        proprietaire_id: null,
      }

      const { data, error } = await supabase
        .from('signaux')
        .insert({
          site_id: input.site_id,
          commentaire: input.description,
          ...(input.type_signal_id ? { type_signal_id: input.type_signal_id } : {}),
          ...(input.statut_id ? { statut_id: input.statut_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        signal = { ...signal, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<Signal[]>(['signaux'], (old) => (old ? [signal, ...old] : [signal]))
      return { signal, persisted }
    },
  })
}

export interface UpdateSignalInput {
  id: string
  commentaire: string | null
  gravite?: number | null
}

export function useUpdateSignal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateSignalInput) => {
      const { error } = await supabase
        .from('signaux')
        .update({ commentaire: input.commentaire, ...(input.gravite !== undefined ? { gravite: input.gravite } : {}) })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['signaux'] }) },
  })
}

/** Colonnes réellement modifiables de `signaux`, pour l'édition en place.
 *  La description s'appelle `commentaire` en base. */
export type PatchSignal = Partial<{
  commentaire: string | null
  gravite: number | null
}>

/** Mise à jour d'un seul champ. `useUpdateSignal` écrit toujours `commentaire`, même quand on ne
 *  veut changer que la gravité — il l'effacerait. */
export function useUpdateSignalPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchSignal }) => {
      const { error } = await supabase.from('signaux').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signaux'] }),
  })
}

export function useDeleteSignal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('signaux').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['signaux'] }) },
  })
}
