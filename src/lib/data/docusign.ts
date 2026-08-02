import { supabase } from '@/lib/supabase'

interface SendMandatInput {
  mandatId: string
  documentUrl: string
  documentName: string
  signerEmail: string
  signerName: string
  emailSubject?: string
  emailMessage?: string
}

interface SendMandatResult {
  envelopeId: string
  status: string
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
