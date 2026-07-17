import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockSites } from '@/lib/mockData'
import type { Site } from '@/types/domain'

interface RawSite {
  id: string
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
        .select('id, nom, ville, code_postal, actif, compte:comptes(nom), type_site:types_sites(libelle)')
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
