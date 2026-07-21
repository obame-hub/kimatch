import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockMandats } from '@/lib/mockData'
import type { Mandat } from '@/types/domain'

interface RawMandat {
  id: string
  compte_id: string
  date_signature: string | null
  contact_signataire_id: string | null
  docusign_envelope_id: string | null
  compte: { nom: string } | null
  statut: { code: string } | null
  contact_signataire: { prenom: string; nom: string } | null
}

async function fetchMandats(): Promise<Mandat[]> {
  if (!isSupabaseConfigured) return mockMandats
  try {
    const [mandatsRes, sitesRes] = await Promise.all([
      supabase
        .from('mandats')
        .select(
          'id, compte_id, date_signature, contact_signataire_id, docusign_envelope_id, compte:comptes(nom), statut:statuts_mandats(code), contact_signataire:contacts(prenom, nom)',
        ),
      supabase.from('mandats_sites').select('mandat_id, site_id'),
    ])
    if (mandatsRes.error) throw mandatsRes.error

    const sitesParMandat = new Map<string, string[]>()
    for (const ms of (sitesRes.data ?? []) as unknown as { mandat_id: string; site_id: string }[]) {
      const list = sitesParMandat.get(ms.mandat_id) ?? []
      list.push(ms.site_id)
      sitesParMandat.set(ms.mandat_id, list)
    }

    return ((mandatsRes.data ?? []) as unknown as RawMandat[]).map((m) => ({
      id: m.id,
      compte_id: m.compte_id,
      compte_nom: m.compte?.nom ?? '',
      statut: m.statut?.code ?? '',
      date_signature: m.date_signature,
      nb_sites_couverts: (sitesParMandat.get(m.id) ?? []).length,
      site_ids: sitesParMandat.get(m.id) ?? [],
      contact_signataire_id: m.contact_signataire_id,
      contact_signataire_nom: m.contact_signataire ? `${m.contact_signataire.prenom} ${m.contact_signataire.nom}` : undefined,
      docusign_envelope_id: m.docusign_envelope_id,
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
  site_ids: string[]
  date_signature: string | null
  contact_signataire_id: string | null
  contact_signataire_nom?: string
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
      let mandat: Mandat = {
        id: `local-${Date.now()}`,
        compte_id: input.compte_id,
        compte_nom: input.compte_nom,
        statut: 'A_PREPARER',
        date_signature: input.date_signature,
        nb_sites_couverts: input.site_ids.length,
        site_ids: input.site_ids,
        contact_signataire_id: input.contact_signataire_id,
        contact_signataire_nom: input.contact_signataire_nom,
      }

      if (isSupabaseConfigured) {
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
          if (input.site_ids.length > 0) {
            await supabase
              .from('mandats_sites')
              .insert(input.site_ids.map((site_id) => ({ mandat_id: mandatId, site_id })))
          }
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
      let persisted = false
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('mandats')
          .update({ docusign_envelope_id: envelopeId, ...(statutId ? { statut_id: statutId } : {}) })
          .eq('id', mandatId)
        persisted = !error
      }
      queryClient.setQueryData<Mandat[]>(['mandats'], (old) =>
        old?.map((m) => (m.id === mandatId ? { ...m, docusign_envelope_id: envelopeId, statut: 'ENVOYE' } : m)),
      )
      return { persisted }
    },
  })
}
