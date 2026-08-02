import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface RefreshSandboxResult {
  ok: boolean
  tablesOk: number
  tablesFailed: { table: string; error?: string }[]
  totalRows: number
}

export function useRefreshSandbox() {
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
  })
}
