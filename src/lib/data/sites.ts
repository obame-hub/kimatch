import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Site } from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { toUpperFR } from '@/lib/textFormat'

interface RawSite {
  id: string
  compte_id: string
  nom: string
  adresse: string | null
  ville: string | null
  code_postal: string | null
  actif: boolean
  compte: { nom: string } | null
  type_site: { libelle: string } | null
}

interface RawSiteExtra {
  id: string
  latitude: number | null
  longitude: number | null
  annee_construction: number | null
  surface_m2: number | null
  date_derniere_ag: string | null
  proprietaire_id: string | null
  proprietaire: { prenom: string; nom: string } | null
  date_creation: string | null
  date_modification: string | null
  rue: string | null
  departement_code: string | null
  departement_nom: string | null
}

/**
 * @param compteId Ne charger que les sites de ce compte. Une fiche compte n'a besoin que des
 *   siens ; tirer les 6346 sites pour en afficher sept coûtait plusieurs secondes.
 */
async function fetchSites(compteId?: string): Promise<Site[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const restreindre = (q: any) => (compteId ? q.eq('compte_id', compteId) : q)

  try {
    // Les sites d'abord : quand on filtre par compte, leurs identifiants servent à restreindre
    // aussi les agrégats. Sans cela, afficher les 7 sites d'un compte chargeait quand même les
    // 7884 compteurs et tous les signaux du CRM juste pour en compter quelques-uns par site.
    const sites = await fetchAllRows<RawSite>(
      'sites',
      'id, compte_id, nom, adresse, ville, code_postal, actif, compte:comptes(nom), type_site:types_sites(libelle)',
      (q) => restreindre(q).order('nom'),
    )
    const idsSites = sites.map((s) => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const surCesSites = (q: any) => (compteId ? q.in('site_id', idsSites) : q)

    const [compteursRows, signauxRows] = compteId && idsSites.length === 0
      ? [[], []]
      : await Promise.all([
          fetchAllRows<{ site_id: string }>('compteurs', 'site_id', surCesSites),
          fetchAllRows<{ site_id: string; statut: { est_cloture: boolean } | null }>('signaux', 'site_id, statut:statuts_signaux(est_cloture)', surCesSites),
        ])

    // Colonnes ajoutées ultérieurement (tâche #55) — sélectionnées à part : si elles n'existent
    // pas encore en base, on retombe sur null pour elles sans perdre les vraies données du site.
    const extraParSite = new Map<string, RawSiteExtra>()
    try {
      const extraRows = await fetchAllRows<RawSiteExtra>(
        'sites',
        'id, latitude, longitude, annee_construction, surface_m2, date_derniere_ag, proprietaire_id, proprietaire:profils!sites_proprietaire_id_fkey(prenom, nom), date_creation, date_modification, rue, departement_code, departement_nom',
        restreindre,
      )
      for (const e of extraRows) extraParSite.set(e.id, e)
    } catch {
      // colonnes pas encore presentes -- on garde extraParSite vide, comme avant.
    }

    const compteursParSite = new Map<string, number>()
    for (const c of compteursRows) {
      compteursParSite.set(c.site_id, (compteursParSite.get(c.site_id) ?? 0) + 1)
    }
    const signauxOuvertsParSite = new Map<string, number>()
    for (const s of signauxRows) {
      if (!s.statut?.est_cloture) {
        signauxOuvertsParSite.set(s.site_id, (signauxOuvertsParSite.get(s.site_id) ?? 0) + 1)
      }
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(sites, comptesVisibles, (s) => s.compte_id).map((s) => {
      const extra = extraParSite.get(s.id)
      return {
        id: s.id,
        nom: s.nom,
        compte_id: s.compte_id,
        compte_nom: s.compte?.nom ?? '',
        type_site: s.type_site?.libelle ?? '',
        adresse: s.adresse ?? '',
        ville: s.ville ?? '',
        code_postal: s.code_postal ?? '',
        latitude: extra?.latitude ?? null,
        longitude: extra?.longitude ?? null,
        annee_construction: extra?.annee_construction ?? null,
        surface_m2: extra?.surface_m2 ?? null,
        date_derniere_ag: extra?.date_derniere_ag ?? null,
        proprietaire_id: extra?.proprietaire_id ?? null,
        proprietaire_nom: extra?.proprietaire ? `${extra.proprietaire.prenom} ${extra.proprietaire.nom}` : null,
        rue: extra?.rue ?? null,
        departement_code: extra?.departement_code ?? null,
        departement_nom: extra?.departement_nom ?? null,
        nb_compteurs: compteursParSite.get(s.id) ?? 0,
        nb_signaux_ouverts: signauxOuvertsParSite.get(s.id) ?? 0,
        statut: s.actif ? 'actif' : 'inactif',
        date_creation: extra?.date_creation ?? undefined,
        date_modification: extra?.date_modification ?? undefined,
      }
    })
  } catch (error) {
    console.error('fetchSites', error)
    return []
  }
}

export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: () => fetchSites() })
}

/** Sites d'un seul compte -- pour les fiches de détail. */
export function useSitesParCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['sites', 'compte', compteId],
    queryFn: () => fetchSites(compteId as string),
    enabled: !!compteId,
  })
}

interface CreateSiteInput {
  nom: string
  compte_id: string
  compte_nom: string
  type_site_id: string | null
  type_site_libelle: string
  adresse?: string
  ville: string
  code_postal: string
}

interface CreateSiteResult {
  site: Site
  persisted: boolean
}

export function useCreateSite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSiteInput): Promise<CreateSiteResult> => {
      let persisted = false
      let site: Site = {
        id: `local-${Date.now()}`,
        nom: input.nom,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        type_site: input.type_site_libelle,
        adresse: toUpperFR(input.adresse),
        ville: input.ville,
        code_postal: input.code_postal,
        latitude: null,
        longitude: null,
        annee_construction: null,
        surface_m2: null,
        date_derniere_ag: null,
        proprietaire_id: null,
        nb_compteurs: 0,
        nb_signaux_ouverts: 0,
        statut: 'actif',
      }

      const { data, error } = await supabase
        .from('sites')
        .insert({
          nom: input.nom,
          compte_id: input.compte_id,
          adresse: toUpperFR(input.adresse) || null,
          ville: input.ville,
          code_postal: input.code_postal,
          actif: true,
          ...(input.type_site_id ? { type_site_id: input.type_site_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        site = { ...site, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<Site[]>(['sites'], (old) => (old ? [...old, site] : [site]))
      return { site, persisted }
    },
  })
}

export interface UpdateSiteInput {
  id: string
  nom: string
  adresse: string
  ville: string
  code_postal: string
  type_site_id: string | null
  annee_construction: number | null
  surface_m2: number | null
  date_derniere_ag: string | null
  latitude: number | null
  longitude: number | null
  proprietaire_id: string | null
}

export function useUpdateSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateSiteInput) => {
      const { error } = await supabase
        .from('sites')
        .update({
          nom: input.nom,
          adresse: toUpperFR(input.adresse) || null,
          ville: input.ville,
          code_postal: input.code_postal,
          annee_construction: input.annee_construction,
          surface_m2: input.surface_m2,
          date_derniere_ag: input.date_derniere_ag,
          latitude: input.latitude,
          longitude: input.longitude,
          proprietaire_id: input.proprietaire_id,
          ...(input.type_site_id ? { type_site_id: input.type_site_id } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  })
}

/** Mise à jour partielle -- contrairement à useUpdateSite (qui réécrit toutes les colonnes),
 * ne touche que les champs fournis. À utiliser pour l'édition inline (un champ à la fois). */
export function useUpdateSitePartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Site> }) => {
      const { error } = await supabase.from('sites').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  })
}

export function normalizeTexte(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export type SiteMatch = { kind: 'auto'; site: Site } | { kind: 'ambiguous'; candidates: Site[] } | { kind: 'new' }

/**
 * Détermine si un compteur en cours de création correspond à un site existant du compte
 * (même ville + code postal), à un groupe de sites ambigu à faire trancher par l'utilisateur,
 * ou à aucun site connu (nouveau site à créer).
 */
export function matchSitesPourCompteur(sites: Site[], compteId: string, ville: string, codePostal: string): SiteMatch {
  const sitesDuCompte = sites.filter((s) => s.compte_id === compteId)
  const villeN = normalizeTexte(ville)
  const cpN = codePostal.trim()

  if (!villeN && !cpN) {
    return sitesDuCompte.length > 0 ? { kind: 'ambiguous', candidates: sitesDuCompte } : { kind: 'new' }
  }

  const exact = sitesDuCompte.filter((s) => normalizeTexte(s.ville) === villeN && s.code_postal.trim() === cpN)
  if (exact.length === 1) return { kind: 'auto', site: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact }

  const partiel = sitesDuCompte.filter((s) => (cpN && s.code_postal.trim() === cpN) || (villeN && normalizeTexte(s.ville) === villeN))
  if (partiel.length > 0) return { kind: 'ambiguous', candidates: partiel }

  return { kind: 'new' }
}

export function useDeleteSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sites').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sites'] }),
  })
}
