import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'
import type { Requete } from '@/types/domain'

/**
 * La REQUÊTE : « un autre objet actif mais parallèle à la chaîne commerciale ».
 *
 * Mémo de Michel, 23/08/2026 : « Elle sert à traiter et résoudre un problème ou une demande :
 * facturation, contrat, compteur, fournisseur, document, réclamation, etc. Sa logique est :
 * Requête → Traitement → Résolution. »
 *
 * PARALLÈLE, ET C'EST LE POINT. Une requête ne fait pas avancer une affaire : elle débloque un
 * client. La confondre avec une opportunité ferait entrer des réclamations dans un entonnoir
 * commercial, où elles n'ont rien à faire.
 *
 * PAS DE MAQUETTE pour cet écran : ce qui suit s'en tient au mémo.
 */

/** Les sujets, tels que Michel les énumère. */
export const CATEGORIES_REQUETE = [
  { code: 'FACTURATION', libelle: 'Facturation' },
  { code: 'CONTRAT', libelle: 'Contrat' },
  { code: 'COMPTEUR', libelle: 'Compteur' },
  { code: 'FOURNISSEUR', libelle: 'Fournisseur' },
  { code: 'DOCUMENT', libelle: 'Document' },
  { code: 'RECLAMATION', libelle: 'Réclamation' },
  { code: 'AUTRE', libelle: 'Autre' },
] as const

interface RawRequete {
  id: string
  reference: string | null
  categorie: string | null
  objet: string | null
  description: string | null
  resolution: string | null
  compte_id: string | null
  contact_id: string | null
  site_id: string | null
  compteur_id: string | null
  contrat_id: string | null
  date_echeance: string | null
  date_resolution: string | null
  proprietaire_id: string | null
  date_creation: string
  statut: { code: string; libelle: string } | null
  compte: { nom: string } | null
}

export function useRequetes() {
  return useQuery({
    queryKey: ['requetes'],
    queryFn: async (): Promise<Requete[]> => {
      try {
        const lignes = await fetchAllRows<RawRequete>(
          'requetes',
          '*, statut:statuts_requetes(code, libelle), compte:comptes(nom)',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q: any) => q.order('date_creation', { ascending: false }),
        )
        const comptesVisibles = await fetchComptesVisibles()
        // Une requête sans compte reste visible : une réclamation peut arriver avant qu'on sache
        // à qui elle se rattache.
        return filterVisibles(lignes, comptesVisibles, (r) => r.compte_id ?? '').map((r) => ({
          id: r.id,
          reference: r.reference,
          categorie: r.categorie,
          objet: r.objet,
          description: r.description,
          resolution: r.resolution,
          compte_id: r.compte_id,
          compte_nom: r.compte?.nom ?? '',
          contact_id: r.contact_id,
          site_id: r.site_id,
          compteur_id: r.compteur_id,
          contrat_id: r.contrat_id,
          statut: r.statut?.code ?? 'NOUVELLE',
          statut_libelle: r.statut?.libelle ?? 'Nouvelle',
          date_echeance: r.date_echeance,
          date_resolution: r.date_resolution,
          proprietaire_id: r.proprietaire_id,
          date_creation: r.date_creation,
        }))
      } catch (error) {
        console.error('useRequetes', error)
        return []
      }
    },
  })
}

export function useStatutsRequetes() {
  return useQuery({
    queryKey: ['statuts_requetes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuts_requetes')
        .select('id, code, libelle, ordre, est_cloture')
        .order('ordre')
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; code: string; libelle: string; ordre: number; est_cloture: boolean }[]
    },
  })
}

export function useCreerRequete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      categorie: string | null
      objet: string | null
      description: string | null
      compte_id: string | null
      statut_id: string | null
      date_echeance: string | null
    }) => {
      const { data, error } = await supabase.from('requetes').insert({
        categorie: input.categorie,
        objet: input.objet,
        description: input.description,
        compte_id: input.compte_id,
        date_echeance: input.date_echeance,
        ...(input.statut_id ? { statut_id: input.statut_id } : {}),
      }).select('id').single()
      if (error) throw new Error(messageDErreur(error.message))
      return (data as { id: string }).id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['requetes'] }) },
  })
}

export type PatchRequete = Partial<{
  categorie: string | null
  objet: string | null
  description: string | null
  resolution: string | null
  compte_id: string | null
  statut_id: string | null
  date_echeance: string | null
  date_resolution: string | null
}>

export function useMajRequete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchRequete }) => {
      const { error } = await supabase
        .from('requetes')
        .update({ ...patch, date_modification: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(messageDErreur(error.message))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['requetes'] }) },
  })
}

function messageDErreur(brut: string): string {
  if (/relation .* does not exist|42P01/i.test(brut)) {
    return `La table des requêtes n'existe pas encore : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
    return `Colonne absente : la migration 20260823100000 reste à appliquer. (${brut})`
  }
  return brut
}
