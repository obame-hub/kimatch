import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { mockInteractions } from '@/lib/mockData'
import type { Interaction } from '@/types/domain'
import { fetchComptesVisibles, fetchSitesVisiblesIds } from '@/lib/data/visibility'

interface RawInteraction {
  id: string
  date_interaction: string
  sens: string | null
  objet: string | null
  resume: string | null
  resultat: string | null
  compte_id: string | null
  site_id: string | null
  contact_id: string | null
  type_interaction: { libelle: string } | null
  auteur: { prenom: string; nom: string } | null
  compte: { nom: string } | null
  site: { nom: string } | null
  contact: { prenom: string; nom: string } | null
  issue: { libelle: string; couleur: string | null } | null
  proprietaire_id: string | null
  duree_appel_secondes: number | null
  appel_manque: boolean | null
  messagerie_vocale: boolean | null
  numero_correspondant: string | null
  decroche_par: string | null
  enregistrement_url: string | null
}

const INTERACTIONS_SELECT =
  'id, date_interaction, sens, objet, resume, resultat, compte_id, site_id, contact_id, type_interaction:types_interactions(libelle), auteur:profils!interactions_auteur_profil_id_fkey(prenom, nom), compte:comptes(nom), site:sites(nom), contact:contacts(prenom, nom), issue:issues_interactions(libelle, couleur), proprietaire_id, duree_appel_secondes, appel_manque, messagerie_vocale, numero_correspondant, decroche_par, enregistrement_url'

async function fetchInteractionsPage(from: number, pageSize: number, attempt = 0): Promise<RawInteraction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select(INTERACTIONS_SELECT)
    .order('date_interaction', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) {
    // Supabase renvoie parfois 500/503 quand trop de requetes lourdes (avec jointures) partent
    // en meme temps -- on retente avant d'abandonner plutot que de faire echouer tout le fetch.
    if (attempt < 2) return fetchInteractionsPage(from, pageSize, attempt + 1)
    throw error
  }
  return (data ?? []) as unknown as RawInteraction[]
}

// PostgREST plafonne chaque requête (par défaut 1000 lignes) : sans pagination, les interactions
// les plus anciennes disparaissent silencieusement dès que la table dépasse ce plafond — repéré
// le 29/07/2026 quand des comptes avec des interactions réelles mais plus anciennes que les 1000
// interactions les plus récentes de toute la base n'affichaient plus rien.
// Les pages sont recuperees en parallele avec une limite de concurrence : tout envoyer d'un coup
// (17 pages avec ces jointures) sature Supabase (500/503 observes), alors qu'une boucle
// strictement sequentielle prend plus d'une minute -- un compromis a CONCURRENCY pages a la fois.
async function fetchAllInteractionsPages(): Promise<RawInteraction[]> {
  const PAGE_SIZE = 1000
  const CONCURRENCY = 4
  const { count, error: countError } = await supabase
    .from('interactions')
    .select('id', { count: 'exact', head: true })
  if (countError) throw countError

  const total = count ?? 0
  const pageStarts: number[] = []
  for (let from = 0; from < total; from += PAGE_SIZE) pageStarts.push(from)
  if (pageStarts.length === 0) return []

  const results: RawInteraction[][] = new Array(pageStarts.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < pageStarts.length) {
      const idx = nextIndex++
      results[idx] = await fetchInteractionsPage(pageStarts[idx], PAGE_SIZE)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pageStarts.length) }, worker))
  return results.flat()
}

async function fetchInteractions(): Promise<Interaction[]> {
  if (isDemoMode()) return mockInteractions
  try {
    const data = await fetchAllInteractionsPages()

    const comptesVisibles = await fetchComptesVisibles()
    const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)

    const visibles = comptesVisibles === null
      ? (data ?? [])
      : ((data ?? []) as unknown as RawInteraction[]).filter(
          (i) =>
            (i.compte_id != null && comptesVisibles.includes(i.compte_id)) ||
            (i.site_id != null && (sitesVisibles ?? []).includes(i.site_id)),
        )

    return (visibles as unknown as RawInteraction[]).map(mapRawInteraction)
  } catch (error) {
    console.error('fetchInteractions', error)
    return []
  }
}

function mapRawInteraction(i: RawInteraction): Interaction {
  return {
    id: i.id,
    type_interaction: i.type_interaction?.libelle ?? '',
    date_interaction: i.date_interaction,
    sens: i.sens,
    objet: i.objet,
    resume: i.resume,
    resultat: i.resultat,
    auteur: i.auteur ? `${i.auteur.prenom} ${i.auteur.nom}` : '',
    compte_id: i.compte_id,
    compte_nom: i.compte?.nom ?? '',
    site_id: i.site_id,
    site_nom: i.site?.nom ?? '',
    contact_id: i.contact_id,
    contact_nom: i.contact ? `${i.contact.prenom} ${i.contact.nom}` : '',
    issue_libelle: i.issue?.libelle,
    issue_couleur: i.issue?.couleur,
    proprietaire_id: i.proprietaire_id,
    duree_appel_secondes: i.duree_appel_secondes,
    appel_manque: i.appel_manque,
    messagerie_vocale: i.messagerie_vocale,
    numero_correspondant: i.numero_correspondant,
    decroche_par: i.decroche_par,
    enregistrement_url: i.enregistrement_url,
  }
}

// Fiche Compte/Contact/Site : charger UNIQUEMENT les interactions du perimetre concerne plutot
// que la table entiere (des dizaines de milliers de lignes une fois tous les comptes Salesforce
// importes) -- le fetch complet mettait plus de 5 minutes a charger une seule fiche compte.
async function fetchInteractionsByCompte(compteId: string, siteIds: string[]): Promise<Interaction[]> {
  if (isDemoMode()) {
    return mockInteractions.filter((i) => i.compte_id === compteId || (i.site_id != null && siteIds.includes(i.site_id)))
  }
  const orParts = [`compte_id.eq.${compteId}`]
  if (siteIds.length > 0) orParts.push(`site_id.in.(${siteIds.join(',')})`)

  const { data, error } = await supabase
    .from('interactions')
    .select(INTERACTIONS_SELECT)
    .or(orParts.join(','))
    .order('date_interaction', { ascending: false })
    .limit(2000)
  if (error) {
    console.error('fetchInteractionsByCompte', error)
    return []
  }
  return ((data ?? []) as unknown as RawInteraction[]).map(mapRawInteraction)
}

export function useInteractionsForCompte(compteId: string | undefined, siteIds: string[]) {
  const sortedSiteIds = [...siteIds].sort()
  return useQuery({
    queryKey: ['interactions', 'compte', compteId, sortedSiteIds],
    queryFn: () => fetchInteractionsByCompte(compteId as string, sortedSiteIds),
    enabled: !!compteId,
  })
}

export function useInteractions() {
  return useQuery({ queryKey: ['interactions'], queryFn: fetchInteractions })
}

interface CreateInteractionInput {
  type_interaction_id: string | null
  type_interaction_libelle: string
  date_interaction: string
  sens: string | null
  objet: string | null
  resume: string | null
  resultat: string | null
  compte_id: string | null
  compte_nom: string
  site_id: string | null
  site_nom: string
  contact_id: string | null
  contact_nom: string
  issue_interaction_id: string | null
  issue_libelle?: string
}

interface CreateInteractionResult {
  interaction: Interaction
  persisted: boolean
}

export function useCreateInteraction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateInteractionInput): Promise<CreateInteractionResult> => {
      let persisted = false
      let interaction: Interaction = {
        id: `local-${Date.now()}`,
        type_interaction: input.type_interaction_libelle,
        date_interaction: input.date_interaction,
        sens: input.sens,
        objet: input.objet,
        resume: input.resume,
        resultat: input.resultat,
        auteur: '',
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        site_id: input.site_id,
        site_nom: input.site_nom,
        contact_id: input.contact_id,
        contact_nom: input.contact_nom,
        issue_libelle: input.issue_libelle,
        proprietaire_id: null,
      }

      if (!isDemoMode()) {
        const { data, error } = await supabase
          .from('interactions')
          .insert({
            date_interaction: input.date_interaction,
            sens: input.sens,
            objet: input.objet,
            resume: input.resume,
            resultat: input.resultat,
            compte_id: input.compte_id,
            site_id: input.site_id,
            contact_id: input.contact_id,
            ...(input.type_interaction_id ? { type_interaction_id: input.type_interaction_id } : {}),
            ...(input.issue_interaction_id ? { issue_interaction_id: input.issue_interaction_id } : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          interaction = { ...interaction, id: (data as { id: string }).id }
          persisted = true
        }
      }

      queryClient.setQueryData<Interaction[]>(['interactions'], (old) => (old ? [interaction, ...old] : [interaction]))
      return { interaction, persisted }
    },
  })
}

export interface UpdateInteractionInput {
  id: string
  date_interaction: string
  sens: string | null
  objet: string | null
  resume: string | null
  resultat: string | null
  proprietaire_id: string | null
}

export function useUpdateInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateInteractionInput) => {
      const { error } = await supabase
        .from('interactions')
        .update({
          date_interaction: input.date_interaction,
          sens: input.sens,
          objet: input.objet,
          resume: input.resume,
          resultat: input.resultat,
          proprietaire_id: input.proprietaire_id,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactions'] }),
  })
}

export function useDeleteInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('interactions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactions'] }),
  })
}
