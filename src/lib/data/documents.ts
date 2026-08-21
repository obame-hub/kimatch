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
  // Un fichier peut être rattaché à un point de livraison précis — la facture, le contrat, la photo
  // du compteur. Le libellé manquait ici, si bien que la colonne « objet lié » affichait la valeur
  // brute « compteur » au lieu de « Compteur ».
  compteur: 'Compteur',
  // La grille de prix reçue d'un fournisseur, rattachée à l'offre qu'elle chiffre et non à la
  // version : un fournisseur consulté sur 24 et 36 mois envoie une grille par durée.
  offre_fournisseur: 'Offre fournisseur',
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
    // Même oubli que sur les interactions : `setQueryData` n'écrit que dans la clé ['documents']
    // exacte, alors que les fiches lisent des clés dérivées. Sans invalidation, un document ajouté
    // n'apparaissait qu'après rechargement de la page.
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['documents'] }) },
  })
}

/**
 * Téléverse un ou plusieurs fichiers dans le bucket « documents », puis crée leur ligne.
 *
 * C'est ce qui manquait au glisser-déposer : `useCreateDocument` attend une URL, il fallait donc
 * héberger le fichier ailleurs et coller son lien. Le dépôt direct est possible depuis le
 * 16/08/2026, quand le bucket a enfin reçu des politiques d'écriture (migration 20260816130000) —
 * il n'en avait aucune, et c'est pour cela que le formulaire réclamait une URL.
 *
 * Le chemin porte l'entité et l'horodatage : deux fichiers du même nom déposés sur deux fiches ne
 * se marchent pas dessus, et redéposer le même nom sur la même fiche ne masque pas l'ancien.
 */
export function useTeleverserDocuments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      fichiers: File[]
      entite_type: string
      entite_id: string
      type_document_id: string | null
      type_document_libelle: string
    }) => {
      const url = import.meta.env.VITE_SUPABASE_URL as string
      const deposes: DocumentItem[] = []

      for (const fichier of input.fichiers) {
        // Nom de fichier sûr : ni accent, ni espace, ni slash — le chemin de stockage les supporte
        // mal et l'URL publique deviendrait illisible.
        const nomSur = fichier.name
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^A-Za-z0-9._-]+/g, '_')
        const chemin = `${input.entite_type}/${input.entite_id}/${Date.now()}_${nomSur}`

        const { error: erreurDepot } = await supabase.storage
          .from('documents')
          .upload(chemin, fichier, { contentType: fichier.type || undefined, upsert: false })
        if (erreurDepot) throw new Error(`« ${fichier.name} » : ${erreurDepot.message}`)

        const publique = `${url}/storage/v1/object/public/documents/${chemin}`
        const { data, error } = await supabase
          .from('documents')
          .insert({
            nom: fichier.name,
            nom_fichier: nomSur,
            url: publique,
            mime_type: fichier.type || null,
            taille_octets: fichier.size,
            entite_type: input.entite_type,
            entite_id: input.entite_id,
            date_creation: new Date().toISOString(),
            ...(input.type_document_id ? { type_document_id: input.type_document_id } : {}),
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)

        deposes.push({
          id: (data as { id: string }).id,
          nom: fichier.name,
          nom_fichier: nomSur,
          url: publique,
          type_document: input.type_document_libelle,
          entite_type: input.entite_type,
          entite_id: input.entite_id,
          objet_lie: ENTITE_LABELS[input.entite_type] ?? input.entite_type,
          auteur: '',
          date_creation: new Date().toISOString(),
          proprietaire_id: null,
        })
      }

      return deposes
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['documents'] }) },
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['documents'] }) },
  })
}

/** Colonnes réellement modifiables de `documents`, pour l'édition en place. */
export type PatchDocument = Partial<{
  nom: string
  nom_fichier: string
  url: string
  proprietaire_id: string | null
}>

/** Mise à jour d'un seul champ, sans réécrire les quatre colonnes. */
export function useUpdateDocumentPartiel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PatchDocument }) => {
      const { error } = await supabase.from('documents').update(patch).eq('id', id)
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['documents'] }) },
  })
}
