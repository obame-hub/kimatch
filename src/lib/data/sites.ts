import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { mockSites } from '@/lib/mockData'
import type { Site } from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'

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
}

async function fetchSites(): Promise<Site[]> {
  if (isDemoMode()) return mockSites

  try {
    const [sitesRes, compteursRes, signauxRes] = await Promise.all([
      supabase
        .from('sites')
        .select('id, compte_id, nom, adresse, ville, code_postal, actif, compte:comptes(nom), type_site:types_sites(libelle)')
        .order('nom'),
      supabase.from('compteurs').select('site_id'),
      supabase.from('signaux').select('site_id, statut:statuts_signaux(est_cloture)'),
    ])

    if (sitesRes.error) throw sitesRes.error

    // Colonnes ajoutées ultérieurement (tâche #55) — sélectionnées à part : si elles n'existent
    // pas encore en base, on retombe sur null pour elles sans perdre les vraies données du site.
    const extraParSite = new Map<string, RawSiteExtra>()
    const extraRes = await supabase.from('sites').select('id, latitude, longitude, annee_construction, surface_m2, date_derniere_ag, proprietaire_id')
    if (!extraRes.error) {
      for (const e of (extraRes.data ?? []) as unknown as RawSiteExtra[]) {
        extraParSite.set(e.id, e)
      }
    }

    const compteursParSite = new Map<string, number>()
    for (const c of compteursRes.data ?? []) {
      compteursParSite.set(c.site_id, (compteursParSite.get(c.site_id) ?? 0) + 1)
    }
    const signauxOuvertsParSite = new Map<string, number>()
    for (const s of (signauxRes.data ?? []) as unknown as { site_id: string; statut: { est_cloture: boolean } | null }[]) {
      if (!s.statut?.est_cloture) {
        signauxOuvertsParSite.set(s.site_id, (signauxOuvertsParSite.get(s.site_id) ?? 0) + 1)
      }
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(((sitesRes.data ?? []) as unknown as RawSite[]), comptesVisibles, (s) => s.compte_id).map((s) => {
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
        nb_compteurs: compteursParSite.get(s.id) ?? 0,
        nb_signaux_ouverts: signauxOuvertsParSite.get(s.id) ?? 0,
        statut: s.actif ? 'actif' : 'inactif',
      }
    })
  } catch (error) {
    console.error('fetchSites', error)
    return []
  }
}

export function useSites() {
  return useQuery({ queryKey: ['sites'], queryFn: fetchSites })
}

interface CreateSiteInput {
  nom: string
  compte_id: string
  compte_nom: string
  type_site_id: string | null
  type_site_libelle: string
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
        adresse: '',
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

      if (!isDemoMode()) {
        const { data, error } = await supabase
          .from('sites')
          .insert({
            nom: input.nom,
            compte_id: input.compte_id,
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
      }

      queryClient.setQueryData<Site[]>(['sites'], (old) => (old ? [...old, site] : [site]))
      return { site, persisted }
    },
  })
}

export interface UpdateSiteInput {
  id: string
  nom: string
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
