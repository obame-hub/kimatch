import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DocumentItem } from '@/types/domain'
import { fetchAllRows } from '@/lib/data/paginatedFetch'

interface RawDocument {
  id: string
  nom: string
  nom_fichier: string
  url: string
  entite_type: string
  entite_id: string
  date_creation: string
  proprietaire_id: string | null
  type_document: { libelle: string } | null
  auteur: { prenom: string; nom: string } | null
}

// L'entité liée est polymorphe (entite_type + entite_id, sans jointure directe possible
// vers un nom lisible sans savoir laquelle des tables interroger) — on affiche pour
// l'instant le type d'entité plutôt que son nom exact.
const ENTITE_LABELS: Record<string, string> = {
  site: 'Site',
  compte: 'Compte',
  mandat: 'Mandat',
  recommandation: 'Recommandation',
  version_recommandation: 'Version de recommandation',
  contrat: 'Contrat',
}

/** `entiteIds` restreint la lecture aux documents d'un ensemble d'objets — le compte, ses sites,
 *  ses compteurs, ses mandats. Le rattachement d'un document est polymorphe (entite_type +
 *  entite_id), donc on filtre sur les identifiants : deux entités de types différents ne partagent
 *  jamais un UUID, il n'y a donc pas de faux positif à craindre. */
async function fetchDocuments(entiteIds?: string[], documentId?: string): Promise<DocumentItem[]> {
  try {
    if (entiteIds && entiteIds.length === 0) return []
    const data = await fetchAllRows<RawDocument>(
      'documents',
      'id, nom, nom_fichier, url, entite_type, entite_id, date_creation, proprietaire_id, type_document:types_documents(libelle), auteur:profils!documents_auteur_profil_id_fkey(prenom, nom)',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => {
        if (documentId) return q.eq('id', documentId)
        return (entiteIds ? q.in('entite_id', entiteIds) : q).order('date_creation', { ascending: false })
      },
    )

    return data.map((d) => ({
      id: d.id,
      nom: d.nom,
      nom_fichier: d.nom_fichier,
      url: d.url,
      type_document: d.type_document?.libelle ?? '',
      entite_type: d.entite_type,
      entite_id: d.entite_id,
      objet_lie: ENTITE_LABELS[d.entite_type] ?? d.entite_type,
      auteur: d.auteur ? `${d.auteur.prenom} ${d.auteur.nom}` : '',
      date_creation: d.date_creation,
      proprietaire_id: d.proprietaire_id ?? null,
    }))
  } catch (error) {
    console.error('fetchDocuments', error)
    return []
  }
}


/**
 * Un document lu par son identifiant.
 *
 * Les fiches le cherchaient avec `liste?.find(x => x.id === id)`, ce qui telechargeait la table
 * entiere pour en garder une ligne. Meme motif que useCompte et useSite.
 */
export function useDocument(documentId: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'un', documentId],
    queryFn: async () => (await fetchDocuments(undefined, documentId as string))[0] ?? null,
    enabled: !!documentId,
  })
}
export function useDocuments() {
  return useQuery({ queryKey: ['documents'], queryFn: () => fetchDocuments() })
}

/** Documents rattachés à un ensemble d'entités, filtrés côté serveur. À préférer sur toute fiche. */
export function useDocumentsParEntites(entiteIds: string[] | undefined) {
  const cle = [...(entiteIds ?? [])].sort()
  return useQuery({
    queryKey: ['documents', 'entites', cle],
    queryFn: () => fetchDocuments(cle),
    enabled: !!entiteIds,
  })
}

interface CreateDocumentInput {
  nom: string
  url: string
  type_document_id: string | null
  type_document_libelle: string
  entite_type: string
  entite_id: string
}

function deriveNomFichier(nom: string, url: string): string {
  const fromUrl = url.split('/').pop()?.split('?')[0]
  if (fromUrl && fromUrl.includes('.')) return fromUrl
  return nom
}

interface CreateDocumentResult {
  document: DocumentItem
  persisted: boolean
}

export function useCreateDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateDocumentInput): Promise<CreateDocumentResult> => {
      const now = new Date().toISOString()
      let persisted = false
      const nomFichier = deriveNomFichier(input.nom, input.url)
      let document: DocumentItem = {
        id: `local-${Date.now()}`,
        nom: input.nom,
        nom_fichier: nomFichier,
        url: input.url,
        type_document: input.type_document_libelle,
        entite_type: input.entite_type,
        entite_id: input.entite_id,
        objet_lie: ENTITE_LABELS[input.entite_type] ?? input.entite_type,
        auteur: '',
        date_creation: now,
        proprietaire_id: null,
      }

      const { data, error } = await supabase
        .from('documents')
        .insert({
          nom: input.nom,
          nom_fichier: nomFichier,
          url: input.url,
          entite_type: input.entite_type,
          entite_id: input.entite_id,
          date_creation: now,
          ...(input.type_document_id ? { type_document_id: input.type_document_id } : {}),
        })
        .select('id')
        .single()
      if (!error && data) {
        document = { ...document, id: (data as { id: string }).id }
        persisted = true
      }

      queryClient.setQueryData<DocumentItem[]>(['documents'], (old) => (old ? [document, ...old] : [document]))
      return { document, persisted }
    },
  })
}

export interface UpdateDocumentInput {
  id: string
  nom: string
  nom_fichier: string
  url: string
  proprietaire_id: string | null
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateDocumentInput) => {
      const { error } = await supabase
        .from('documents')
        .update({
          nom: input.nom,
          nom_fichier: input.nom_fichier,
          url: input.url,
          proprietaire_id: input.proprietaire_id,
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
  })
}
