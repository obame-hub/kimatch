import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockRecommandations } from '@/lib/mockData'
import type { Recommandation, VersionRecommandation } from '@/types/domain'

interface RawRecommandation {
  id: string
  titre: string
  date_ouverture: string
  etape: { code: string } | null
  objectif: { libelle: string } | null
  responsable: { prenom: string; nom: string } | null
  mandat: { compte: { nom: string } | null } | null
}

interface RawVersion {
  id: string
  recommandation_id: string
  numero_version: number
  resume: string | null
  gain_estime_annuel: number | null
  date_creation: string
  statut: { code: string } | null
  motif: { libelle: string } | null
}

async function fetchRecommandations(): Promise<Recommandation[]> {
  if (!isSupabaseConfigured) return mockRecommandations

  try {
    const [recosRes, sitesRes, versionsRes] = await Promise.all([
      supabase
        .from('recommandations')
        .select(
          'id, titre, date_ouverture, etape:etapes_recommandation(code), objectif:types_objectifs(libelle), responsable:profils(prenom, nom), mandat:mandats(compte:comptes(nom))',
        )
        .order('date_ouverture', { ascending: false }),
      supabase.from('recommandations_sites').select('recommandation_id, site:sites(nom)'),
      supabase
        .from('versions_recommandation')
        .select(
          'id, recommandation_id, numero_version, resume, gain_estime_annuel, date_creation, statut:statuts_versions_recommandation(code), motif:motifs_versions_recommandation(libelle)',
        )
        .order('numero_version'),
    ])

    if (recosRes.error || !recosRes.data || recosRes.data.length === 0) throw recosRes.error ?? new Error('empty')

    const sitesParReco = new Map<string, string[]>()
    for (const rs of (sitesRes.data ?? []) as unknown as { recommandation_id: string; site: { nom: string } | null }[]) {
      if (!rs.site) continue
      const list = sitesParReco.get(rs.recommandation_id) ?? []
      list.push(rs.site.nom)
      sitesParReco.set(rs.recommandation_id, list)
    }

    const versionsParReco = new Map<string, VersionRecommandation[]>()
    for (const v of (versionsRes.data ?? []) as unknown as RawVersion[]) {
      const list = versionsParReco.get(v.recommandation_id) ?? []
      list.push({
        id: v.id,
        numero: v.numero_version,
        statut: v.statut?.code ?? '',
        motif_creation: v.motif?.libelle ?? '',
        date_creation: v.date_creation,
        gains_estimes: v.gain_estime_annuel,
        resume: v.resume ?? '',
      })
      versionsParReco.set(v.recommandation_id, list)
    }

    return (recosRes.data as unknown as RawRecommandation[]).map((r) => ({
      id: r.id,
      titre: r.titre,
      compte_nom: r.mandat?.compte?.nom ?? '',
      sites: sitesParReco.get(r.id) ?? [],
      etape: r.etape?.code ?? '',
      conseiller: r.responsable ? `${r.responsable.prenom} ${r.responsable.nom}` : '',
      objectif: r.objectif?.libelle ?? '',
      date_creation: r.date_ouverture,
      versions: versionsParReco.get(r.id) ?? [],
    }))
  } catch {
    return mockRecommandations
  }
}

export function useRecommandations() {
  return useQuery({ queryKey: ['recommandations'], queryFn: fetchRecommandations })
}
