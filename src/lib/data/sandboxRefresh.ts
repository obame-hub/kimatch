import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface RefreshSandboxResult {
  ok: boolean
  tablesOk: number
  tablesFailed: { table: string; error?: string }[]
  totalRows: number
}

export interface SandboxLastRefresh {
  date: string
  parNom: string
  succes: boolean
}

interface RawSandboxLog {
  date_modification: string
  nouvelle_valeur: string | null
  modifie_par: { prenom: string; nom: string } | null
}

async function fetchSandboxLastRefresh(): Promise<SandboxLastRefresh | null> {
  const { data, error } = await supabase
    .from('historique_modifications')
    .select('date_modification, nouvelle_valeur, modifie_par:profils(prenom, nom)')
    .eq('table_nom', 'sandbox')
    .eq('champ', 'refresh')
    .order('date_modification', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as RawSandboxLog
  return {
    date: row.date_modification,
    parNom: row.modifie_par ? `${row.modifie_par.prenom} ${row.modifie_par.nom}` : 'Inconnu',
    succes: (row.nouvelle_valeur ?? '').includes('succès'),
  }
}

export function useSandboxLastRefresh() {
  return useQuery({ queryKey: ['sandbox-last-refresh'], queryFn: fetchSandboxLastRefresh })
}

export function useRefreshSandbox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<RefreshSandboxResult> => {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) throw new Error('Non authentifié')

      const res = await fetch('/api/admin/refresh-sandbox', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = (await res.json()) as RefreshSandboxResult & { error?: string }
      if (!res.ok) throw new Error(result.error ?? 'Erreur inconnue')
      return result
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sandbox-last-refresh'] }),
  })
}
