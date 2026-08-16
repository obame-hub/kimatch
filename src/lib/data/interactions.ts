import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
  recommandation_id: string | null
  signal_id: string | null
  type_interaction: { libelle: string } | null
  auteur: { prenom: string; nom: string } | null
  compte: { nom: string } | null
  site: { nom: string } | null
  contact: { prenom: string; nom: string } | null
  recommandation: { nom: string } | null
  signal: { type_signal: { libelle: string } | null } | null
  issue: { libelle: string; couleur: string | null } | null
  proprietaire_id: string | null
  duree_appel_secondes: number | null
  appel_manque: boolean | null
  messagerie_vocale: boolean | null
  numero_correspondant: string | null
  decroche_par: string | null
  enregistrement_url: string | null
}

// `!recommandation_id`/`!signal_id` : hints de FK explicites -- recommandations et signaux ont
// plus d'une relation possible entre elles, un embed non qualifié renvoie une erreur PostgREST
// PGRST201 (relation ambiguë) qui faisait échouer tout le chargement des interactions.
const INTERACTIONS_SELECT =
  'id, date_interaction, sens, objet, resume, resultat, compte_id, site_id, contact_id, recommandation_id, signal_id, type_interaction:types_interactions(libelle), auteur:profils!interactions_auteur_profil_id_fkey(prenom, nom), compte:comptes(nom), site:sites(nom), contact:contacts(prenom, nom), recommandation:recommandations!recommandation_id(nom), signal:signaux!signal_id(type_signal:types_signaux(libelle)), issue:issues_interactions(libelle, couleur), proprietaire_id, duree_appel_secondes, appel_manque, messagerie_vocale, numero_correspondant, decroche_par, enregistrement_url'

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
/**
 * @param limite Nombre maximum d'interactions à charger, les plus récentes d'abord. `null` charge
 *   tout — réservé à l'index de recherche globale, qui doit pouvoir tout retrouver.
 *
 * La table compte 66 643 lignes (06/08/2026), soit 67 pages de 1000 : la charger entièrement pour
 * afficher un écran qui n'en montre que quelques dizaines coûtait 30 secondes.
 */
async function fetchAllInteractionsPages(limite: number | null = null): Promise<RawInteraction[]> {
  const PAGE_SIZE = 1000
  const CONCURRENCY = 4
  const { count, error: countError } = await supabase
    .from('interactions')
    .select('id', { count: 'exact', head: true })
  if (countError) throw countError

  const total = limite === null ? (count ?? 0) : Math.min(count ?? 0, limite)
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

async function fetchInteractions(limite: number | null = null): Promise<Interaction[]> {
  try {
    const data = await fetchAllInteractionsPages(limite)

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
    recommandation_id: i.recommandation_id,
    recommandation_nom: i.recommandation?.nom ?? null,
    signal_id: i.signal_id,
    signal_nom: i.signal?.type_signal?.libelle ?? null,
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
  // Requêtes séparées plutôt qu'un `.or()` unique. L'ancienne version combinait `compte_id.eq.…`
  // et `site_id.in.(…)` dans un même `.or()`, ce que PostgREST refusait en 500 (vu en production
  // le 06/08/2026 sur KIWEE ENERGIE FRANCE, qui n'a pourtant que 7 sites — ce n'est donc pas une
  // question de volume, mais bien la syntaxe `in.()` imbriquée dans un `or`). Un `.in()` seul est
  // correctement sérialisé, et le découpage par lots protège au passage les gros comptes d'une
  // URL trop longue.
  const requetes = [
    supabase.from('interactions').select(INTERACTIONS_SELECT)
      .eq('compte_id', compteId).order('date_interaction', { ascending: false }).limit(2000),
  ]
  if (siteIds.length > 0) {
    // Les sites sont eux-mêmes découpés : au-delà de ~150 identifiants, l'URL redevient trop longue.
    const LOT = 150
    for (let i = 0; i < siteIds.length; i += LOT) {
      requetes.push(
        supabase.from('interactions').select(INTERACTIONS_SELECT)
          .in('site_id', siteIds.slice(i, i + LOT))
          .order('date_interaction', { ascending: false }).limit(2000),
      )
    }
  }

  const resultats = await Promise.all(requetes)
  const parId = new Map<string, RawInteraction>()
  for (const { data, error } of resultats) {
    if (error) {
      console.error('fetchInteractionsByCompte', error)
      continue // une requête en échec ne doit pas vider tout le fil d'activité
    }
    for (const row of (data ?? []) as unknown as RawInteraction[]) parId.set(row.id, row)
  }

  return [...parId.values()]
    .map(mapRawInteraction)
    .sort((a, b) => (b.date_interaction ?? '').localeCompare(a.date_interaction ?? ''))
}

export function useInteractionsForCompte(compteId: string | undefined, siteIds: string[]) {
  const sortedSiteIds = [...siteIds].sort()
  return useQuery({
    queryKey: ['interactions', 'compte', compteId, sortedSiteIds],
    queryFn: () => fetchInteractionsByCompte(compteId as string, sortedSiteIds),
    enabled: !!compteId,
  })
}

async function fetchInteractionsByColumn(column: 'contact_id' | 'site_id', value: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select(INTERACTIONS_SELECT)
    .eq(column, value)
    .order('date_interaction', { ascending: false })
    .limit(2000)
  if (error) {
    console.error('fetchInteractionsByColumn', column, error)
    return []
  }
  return ((data ?? []) as unknown as RawInteraction[]).map(mapRawInteraction)
}

// Fiche Contact/Site : meme logique que useInteractionsForCompte -- ne charger que le perimetre
// concerne plutot que la table entiere.
export function useInteractionsForContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['interactions', 'contact', contactId],
    queryFn: () => fetchInteractionsByColumn('contact_id', contactId as string),
    enabled: !!contactId,
  })
}

export function useInteractionsForSite(siteId: string | undefined) {
  return useQuery({
    queryKey: ['interactions', 'site', siteId],
    queryFn: () => fetchInteractionsByColumn('site_id', siteId as string),
    enabled: !!siteId,
  })
}

/** Index de recherche globale : charge TOUT, donc lent — n'appeler qu'à l'ouverture de la
 * recherche, jamais au montage d'un écran. */
export function useInteractions() {
  return useQuery({ queryKey: ['interactions'], queryFn: () => fetchInteractions(null) })
}

/** Liste des interactions : les N plus récentes suffisent à l'écran, et la recherche de la page
 * porte de toute façon sur ce qui est chargé. Évite de tirer les 66 643 lignes de la table. */
export function useInteractionsRecentes(limite = 2000) {
  return useQuery({ queryKey: ['interactions', 'recentes', limite], queryFn: () => fetchInteractions(limite) })
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

      // L'auteur n'était pas renseigné : toute note ajoutée depuis Kimatch arrivait anonyme, et le
      // fil d'activité affichait une phrase sans personne devant. profils.id EST l'identifiant du
      // compte d'authentification, on peut donc l'écrire directement.
      const { data: utilisateur } = await supabase.auth.getUser()
      const auteurId = utilisateur?.user?.id ?? null

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
          ...(auteurId ? { auteur_profil_id: auteurId, proprietaire_id: auteurId } : {}),
          ...(input.type_interaction_id ? { type_interaction_id: input.type_interaction_id } : {}),
          ...(input.issue_interaction_id ? { issue_interaction_id: input.issue_interaction_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        interaction = { ...interaction, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<Interaction[]>(['interactions'], (old) => (old ? [interaction, ...old] : [interaction]))
      return { interaction, persisted }
    },
    /**
     * Sans cette invalidation, une note ajoutée depuis une fiche n'apparaissait qu'après avoir
     * rafraîchi la page.
     *
     * Le `setQueryData` ci-dessus n'écrit que dans la clé `['interactions']` EXACTE, celle de la
     * liste globale. Les fiches, elles, lisent des clés dérivées — `['interactions', 'compte', …]`,
     * `['interactions', 'site', …]`, `['interactions', 'contact', …]` — que cette écriture ne
     * touche pas. Invalider le préfixe les couvre toutes, et c'est déjà ce que font la
     * modification et la suppression : seule la création avait été oubliée.
     */
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['interactions'] }) },
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['interactions'] }) },
  })
}

export function useDeleteInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('interactions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['interactions'] }) },
  })
}
