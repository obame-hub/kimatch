import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Statut de configuration de la signature électronique -- permet au wizard Mandat de prévenir
 * avant de faire remplir tout le formulaire (Tools a un écran « Connexion requise » équivalent). */
export function useDocusignStatus() {
  return useQuery({
    queryKey: ['docusign-status'],
    queryFn: async (): Promise<{ configured: boolean; manquants: string[] }> => {
      const res = await fetch('/api/docusign/status')
      if (!res.ok) return { configured: false, manquants: [] }
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

interface SendMandatInput {
  mandatId: string
  documents: { pdfBase64: string; fileName: string }[]
  signerEmail: string
  signerName: string
  emailSubject?: string
  emailMessage?: string
  draft?: boolean
  returnUrl?: string
}

interface SendMandatResult {
  envelopeId: string
  status: string
  senderViewUrl?: string
}

export async function sendMandatForSignature(input: SendMandatInput): Promise<SendMandatResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour envoyer un mandat.')

  const res = await fetch('/api/docusign/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const result = (await res.json()) as SendMandatResult & { error?: string }
  if (!res.ok || result.error) throw new Error(result.error ?? 'Erreur DocuSign inconnue')
  return result
}
