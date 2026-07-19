import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockRecommandations } from '@/lib/mockData'
import type { Recommandation, VersionRecommandation } from '@/types/domain'

interface RawRecommandation {
  id: string
  titre: string
  description: string | null
  priorite: number
  commentaire_interne: string | null
  date_ouverture: string
  etape: { code: string } | null
  objectif: { libelle: string } | null
  origine: { libelle: string } | null
  responsable: { prenom: string; nom: string } | null
  mandat: { compte: { id: string; nom: string } | null } | null
}

interface RawVersion {
  id: string
  recommandation_id: string
  numero_version: number
  resume: string | null
  contenu: string | null
  gain_estime_annuel: number | null
  economie_estimee_pourcentage: number | null
  niveau_confiance: number | null
  date_validite_offres: string | null
  document_url: string | null
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
          'id, titre, description, priorite, commentaire_interne, date_ouverture, etape:etapes_recommandation(code), objectif:types_objectifs(libelle), origine:types_origines(libelle), responsable:profils(prenom, nom), mandat:mandats(compte:comptes(id, nom))',
        )
        .order('date_ouverture', { ascending: false }),
      supabase.from('recommandations_sites').select('recommandation_id, site:sites(id, nom)'),
      supabase
        .from('versions_recommandation')
        .select(
          'id, recommandation_id, numero_version, resume, contenu, gain_estime_annuel, economie_estimee_pourcentage, niveau_confiance, date_validite_offres, document_url, date_creation, statut:statuts_versions_recommandation(code), motif:motifs_versions_recommandation(libelle)',
        )
        .order('numero_version'),
    ])

    if (recosRes.error || !recosRes.data || recosRes.data.length === 0) throw recosRes.error ?? new Error('empty')

    const sitesParReco = new Map<string, { id: string; nom: string }[]>()
    for (const rs of (sitesRes.data ?? []) as unknown as { recommandation_id: string; site: { id: string; nom: string } | null }[]) {
      if (!rs.site) continue
      const list = sitesParReco.get(rs.recommandation_id) ?? []
      list.push(rs.site)
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
        contenu: v.contenu,
        economie_pourcentage: v.economie_estimee_pourcentage,
        niveau_confiance: v.niveau_confiance,
        date_validite_offres: v.date_validite_offres,
        document_url: v.document_url,
      })
      versionsParReco.set(v.recommandation_id, list)
    }

    return (recosRes.data as unknown as RawRecommandation[]).map((r) => ({
      id: r.id,
      titre: r.titre,
      compte_id: r.mandat?.compte?.id ?? '',
      compte_nom: r.mandat?.compte?.nom ?? '',
      sites: sitesParReco.get(r.id) ?? [],
      etape: r.etape?.code ?? '',
      conseiller: r.responsable ? `${r.responsable.prenom} ${r.responsable.nom}` : '',
      objectif: r.objectif?.libelle ?? '',
      origine: r.origine?.libelle,
      description: r.description ?? '',
      priorite: r.priorite,
      commentaire_interne: r.commentaire_interne ?? '',
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

interface CreateRecommandationInput {
  titre: string
  mandat_id: string
  compte_id: string
  compte_nom: string
  sites: { id: string; nom: string }[]
  etape_id: string | null
  objectif_id: string | null
  objectif_libelle: string
  origine_id: string | null
  origine_libelle?: string
  priorite: number
  description: string
  commentaire_interne: string
}

interface CreateRecommandationResult {
  recommandation: Recommandation
  persisted: boolean
}

export function useCreateRecommandation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateRecommandationInput): Promise<CreateRecommandationResult> => {
      const now = new Date().toISOString()
      let persisted = false
      let recommandation: Recommandation = {
        id: `local-${Date.now()}`,
        titre: input.titre,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        sites: input.sites,
        etape: 'A_PREPARER',
        conseiller: '',
        objectif: input.objectif_libelle,
        origine: input.origine_libelle,
        description: input.description,
        priorite: input.priorite,
        commentaire_interne: input.commentaire_interne,
        date_creation: now,
        versions: [],
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('recommandations')
          .insert({
            titre: input.titre,
            mandat_id: input.mandat_id,
            description: input.description,
            priorite: input.priorite,
            commentaire_interne: input.commentaire_interne,
            date_ouverture: now,
            ...(input.objectif_id ? { objectif_id: input.objectif_id } : {}),
            ...(input.etape_id ? { etape_id: input.etape_id } : {}),
            ...(input.origine_id ? { origine_id: input.origine_id } : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          const recoId = (data as { id: string }).id
          recommandation = { ...recommandation, id: recoId }
          persisted = true
          if (input.sites.length > 0) {
            await supabase
              .from('recommandations_sites')
              .insert(input.sites.map((s) => ({ recommandation_id: recoId, site_id: s.id })))
          }
        }
      }

      queryClient.setQueryData<Recommandation[]>(['recommandations'], (old) =>
        old ? [recommandation, ...old] : [recommandation],
      )
      return { recommandation, persisted }
    },
  })
}
