import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type TypeDemandeSupport = 'bug' | 'evolution'
export type StatutDemandeSupport = 'NOUVELLE' | 'EN_COURS' | 'RESOLUE' | 'REJETEE'

export interface DemandeSupport {
  id: string
  type: TypeDemandeSupport
  titre: string
  description: string | null
  statut: StatutDemandeSupport
  auteur_id: string | null
  auteur_nom: string | null
  date_creation: string
}

async function fetchDemandesSupport(): Promise<DemandeSupport[]> {
  const { data, error } = await supabase
    .from('demandes_support')
    .select('id, type, titre, description, statut, auteur_id, auteur_nom, date_creation')
    .order('date_creation', { ascending: false })
  if (error || !data) return []
  return data as unknown as DemandeSupport[]
}

export function useDemandesSupport() {
  return useQuery({ queryKey: ['demandes-support'], queryFn: fetchDemandesSupport })
}

export function useCreateDemandeSupport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      type,
      titre,
      description,
      auteurId,
      auteurNom,
    }: {
      type: TypeDemandeSupport
      titre: string
      description: string
      auteurId: string | null
      auteurNom: string
    }) => {
      const demande: DemandeSupport = {
        id: `local-${Date.now()}`,
        type,
        titre: titre.trim(),
        description: description.trim() || null,
        statut: 'NOUVELLE',
        auteur_id: auteurId,
        auteur_nom: auteurNom,
        date_creation: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from('demandes_support')
        .insert({
          type: demande.type,
          titre: demande.titre,
          description: demande.description,
          auteur_id: demande.auteur_id,
          auteur_nom: demande.auteur_nom,
        })
        .select('id, date_creation')
        .single()
      if (!error && data) {
        demande.id = (data as { id: string }).id
        demande.date_creation = (data as { date_creation: string }).date_creation
      }

      queryClient.setQueryData<DemandeSupport[]>(['demandes-support'], (old) => (old ? [demande, ...old] : [demande]))

      // Dépôt dans Pilot, en effet de bord et SANS BLOQUER (décision de Naoëlle le 16/08/2026).
      // La demande est déjà enregistrée dans Kimatch à ce stade : si Pilot est indisponible, le
      // signalement de l'utilisateur ne doit pas être perdu pour autant. On note l'échec et on
      // rend la main.
      //
      // Rejouable sans risque : Pilot est idempotent sur `source_id`, auquel on passe
      // l'identifiant de la demande. Un second dépôt rend 200 « déjà connue » au lieu de créer
      // un doublon dans le suivi de projet de l'équipe.
      void deposerDansPilot(demande).catch(() => {})

      return demande
    },
  })
}

/**
 * Envoie la demande à Pilot via notre fonction serveur (la clé d'API n'existe que là).
 *
 * Volontairement silencieux côté utilisateur : il vient de signaler un bug, lui afficher une
 * seconde erreur au sujet d'un outil interne qu'il ne connaît pas n'a aucun sens. La trace part
 * dans la console pour que l'échec reste diagnosticable.
 */
async function deposerDansPilot(demande: DemandeSupport): Promise<void> {
  const { data: session } = await supabase.auth.getSession()
  const jeton = session.session?.access_token
  if (!jeton) return

  const reponse = await fetch('/api/pilot/intake', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      demandeId: demande.id,
      type: demande.type,
      titre: demande.titre,
      description: demande.description,
      auteurNom: demande.auteur_nom,
      auteurEmail: session.session?.user?.email ?? null,
    }),
  })

  if (!reponse.ok) {
    const detail = await reponse.json().catch(() => ({}))
    console.error('Dépôt Pilot échoué (la demande reste enregistrée dans Kimatch)', detail)
  }
}

export function useUpdateStatutDemandeSupport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: StatutDemandeSupport }) => {
      const { error } = await supabase.from('demandes_support').update({ statut }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['demandes-support'] }) },
  })
}
