import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { mockDocuments } from '@/lib/mockData'
import type { DocumentItem } from '@/types/domain'

interface RawDocument {
  id: string
  nom: string
  entite_type: string
  entite_id: string
  date_creation: string
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

async function fetchDocuments(): Promise<DocumentItem[]> {
  if (!isSupabaseConfigured) return mockDocuments
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, nom, entite_type, entite_id, date_creation, type_document:types_documents(libelle), auteur:profils(prenom, nom)')
      .order('date_creation', { ascending: false })
    if (error || !data || data.length === 0) throw error ?? new Error('empty')

    return (data as unknown as RawDocument[]).map((d) => ({
      id: d.id,
      nom: d.nom,
      type_document: d.type_document?.libelle ?? '',
      entite_type: d.entite_type,
      entite_id: d.entite_id,
      objet_lie: ENTITE_LABELS[d.entite_type] ?? d.entite_type,
      auteur: d.auteur ? `${d.auteur.prenom} ${d.auteur.nom}` : '',
      date_creation: d.date_creation,
    }))
  } catch {
    return mockDocuments
  }
}

export function useDocuments() {
  return useQuery({ queryKey: ['documents'], queryFn: fetchDocuments })
}
