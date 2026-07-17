import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockComptes } from '@/lib/mockData'
import type { Compte, TypeCompte } from '@/types/domain'
import type { EllisphereCompany, EllisphereScore } from '@/lib/data/ellisphere'

async function fetchComptes(): Promise<Compte[]> {
  if (!isSupabaseConfigured) return mockComptes
  try {
    const { data, error } = await supabase.from('comptes').select('*').order('nom')
    if (error || !data || data.length === 0) throw error ?? new Error('empty')
    return data as unknown as Compte[]
  } catch {
    return mockComptes
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
      if (isSupabaseConfigured) {
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
}

interface CreateCompteResult {
  compte: Compte
  persisted: boolean
}

export function useCreateCompteFromEllisphere() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ company, typeCompte }: CreateCompteInput): Promise<CreateCompteResult> => {
      const nom = company.raisonSociale ?? company.nomCommercial ?? 'Entreprise sans nom'
      const base = {
        nom,
        type_compte: typeCompte,
        segment: company.libelleAPE ?? '',
        nb_sites: 0,
        ville: company.ville ?? '',
        siren: company.siren,
        score_ellipro: null,
        score_ellipro_scale: null,
        score_ellipro_maj: null,
      }

      let persisted = false
      let compte: Compte = { id: `local-${Date.now()}`, ...base }

      if (isSupabaseConfigured) {
        // La vraie table `comptes` a un champ `siret` (pas `siren`) et un `type_compte_id`
        // en FK vers des sous-tables par type — schéma pas encore confirmé assez pour viser
        // juste à tous les coups. On tente un insert plausible ; en cas d'échec de schéma,
        // on retombe sur une création locale (cache) sans bloquer l'utilisatrice.
        const { data, error } = await supabase
          .from('comptes')
          .insert({ nom, segment: base.segment, ville: base.ville, siret: company.siret })
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

      return { compte, persisted }
    },
  })
}
