import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { mockContrats } from '@/lib/mockData'
import type { Contrat } from '@/types/domain'
import { notifySlack } from '@/lib/data/slackSettings'
import { buildContratCreatedBlocks } from '@/lib/slackTemplates'
import { fetchComptesVisibles, fetchSitesVisiblesIds, filterVisibles } from '@/lib/data/visibility'

interface RawContrat {
  id: string
  site_id: string
  fournisseur_compte_id: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  preavis_resiliation_jours: number | null
  proprietaire_id: string | null
  docusign_envelope_id: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  statut_signature: string | null
  contact_signataire_id: string | null
  site: { nom: string } | null
  fournisseur: { nom: string } | null
  type_energie: { code: string } | null
  statut: { code: string } | null
  contact_signataire: { prenom: string; nom: string } | null
}

async function fetchContrats(): Promise<Contrat[]> {
  if (isDemoMode()) return mockContrats
  try {
    const [contratsRes, compteursRes] = await Promise.all([
      supabase
        .from('contrats')
        .select(
          'id, site_id, fournisseur_compte_id, reference_fournisseur, date_debut, date_fin, preavis_resiliation_jours, proprietaire_id, docusign_envelope_id, date_envoi_signature, date_signature, statut_signature, contact_signataire_id, site:sites(nom), fournisseur:comptes(nom), type_energie:types_energies(code), statut:statuts_contrats(code), contact_signataire:contacts(prenom, nom)',
        )
        .order('date_debut', { ascending: false }),
      supabase.from('contrats_compteurs').select('id, contrat_id, compteur:compteurs(id, numero_point, libelle)'),
    ])
    if (contratsRes.error) throw contratsRes.error

    const compteursParContrat = new Map<string, { id: string; contrat_compteur_id: string | null; numero_pdl: string; utilisation: string }[]>()
    for (const cc of (compteursRes.data ?? []) as unknown as { id: string; contrat_id: string; compteur: { id: string; numero_point: string; libelle: string | null } | null }[]) {
      if (!cc.compteur) continue
      const list = compteursParContrat.get(cc.contrat_id) ?? []
      list.push({ id: cc.compteur.id, contrat_compteur_id: cc.id, numero_pdl: cc.compteur.numero_point, utilisation: cc.compteur.libelle ?? '' })
      compteursParContrat.set(cc.contrat_id, list)
    }

    const comptesVisibles = await fetchComptesVisibles()
    const sitesVisibles = await fetchSitesVisiblesIds(comptesVisibles)

    return filterVisibles(((contratsRes.data ?? []) as unknown as RawContrat[]), sitesVisibles, (c) => c.site_id).map((c) => ({
      id: c.id,
      site_id: c.site_id,
      site_nom: c.site?.nom ?? '',
      fournisseur_compte_id: c.fournisseur_compte_id,
      fournisseur_nom: c.fournisseur?.nom ?? '',
      type_energie: (c.type_energie?.code?.toLowerCase() ?? 'electricite') as 'electricite' | 'gaz',
      reference_fournisseur: c.reference_fournisseur,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
      preavis_resiliation_jours: c.preavis_resiliation_jours,
      statut: c.statut?.code ?? '',
      compteurs: compteursParContrat.get(c.id) ?? [],
      proprietaire_id: c.proprietaire_id ?? null,
      contact_signataire_id: c.contact_signataire_id,
      contact_signataire_nom: c.contact_signataire ? `${c.contact_signataire.prenom} ${c.contact_signataire.nom}` : undefined,
      docusign_envelope_id: c.docusign_envelope_id,
      date_envoi_signature: c.date_envoi_signature,
      date_signature: c.date_signature,
      statut_signature: c.statut_signature,
    }))
  } catch (error) {
    console.error('fetchContrats', error)
    return []
  }
}

export function useContrats() {
  return useQuery({ queryKey: ['contrats'], queryFn: fetchContrats })
}

interface CreateContratInput {
  site_id: string
  site_nom: string
  fournisseur_compte_id: string | null
  fournisseur_nom: string
  type_energie_id: string | null
  type_energie: 'electricite' | 'gaz'
  statut_id: string | null
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  compteur_ids: string[]
  compteurs: { id: string; numero_pdl: string; utilisation: string }[]
  contact_signataire_id: string | null
  contact_signataire_nom?: string
}

type CreateContratLocalCompteur = { id: string; contrat_compteur_id: string | null; numero_pdl: string; utilisation: string }

interface CreateContratResult {
  contrat: Contrat
  persisted: boolean
}

export function useCreateContrat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateContratInput): Promise<CreateContratResult> => {
      let persisted = false
      let contrat: Contrat = {
        id: `local-${Date.now()}`,
        site_id: input.site_id,
        site_nom: input.site_nom,
        fournisseur_compte_id: input.fournisseur_compte_id,
        fournisseur_nom: input.fournisseur_nom,
        type_energie: input.type_energie,
        reference_fournisseur: input.reference_fournisseur,
        date_debut: input.date_debut,
        date_fin: input.date_fin,
        preavis_resiliation_jours: null,
        statut: 'ACTIF',
        compteurs: input.compteurs.map((c): CreateContratLocalCompteur => ({ ...c, contrat_compteur_id: null })),
        proprietaire_id: null,
        contact_signataire_id: input.contact_signataire_id,
        contact_signataire_nom: input.contact_signataire_nom,
        docusign_envelope_id: null,
        date_envoi_signature: null,
        date_signature: null,
        statut_signature: null,
      }

      if (!isDemoMode()) {
        const { data, error } = await supabase
          .from('contrats')
          .insert({
            site_id: input.site_id,
            fournisseur_compte_id: input.fournisseur_compte_id,
            reference_fournisseur: input.reference_fournisseur,
            date_debut: input.date_debut,
            date_fin: input.date_fin,
            ...(input.type_energie_id ? { type_energie_id: input.type_energie_id } : {}),
            ...(input.statut_id ? { statut_id: input.statut_id } : {}),
            ...(input.contact_signataire_id ? { contact_signataire_id: input.contact_signataire_id } : {}),
          })
          .select('id')
          .single()
        if (!error && data) {
          const contratId = (data as { id: string }).id
          contrat = { ...contrat, id: contratId }
          persisted = true
          if (input.compteur_ids.length > 0) {
            await supabase
              .from('contrats_compteurs')
              .insert(input.compteur_ids.map((compteur_id) => ({ contrat_id: contratId, compteur_id })))
          }
        }
      }

      queryClient.setQueryData<Contrat[]>(['contrats'], (old) => (old ? [contrat, ...old] : [contrat]))

      const tpl = buildContratCreatedBlocks({
        siteName: contrat.site_nom,
        siteUrl: `${window.location.origin}/sites/${contrat.site_id}`,
        fournisseurName: contrat.fournisseur_nom,
        energyType: contrat.type_energie,
        dateDebut: contrat.date_debut,
        dateFin: contrat.date_fin,
        compteurs: contrat.compteurs.map((c) => ({ label: c.utilisation, numeroPdl: c.numero_pdl })),
        contratUrl: `${window.location.origin}/contrats/${contrat.id}`,
      })
      void notifySlack({ module: 'contrat', text: tpl.text, blocks: tpl.blocks })

      return { contrat, persisted }
    },
  })
}

export interface UpdateContratInput {
  id: string
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  proprietaire_id: string | null
  contact_signataire_id?: string | null
  docusign_envelope_id?: string | null
  date_envoi_signature?: string | null
  date_signature?: string | null
  statut_signature?: string | null
}

export function useUpdateContrat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateContratInput) => {
      const { error } = await supabase
        .from('contrats')
        .update({
          reference_fournisseur: input.reference_fournisseur,
          date_debut: input.date_debut,
          date_fin: input.date_fin,
          proprietaire_id: input.proprietaire_id,
          ...(input.contact_signataire_id !== undefined ? { contact_signataire_id: input.contact_signataire_id } : {}),
          ...(input.docusign_envelope_id !== undefined ? { docusign_envelope_id: input.docusign_envelope_id } : {}),
          ...(input.date_envoi_signature !== undefined ? { date_envoi_signature: input.date_envoi_signature } : {}),
          ...(input.date_signature !== undefined ? { date_signature: input.date_signature } : {}),
          ...(input.statut_signature !== undefined ? { statut_signature: input.statut_signature } : {}),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contrats'] }),
  })
}

export function useDeleteContrat() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contrats').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contrats'] }),
  })
}
