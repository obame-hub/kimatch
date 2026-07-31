import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/demoMode'
import { mockComptes } from '@/lib/mockData'
import type { Compte, TypeCompte } from '@/types/domain'
import type { EllisphereCompany, EllisphereScore } from '@/lib/data/ellisphere'
import { notifySlack } from '@/lib/data/slackSettings'
import { buildAccountCreatedBlocks } from '@/lib/slackTemplates'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawCompteClient {
  segment_compte_id: string | null
  conseiller_referent_id: string | null
  origine_acquisition: string | null
  mandat_cadre_actif: boolean
  note_interne: string | null
  segment_compte: { libelle: string } | null
  conseiller_referent: { prenom: string; nom: string } | null
}

interface RawCompteFournisseur {
  fournit_electricite: boolean
  fournit_gaz: boolean
  contact_commercial_id: string | null
  statut_partenariat: string
  conditions_commerciales: string | null
  commentaire: string | null
  contact_commercial: { prenom: string; nom: string } | null
}

interface RawComptePartenaire {
  type_partenariat: string | null
  modele_remuneration: string | null
  contact_referent_id: string | null
  statut_partenariat: string
  date_debut_partenariat: string | null
  commentaire: string | null
  contact_referent: { prenom: string; nom: string } | null
}

interface RawCompte extends Compte {
  comptes_clients: RawCompteClient | RawCompteClient[] | null
  comptes_fournisseurs: RawCompteFournisseur | RawCompteFournisseur[] | null
  comptes_partenaires: RawComptePartenaire | RawComptePartenaire[] | null
  proprietaire: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null
}

const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

async function fetchComptes(): Promise<Compte[]> {
  if (isDemoMode()) return mockComptes
  try {
    const data = await fetchAllRows<RawCompte>(
      'comptes',
      `*,
        comptes_clients(segment_compte_id, conseiller_referent_id, origine_acquisition, mandat_cadre_actif, note_interne, segment_compte:segments_comptes(libelle), conseiller_referent:profils(prenom, nom)),
        comptes_fournisseurs(fournit_electricite, fournit_gaz, contact_commercial_id, statut_partenariat, conditions_commerciales, commentaire, contact_commercial:contacts(prenom, nom)),
        comptes_partenaires(type_partenariat, modele_remuneration, contact_referent_id, statut_partenariat, date_debut_partenariat, commentaire, contact_referent:contacts(prenom, nom)),
        proprietaire:profils!comptes_proprietaire_id_fkey(prenom, nom)`,
      (q) => q.order('nom'),
    )

    const comptesVisibles = await fetchComptesVisibles()

    return filterVisibles((data ?? []), comptesVisibles, (c) => c.id).map((c) => {
      const { comptes_clients, comptes_fournisseurs, comptes_partenaires, proprietaire, ...base } = c
      const client = first(comptes_clients)
      const fournisseur = first(comptes_fournisseurs)
      const partenaire = first(comptes_partenaires)
      const owner = first(proprietaire)
      return {
        ...base,
        proprietaire_nom: owner ? `${owner.prenom} ${owner.nom}` : null,
        ...(client
          ? {
              segment_compte_id: client.segment_compte_id,
              segment_compte_libelle: client.segment_compte?.libelle ?? null,
              conseiller_referent_id: client.conseiller_referent_id,
              conseiller_referent_nom: client.conseiller_referent ? `${client.conseiller_referent.prenom} ${client.conseiller_referent.nom}` : null,
              origine_acquisition: client.origine_acquisition,
              mandat_cadre_actif: client.mandat_cadre_actif,
              note_interne: client.note_interne,
            }
          : {}),
        ...(fournisseur
          ? {
              fournit_electricite: fournisseur.fournit_electricite,
              fournit_gaz: fournisseur.fournit_gaz,
              contact_commercial_id: fournisseur.contact_commercial_id,
              contact_commercial_nom: fournisseur.contact_commercial ? `${fournisseur.contact_commercial.prenom} ${fournisseur.contact_commercial.nom}` : null,
              statut_partenariat: fournisseur.statut_partenariat,
              conditions_commerciales: fournisseur.conditions_commerciales,
              commentaire_partenariat: fournisseur.commentaire,
            }
          : {}),
        ...(partenaire
          ? {
              type_partenariat: partenaire.type_partenariat,
              modele_remuneration: partenaire.modele_remuneration,
              contact_referent_id: partenaire.contact_referent_id,
              contact_referent_nom: partenaire.contact_referent ? `${partenaire.contact_referent.prenom} ${partenaire.contact_referent.nom}` : null,
              statut_partenariat: partenaire.statut_partenariat,
              date_debut_partenariat: partenaire.date_debut_partenariat,
              commentaire_partenariat: partenaire.commentaire,
            }
          : {}),
      }
    })
  } catch (error) {
    console.error('fetchComptes', error)
    return []
  }
}

export function useComptes() {
  return useQuery({ queryKey: ['comptes'], queryFn: fetchComptes })
}

interface UpdateScoreInput {
  compteId: string
  score: EllisphereScore
}

interface UpdateScoreResult {
  persisted: boolean
  changed: boolean
}

export function useUpdateCompteScore() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ compteId, score }: UpdateScoreInput): Promise<UpdateScoreResult> => {
      const previous = queryClient
        .getQueryData<Compte[]>(['comptes'])
        ?.find((c) => c.id === compteId)
      const changed = previous?.score_ellipro !== score.score

      let persisted = false
      if (!isDemoMode()) {
        const { error } = await supabase
          .from('comptes')
          .update({
            score_ellipro: score.score,
            score_ellipro_scale: score.scale,
            score_ellipro_maj: new Date().toISOString(),
          })
          .eq('id', compteId)
        persisted = !error
      }

      // On met à jour le cache local dans tous les cas (mode démo, ou si l'écriture
      // Supabase a échoué faute de colonnes existantes côté vraie base).
      queryClient.setQueryData<Compte[]>(['comptes'], (old) =>
        old?.map((c) =>
          c.id === compteId
            ? { ...c, score_ellipro: score.score, score_ellipro_scale: score.scale, score_ellipro_maj: new Date().toISOString() }
            : c,
        ),
      )

      return { persisted, changed }
    },
  })
}

interface CreateCompteInput {
  company: EllisphereCompany
  typeCompte: TypeCompte
  typeCompteId: string | null
}

interface CreateCompteResult {
  compte: Compte
  persisted: boolean
}

export function useCreateCompteFromEllisphere() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ company, typeCompte, typeCompteId }: CreateCompteInput): Promise<CreateCompteResult> => {
      const nom = company.raisonSociale ?? company.nomCommercial ?? 'Entreprise sans nom'
      const base = {
        nom,
        type_compte: typeCompte,
        segment: company.libelleAPE ?? '',
        nb_sites: 0,
        ville: company.ville ?? '',
        siren: company.siren,
        siret: null,
        telephone: null,
        email: null,
        site_web: null,
        score_ellipro: null,
        score_ellipro_scale: null,
        score_ellipro_maj: null,
      }

      let persisted = false
      let compte: Compte = { id: `local-${Date.now()}`, proprietaire_id: null, ...base }

      if (!isDemoMode()) {
        const { data, error } = await supabase
          .from('comptes')
          .insert({
            nom,
            segment: base.segment,
            ville: base.ville,
            siret: company.siret,
            siren: company.siren,
            type_compte: typeCompte,
            ...(typeCompteId ? { type_compte_id: typeCompteId } : {}),
          })
          .select()
          .single()
        if (!error && data) {
          // On fusionne par-dessus la forme locale plutôt que de faire confiance à 100%
          // à la forme réelle retournée (colonnes réelles pas toutes confirmées).
          compte = { ...compte, ...(data as Partial<Compte>), id: (data as { id: string }).id }
          persisted = true
        }
      }

      queryClient.setQueryData<Compte[]>(['comptes'], (old) => (old ? [...old, compte] : [compte]))

      const TYPE_LABELS: Record<TypeCompte, string> = { client: 'Client', fournisseur: 'Fournisseur', partenaire: 'Partenaire', kiwee: 'KiWee' }
      const tpl = buildAccountCreatedBlocks({
        accountName: compte.nom,
        accountUrl: `${window.location.origin}/comptes/${compte.id}`,
        accountType: TYPE_LABELS[typeCompte],
        siren: compte.siren,
        ville: compte.ville,
        segment: compte.segment,
      })
      void notifySlack({ module: 'compte', text: tpl.text, blocks: tpl.blocks })

      return { compte, persisted }
    },
  })
}

interface UpdateResult {
  persisted: boolean
}

function applyLocalUpdate(queryClient: ReturnType<typeof useQueryClient>, compteId: string, patch: Partial<Compte>) {
  queryClient.setQueryData<Compte[]>(['comptes'], (old) => old?.map((c) => (c.id === compteId ? { ...c, ...patch } : c)))
}

interface UpdateCompteClientInput {
  compteId: string
  segment_compte_id: string | null
  segment_compte_libelle: string | null
  conseiller_referent_id: string | null
  conseiller_referent_nom: string | null
  origine_acquisition: string | null
  mandat_cadre_actif: boolean
  note_interne: string | null
  apporteur_partenaire_id: string | null
}

export function useUpdateCompteClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCompteClientInput): Promise<UpdateResult> => {
      let persisted = false
      if (!isDemoMode()) {
        const [{ error: clientError }, { error: compteError }] = await Promise.all([
          supabase.from('comptes_clients').upsert({
            compte_id: input.compteId,
            segment_compte_id: input.segment_compte_id,
            conseiller_referent_id: input.conseiller_referent_id,
            origine_acquisition: input.origine_acquisition,
            mandat_cadre_actif: input.mandat_cadre_actif,
            note_interne: input.note_interne,
          }),
          supabase.from('comptes').update({ apporteur_partenaire_id: input.apporteur_partenaire_id }).eq('id', input.compteId),
        ])
        persisted = !clientError && !compteError
      }
      applyLocalUpdate(queryClient, input.compteId, input)
      return { persisted }
    },
  })
}

interface UpdateCompteFournisseurInput {
  compteId: string
  fournit_electricite: boolean
  fournit_gaz: boolean
  contact_commercial_id: string | null
  contact_commercial_nom: string | null
  statut_partenariat: string
  conditions_commerciales: string | null
  commentaire_partenariat: string | null
  limite_ellipro: number | null
}

export function useUpdateCompteFournisseur() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCompteFournisseurInput): Promise<UpdateResult> => {
      let persisted = false
      if (!isDemoMode()) {
        const [{ error: fournisseurError }, { error: compteError }] = await Promise.all([
          supabase.from('comptes_fournisseurs').upsert({
            compte_id: input.compteId,
            fournit_electricite: input.fournit_electricite,
            fournit_gaz: input.fournit_gaz,
            contact_commercial_id: input.contact_commercial_id,
            statut_partenariat: input.statut_partenariat,
            conditions_commerciales: input.conditions_commerciales,
            commentaire: input.commentaire_partenariat,
          }),
          supabase.from('comptes').update({ limite_ellipro: input.limite_ellipro }).eq('id', input.compteId),
        ])
        persisted = !fournisseurError && !compteError
      }
      applyLocalUpdate(queryClient, input.compteId, input)
      return { persisted }
    },
  })
}

interface UpdateComptePartenaireInput {
  compteId: string
  type_partenariat: string | null
  modele_remuneration: string | null
  contact_referent_id: string | null
  contact_referent_nom: string | null
  statut_partenariat: string
  date_debut_partenariat: string | null
  commentaire_partenariat: string | null
}

export function useUpdateComptePartenaire() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateComptePartenaireInput): Promise<UpdateResult> => {
      let persisted = false
      if (!isDemoMode()) {
        const { error } = await supabase.from('comptes_partenaires').upsert({
          compte_id: input.compteId,
          type_partenariat: input.type_partenariat,
          modele_remuneration: input.modele_remuneration,
          contact_referent_id: input.contact_referent_id,
          statut_partenariat: input.statut_partenariat,
          date_debut_partenariat: input.date_debut_partenariat,
          commentaire: input.commentaire_partenariat,
        })
        persisted = !error
      }
      applyLocalUpdate(queryClient, input.compteId, input)
      return { persisted }
    },
  })
}

export interface UpdateCompteInput {
  id: string
  nom: string
  ville: string
  segment: string
  proprietaire_id: string | null
}

export function useUpdateCompte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCompteInput) => {
      const { error } = await supabase
        .from('comptes')
        .update({
          nom: input.nom,
          ville: input.ville,
          segment: input.segment,
          proprietaire_id: input.proprietaire_id,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comptes'] }),
  })
}

/** Edition inline champ par champ (fiche Compte, handoff design William) -- un PATCH par appel. */
export function useUpdateCompteField() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Compte> }) => {
      const { error } = await supabase.from('comptes').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comptes'] }),
  })
}

export function useDeleteCompte() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comptes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comptes'] }),
  })
}
