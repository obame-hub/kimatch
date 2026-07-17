import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockSites } from '@/lib/mockData'
import type { Site } from '@/types/domain'

interface RawSite {
  id: string
  compte_id: string
  nom: string
  ville: string | null
  code_postal: string | null
  actif: boolean
  compte: { nom: string } | null
  type_site: { libelle: string } | null
}

async function fetchSites(): Promise<Site[]> {
  if (!isSupabaseConfigured) return mockSites

  try {
    const [sitesRes, compteursRes, signauxRes] = await Promise.all([
      supabase
        .from('sites')
        .select('id, compte_id, nom, ville, code_postal, actif, compte:comptes(nom), type_site:types_sites(libelle)')
        .order('nom'),
      supabase.from('compteurs').select('site_id'),
      supabase.from('signaux').select('site_id, statut:statuts_signaux(est_cloture)'),
    ])

    if (sitesRes.error || !sitesRes.data || sitesRes.data.length === 0) throw sitesRes.error ?? new Error('empty')

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

    return (sitesRes.data as unknown as RawSite[]).map((s) => ({
      id: s.id,
      nom: s.nom,
      compte_id: s.compte_id,
      compte_nom: s.compte?.nom ?? '',
      type_site: s.type_site?.libelle ?? '',
      ville: s.ville ?? '',
      code_postal: s.code_postal ?? '',
      nb_compteurs: compteursParSite.get(s.id) ?? 0,
      nb_signaux_ouverts: signauxOuvertsParSite.get(s.id) ?? 0,
      statut: s.actif ? 'actif' : 'inactif',
    }))
  } catch {
    // Table vide (projet Supabase neuf) ou schéma pas encore confirmé — on retombe sur la démo.
    return mockSites
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
        ville: input.ville,
        code_postal: input.code_postal,
        nb_compteurs: 0,
        nb_signaux_ouverts: 0,
        statut: 'actif',
      }

      if (isSupabaseConfigured) {
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
