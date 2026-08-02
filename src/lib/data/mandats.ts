import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Mandat } from '@/types/domain'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawMandat {
  id: string
  compte_id: string
  date_signature: string | null
  date_envoi: string | null
  date_debut_validite: string | null
  date_fin_validite: string | null
  contact_signataire_id: string | null
  docusign_envelope_id: string | null
  proprietaire_id: string | null
  compte: { nom: string } | null
  statut: { code: string } | null
  contact_signataire: { prenom: string; nom: string } | null
  proprietaire: { prenom: string; nom: string } | null
  date_creation: string
  date_modification: string
}

async function fetchMandats(): Promise<Mandat[]> {
  try {
    const [mandats, compteursRows, courtiersRows] = await Promise.all([
      fetchAllRows<RawMandat>(
        'mandats',
        'id, compte_id, date_signature, date_envoi, date_debut_validite, date_fin_validite, contact_signataire_id, docusign_envelope_id, proprietaire_id, compte:comptes(nom), statut:statuts_mandats(code), contact_signataire:contacts(prenom, nom), proprietaire:profils!mandats_proprietaire_id_fkey(prenom, nom), date_creation, date_modification',
      ),
      fetchAllRows<{ mandat_id: string; compteur: { id: string; site_id: string } | null }>('mandats_compteurs', 'mandat_id, compteur:compteurs(id, site_id)'),
      fetchAllRows<{ mandat_id: string; type_courtier: { code: string } | null }>('mandats_courtiers', 'mandat_id, type_courtier:types_courtiers_mandat(code)'),
    ])

    const compteurIdsParMandat = new Map<string, string[]>()
    const siteIdsParMandat = new Map<string, string[]>()
    for (const mc of compteursRows) {
      if (!mc.compteur) continue
      const compteurList = compteurIdsParMandat.get(mc.mandat_id) ?? []
      compteurList.push(mc.compteur.id)
      compteurIdsParMandat.set(mc.mandat_id, compteurList)

      const siteList = siteIdsParMandat.get(mc.mandat_id) ?? []
      if (!siteList.includes(mc.compteur.site_id)) siteList.push(mc.compteur.site_id)
      siteIdsParMandat.set(mc.mandat_id, siteList)
    }

    const courtierCodesParMandat = new Map<string, string[]>()
    for (const mc of courtiersRows) {
      if (!mc.type_courtier) continue
      const list = courtierCodesParMandat.get(mc.mandat_id) ?? []
      list.push(mc.type_courtier.code)
      courtierCodesParMandat.set(mc.mandat_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles(mandats, comptesVisibles, (m) => m.compte_id).map((m) => ({
      id: m.id,
      compte_id: m.compte_id,
      compte_nom: m.compte?.nom ?? '',
      statut: m.statut?.code ?? '',
      date_signature: m.date_signature,
      date_envoi: m.date_envoi,
      date_debut_validite: m.date_debut_validite,
      date_fin_validite: m.date_fin_validite,
      nb_sites_couverts: (siteIdsParMandat.get(m.id) ?? []).length,
      site_ids: siteIdsParMandat.get(m.id) ?? [],
      compteur_ids: compteurIdsParMandat.get(m.id) ?? [],
      contact_signataire_id: m.contact_signataire_id,
      contact_signataire_nom: m.contact_signataire ? `${m.contact_signataire.prenom} ${m.contact_signataire.nom}` : undefined,
      docusign_envelope_id: m.docusign_envelope_id,
      proprietaire_id: m.proprietaire_id,
      proprietaire_nom: m.proprietaire ? `${m.proprietaire.prenom} ${m.proprietaire.nom}` : null,
      courtier_codes: courtierCodesParMandat.get(m.id) ?? [],
      date_creation: m.date_creation,
      date_modification: m.date_modification,
    }))
  } catch (error) {
    console.error('fetchMandats', error)
    return []
  }
}

export function useMandats() {
  return useQuery({ queryKey: ['mandats'], queryFn: fetchMandats })
}

interface CreateMandatInput {
  compte_id: string
  compte_nom: string
  compteur_ids: string[]
  compteurs: { id: string; site_id: string }[]
  date_signature: string | null
  contact_signataire_id: string | null
  contact_signataire_nom?: string
  courtier_codes: string[]
  courtier_type_ids: string[]
}

interface CreateMandatResult {
  mandat: Mandat
  persisted: boolean
}

export function useCreateMandat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateMandatInput): Promise<CreateMandatResult> => {
      let persisted = false
      const siteIds = [...new Set(input.compteurs.map((c) => c.site_id))]
      let mandat: Mandat = {
        id: `local-${Date.now()}`,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        statut: 'A_PREPARER',
        date_signature: input.date_signature,
        date_envoi: null,
        date_debut_validite: input.date_signature,
        date_fin_validite: null,
        nb_sites_couverts: siteIds.length,
        site_ids: siteIds,
        compteur_ids: input.compteur_ids,
        contact_signataire_id: input.contact_signataire_id,
        contact_signataire_nom: input.contact_signataire_nom,
        proprietaire_id: null,
        courtier_codes: input.courtier_codes,
      }

      const { data, error } = await supabase
        .from('mandats')
        .insert({
          compte_id: input.compte_id,
          date_signature: input.date_signature,
          ...(input.contact_signataire_id ? { contact_signataire_id: input.contact_signataire_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        const mandatId = (data as { id: string }).id
        mandat = { ...mandat, id: mandatId }
        persisted = true
        if (input.compteur_ids.length > 0) {
          await supabase
            .from('mandats_compteurs')
            .insert(input.compteur_ids.map((compteur_id) => ({ mandat_id: mandatId, compteur_id })))
        }
        if (input.courtier_type_ids.length > 0) {
          await supabase
            .from('mandats_courtiers')
            .insert(input.courtier_type_ids.map((type_courtier_id) => ({ mandat_id: mandatId, type_courtier_id })))
        }
      }

      queryClient.setQueryData<Mandat[]>(['mandats'], (old) => (old ? [mandat, ...old] : [mandat]))
      return { mandat, persisted }
    },
  })
}

interface MarkMandatEnvoyeResult {
  persisted: boolean
}

export function useMarkMandatEnvoye() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mandatId, envelopeId, statutId }: { mandatId: string; envelopeId: string; statutId: string | null }): Promise<MarkMandatEnvoyeResult> => {
      const { error } = await supabase
        .from('mandats')
        .update({ docusign_envelope_id: envelopeId, ...(statutId ? { statut_id: statutId } : {}) })
        .eq('id', mandatId)
      const persisted = !error
      queryClient.setQueryData<Mandat[]>(['mandats'], (old) =>
        old?.map((m) => (m.id === mandatId ? { ...m, docusign_envelope_id: envelopeId, statut: 'ENVOYE' } : m)),
      )
      return { persisted }
    },
  })
}

export interface UpdateMandatInput {
  id: string
  date_signature: string | null
  proprietaire_id: string | null
}

export function useUpdateMandat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateMandatInput) => {
      const { error } = await supabase
        .from('mandats')
        .update({ date_signature: input.date_signature, proprietaire_id: input.proprietaire_id })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mandats'] }),
  })
}

export function useDeleteMandat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mandats').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mandats'] }),
  })
}
