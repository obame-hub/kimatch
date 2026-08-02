import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

export interface RefreshProgress {
  table: string
  done: number
  total: number
}

interface ProgressEvent {
  type: 'progress'
  table: string
  done: number
  total: number
  rows: number
  error?: string
}
interface DoneEvent extends RefreshSandboxResult {
  type: 'done'
}

// Pas de useMutation ici : react-query ne prevoit pas de callback de progression incrementale,
// et on veut afficher "table X/Y" pendant que ça tourne plutot qu'une attente aveugle (la
// synchronisation complete peut prendre du temps une fois tous les comptes Salesforce migres).
export function useRefreshSandbox() {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [progress, setProgress] = useState<RefreshProgress | null>(null)

  const mutateAsync = useCallback(async (): Promise<RefreshSandboxResult> => {
    setIsPending(true)
    setProgress(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) throw new Error('Non authentifié')

      const res = await fetch('/api/admin/refresh-sandbox', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Erreur inconnue')
      }
      if (!res.body) throw new Error('Réponse vide du serveur')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult: RefreshSandboxResult | null = null

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as ProgressEvent | DoneEvent
          if (event.type === 'progress') {
            setProgress({ table: event.table, done: event.done, total: event.total })
          } else {
            finalResult = event
          }
        }
      }

      if (!finalResult) throw new Error('Le flux de réponse a été interrompu avant la fin')
      queryClient.invalidateQueries({ queryKey: ['sandbox-last-refresh'] })
      return finalResult
    } finally {
      setIsPending(false)
      setProgress(null)
    }
  }, [queryClient])

  return { mutateAsync, isPending, progress }
}
