import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { mockRecommandations } from '@/lib/mockData'
import type { Recommandation, VersionRecommandation, Optimisation, OffreFournisseur } from '@/types/domain'

interface RawRecommandation {
  id: string
  nom: string
  description: string | null
  priorite: number
  commentaire_interne: string | null
  date_ouverture: string
  proprietaire_id: string | null
  etape: { code: string } | null
  origine: { libelle: string } | null
  responsable: { prenom: string; nom: string } | null
  compte: { id: string; nom: string } | null
}

interface RawVersion {
  id: string
  recommandation_id: string
  nom: string | null
  resume: string | null
  contexte_et_hypotheses: string | null
  gain_estime_annuel: number | null
  economie_estimee_pourcentage: number | null
  niveau_confiance: number | null
  version_actuelle: boolean
  est_figee: boolean
  date_publication: string | null
  date_presentation_client: string | null
  date_decision_client: string | null
  date_creation: string
  statut: { code: string } | null
  motif: { libelle: string } | null
}

interface RawOptimisation {
  id: string
  version_recommandation_id: string
  nom: string | null
  description: string | null
  resultat_attendu: string | null
  gain_estime_annuel: number | null
  cout_estime: number | null
  roi_mois: number | null
  priorite: number | null
  est_retenue: boolean
  type_optimisation: { libelle: string } | null
}

interface RawOffreFournisseur {
  id: string
  optimisation_id: string
  reference_offre: string | null
  nom: string | null
  description: string | null
  statut: string | null
  montant_annuel_ht: number | null
  montant_total_ht: number | null
  economie_annuelle_estimee: number | null
  economie_pourcentage: number | null
  duree_mois: number | null
  est_offre_recommandee: boolean
  compte_fournisseur: { compte: { nom: string } | null } | null
}

async function fetchRecommandations(): Promise<Recommandation[]> {
  if (isDemoMode()) return mockRecommandations

  try {
    const [recosRes, sitesRes, versionsRes, versionsCompteursRes, optimisationsRes, offresRes] = await Promise.all([
      supabase
        .from('recommandations')
        .select(
          'id, nom, description, priorite, commentaire_interne, date_ouverture, proprietaire_id, etape:etapes_recommandation(code), origine:types_origines(libelle), responsable:profils(prenom, nom), compte:comptes(id, nom)',
        )
        .order('date_ouverture', { ascending: false }),
      supabase.from('recommandations_sites').select('recommandation_id, site:sites(id, nom)'),
      supabase
        .from('versions_recommandation')
        .select(
          'id, recommandation_id, nom, resume, contexte_et_hypotheses, gain_estime_annuel, economie_estimee_pourcentage, niveau_confiance, version_actuelle, est_figee, date_publication, date_presentation_client, date_decision_client, date_creation, statut:statuts_versions_recommandation(code), motif:motifs_versions_recommandation(libelle)',
        )
        .order('date_creation'),
      supabase.from('versions_recommandation_compteurs').select('version_recommandation_id, compteur_id'),
      supabase
        .from('optimisations')
        .select(
          'id, version_recommandation_id, nom, description, resultat_attendu, gain_estime_annuel, cout_estime, roi_mois, priorite, est_retenue, type_optimisation:types_optimisations(libelle)',
        )
        .order('ordre'),
      supabase
        .from('offres_fournisseurs')
        .select(
          'id, optimisation_id, reference_offre, nom, description, statut, montant_annuel_ht, montant_total_ht, economie_annuelle_estimee, economie_pourcentage, duree_mois, est_offre_recommandee, compte_fournisseur:comptes_fournisseurs(compte:comptes(nom))',
        ),
    ])

    if (recosRes.error) throw recosRes.error

    const offresParOptimisation = new Map<string, OffreFournisseur[]>()
    for (const o of (offresRes.data ?? []) as unknown as RawOffreFournisseur[]) {
      const list = offresParOptimisation.get(o.optimisation_id) ?? []
      list.push({
        id: o.id,
        fournisseur_nom: o.compte_fournisseur?.compte?.nom ?? '',
        reference_offre: o.reference_offre,
        nom: o.nom,
        description: o.description,
        statut: o.statut,
        montant_annuel_ht: o.montant_annuel_ht,
        montant_total_ht: o.montant_total_ht,
        economie_annuelle_estimee: o.economie_annuelle_estimee,
        economie_pourcentage: o.economie_pourcentage,
        duree_mois: o.duree_mois,
        est_offre_recommandee: o.est_offre_recommandee,
      })
      offresParOptimisation.set(o.optimisation_id, list)
    }

    const optimisationsParVersion = new Map<string, Optimisation[]>()
    for (const opt of (optimisationsRes.data ?? []) as unknown as RawOptimisation[]) {
      const list = optimisationsParVersion.get(opt.version_recommandation_id) ?? []
      list.push({
        id: opt.id,
        nom: opt.nom,
        type_optimisation: opt.type_optimisation?.libelle ?? '',
        description: opt.description,
        resultat_attendu: opt.resultat_attendu,
        gain_estime_annuel: opt.gain_estime_annuel,
        cout_estime: opt.cout_estime,
        roi_mois: opt.roi_mois,
        priorite: opt.priorite,
        est_retenue: opt.est_retenue,
        offres: offresParOptimisation.get(opt.id) ?? [],
      })
      optimisationsParVersion.set(opt.version_recommandation_id, list)
    }

    const sitesParReco = new Map<string, { id: string; nom: string }[]>()
    for (const rs of (sitesRes.data ?? []) as unknown as { recommandation_id: string; site: { id: string; nom: string } | null }[]) {
      if (!rs.site) continue
      const list = sitesParReco.get(rs.recommandation_id) ?? []
      list.push(rs.site)
      sitesParReco.set(rs.recommandation_id, list)
    }

    const compteurIdsParVersion = new Map<string, string[]>()
    for (const vc of (versionsCompteursRes.data ?? []) as unknown as { version_recommandation_id: string; compteur_id: string }[]) {
      const list = compteurIdsParVersion.get(vc.version_recommandation_id) ?? []
      list.push(vc.compteur_id)
      compteurIdsParVersion.set(vc.version_recommandation_id, list)
    }

    const versionsParReco = new Map<string, VersionRecommandation[]>()
    for (const v of (versionsRes.data ?? []) as unknown as RawVersion[]) {
      const list = versionsParReco.get(v.recommandation_id) ?? []
      list.push({
        id: v.id,
        nom: v.nom,
        statut: v.statut?.code ?? '',
        motif_creation: v.motif?.libelle ?? '',
        date_creation: v.date_creation,
        gains_estimes: v.gain_estime_annuel,
        resume: v.resume ?? '',
        contexte_et_hypotheses: v.contexte_et_hypotheses,
        economie_pourcentage: v.economie_estimee_pourcentage,
        niveau_confiance: v.niveau_confiance,
        version_actuelle: v.version_actuelle,
        est_figee: v.est_figee,
        date_publication: v.date_publication,
        date_presentation_client: v.date_presentation_client,
        date_decision_client: v.date_decision_client,
        compteur_ids: compteurIdsParVersion.get(v.id) ?? [],
        optimisations: optimisationsParVersion.get(v.id) ?? [],
      })
      versionsParReco.set(v.recommandation_id, list)
    }

    return ((recosRes.data ?? []) as unknown as RawRecommandation[]).map((r) => ({
      id: r.id,
      titre: r.nom,
      compte_id: r.compte?.id ?? '',
      compte_nom: r.compte?.nom ?? '',
      sites: sitesParReco.get(r.id) ?? [],
      etape: r.etape?.code ?? '',
      conseiller: r.responsable ? `${r.responsable.prenom} ${r.responsable.nom}` : '',
      origine: r.origine?.libelle,
      description: r.description ?? '',
      priorite: r.priorite,
      commentaire_interne: r.commentaire_interne ?? '',
      date_creation: r.date_ouverture,
      versions: versionsParReco.get(r.id) ?? [],
      proprietaire_id: r.proprietaire_id,
    }))
  } catch (error) {
    console.error('fetchRecommandations', error)
    return []
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
        origine: input.origine_libelle,
        description: input.description,
        priorite: input.priorite,
        commentaire_interne: input.commentaire_interne,
        date_creation: now,
        versions: [],
        proprietaire_id: null,
      }

      if (!isDemoMode()) {
        const { data, error } = await supabase
          .from('recommandations')
          .insert({
            nom: input.titre,
            compte_id: input.compte_id,
            description: input.description,
            priorite: input.priorite,
            commentaire_interne: input.commentaire_interne,
            date_ouverture: now,
            ...(input.etape_id ? { etape_id: input.etape_id } : {}),
            ...(input.origine_id ? { origine_id: input.origine_id } : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          const recoId = (data as { id: string }).id
          recommandation = { ...recommandation, id: recoId }
          persisted = true
          await supabase
            .from('recommandations_mandats')
            .insert({ recommandation_id: recoId, mandat_id: input.mandat_id, principal: true })
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

export interface UpdateRecommandationInput {
  id: string
  titre: string
  description: string
  commentaire_interne: string
  priorite: number
}

export function useUpdateRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateRecommandationInput) => {
      const { error } = await supabase
        .from('recommandations')
        .update({
          nom: input.titre,
          description: input.description,
          commentaire_interne: input.commentaire_interne,
          priorite: input.priorite,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}

export function useDeleteRecommandation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recommandations').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommandations'] }),
  })
}
