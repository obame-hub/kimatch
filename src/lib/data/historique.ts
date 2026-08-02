import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface HistoriqueEntry {
  id: string
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  date_modification: string
  modifie_par_nom: string | null
}

interface RawHistorique {
  id: string
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  date_modification: string
  modifie_par: { prenom: string; nom: string } | null
}

const CHAMPS_IGNORES = new Set(['date_modification', 'modifie_par_id', 'cree_par_id'])

async function fetchHistorique(tableNom: string, ligneId: string): Promise<HistoriqueEntry[]> {
  if (!ligneId) return []
  const { data, error } = await supabase
    .from('historique_modifications')
    .select('id, champ, ancienne_valeur, nouvelle_valeur, date_modification, modifie_par:profils(prenom, nom)')
    .eq('table_nom', tableNom)
    .eq('ligne_id', ligneId)
    .order('date_modification', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return (data as unknown as RawHistorique[])
    .filter((h) => !CHAMPS_IGNORES.has(h.champ))
    .map((h) => ({
      id: h.id,
      champ: h.champ,
      ancienne_valeur: h.ancienne_valeur,
      nouvelle_valeur: h.nouvelle_valeur,
      date_modification: h.date_modification,
      modifie_par_nom: h.modifie_par ? `${h.modifie_par.prenom} ${h.modifie_par.nom}` : null,
    }))
}

export function useHistorique(tableNom: string, ligneId: string | undefined) {
  return useQuery({
    queryKey: ['historique', tableNom, ligneId],
    queryFn: () => fetchHistorique(tableNom, ligneId ?? ''),
    enabled: !!ligneId,
  })
}
