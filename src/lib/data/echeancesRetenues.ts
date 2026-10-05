import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * L'ÉCHÉANCE RETENUE D'UN COMPTEUR, LUE EN BASE (`v_echeance_compteur`) — William, 05/10/2026 :
 * « Tous les endroits doivent lire l'échéance, en tout cas le champ qui peut mentionner
 * "Indéterminée". » C'est la règle de la fiche compteur (`echeanceDuCompteur`) : le dernier contrat
 * connu, client signé et validé ou prospect ; sans fin, l'échéance est « Indéterminée ».
 * `compteurs.date_echeance` reste la date DÉCLARÉE, qu'on n'affiche plus comme l'échéance.
 */
export interface EcheanceRetenue {
  date: string | null
  indeterminee: boolean
}

export async function lireEcheancesRetenues(ids: string[]): Promise<Map<string, EcheanceRetenue>> {
  const m = new Map<string, EcheanceRetenue>()
  if (ids.length === 0) return m
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('v_echeance_compteur').select('compteur_id, date_echeance, indeterminee').in('compteur_id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as { compteur_id: string; date_echeance: string | null; indeterminee: boolean | null }[]) {
      m.set(r.compteur_id, { date: r.date_echeance, indeterminee: !!r.indeterminee })
    }
  }
  return m
}

export function useEcheancesRetenues(ids: string[]) {
  const cle = [...ids].sort().join(',')
  return useQuery({
    queryKey: ['echeances-retenues', cle],
    queryFn: () => lireEcheancesRetenues(ids),
    enabled: ids.length > 0,
    staleTime: 60_000,
  })
}

/** « 31/12/2026 », « Indéterminée », ou « — ». */
export function echeanceLisible(e: EcheanceRetenue | undefined, repli?: string | null): string {
  if (e?.indeterminee) return 'Indéterminée'
  const d = e ? e.date : repli ?? null
  return d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR') : '—'
}
