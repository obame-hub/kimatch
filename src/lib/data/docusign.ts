import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Configuration de l'APPLICATION DocuSign côté serveur (Integration Key + clé secrète). Distincte
 *  de la connexion personnelle : sans l'application, personne ne peut se connecter ; avec elle,
 *  chacun doit encore autoriser son propre compte. */
export function useDocusignStatus() {
  return useQuery({
    queryKey: ['docusign-status'],
    queryFn: async (): Promise<{
      configured: boolean
      manquants: string[]
      /** Variables présentes mais inexploitables — un identifiant tronqué, par exemple. */
      invalides?: { variable: string; raison: string }[]
      /** « demonstration » ou « production » : une signature partie de la démonstration n'a aucune
       *  valeur juridique et le client reçoit un e-mail marqué DEMO. */
      environnement?: 'demonstration' | 'production'
    }> => {
      const res = await fetch('/api/docusign/status')
      if (!res.ok) return { configured: false, manquants: [] }
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface DocusignConnexion {
  docusign_email: string | null
  docusign_nom: string | null
  account_nom: string | null
  expire_le: string
  date_creation: string
}

/** Connexion DocuSign de l'utilisateur courant. Lue dans la vue docusign_connexions, qui n'expose
 *  pas les jetons : la table docusign_sessions n'a aucune politique de lecture, même pour son
 *  propriétaire. */
async function fetchDocusignConnexion(): Promise<DocusignConnexion | null> {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const { data, error } = await supabase
    .from('docusign_connexions')
    .select('docusign_email, docusign_nom, account_nom, expire_le, date_creation')
    .maybeSingle()
  if (error) return null
  return data as DocusignConnexion | null
}

export function useDocusignConnexion() {
  return useQuery({ queryKey: ['docusign-connexion'], queryFn: fetchDocusignConnexion })
}

/** Envoie le navigateur sur l'écran d'autorisation DocuSign. Le jeton Supabase part dans l'en-tête
 *  et non dans l'URL : c'est l'endpoint qui scelle l'identifiant du profil dans le `state`. */
export async function connectDocusign(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour lier DocuSign.')

  const res = await fetch('/api/docusign/connect', { headers: { Authorization: `Bearer ${token}` } })
  const result = (await res.json()) as { url?: string; error?: string }
  if (!res.ok || !result.url) throw new Error(result.error ?? 'Impossible de démarrer la connexion DocuSign')
  window.location.href = result.url
}

/** Supprime la session locale. La politique docusign_sessions_self_delete permet ce geste sans
 *  passer par un endpoint ; l'autorisation reste accordée côté DocuSign, une reconnexion ne
 *  redemandera donc pas l'écran de consentement. */
export function useDisconnectDocusign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Non authentifié')
      const { error } = await supabase.from('docusign_sessions').delete().eq('profil_id', userData.user.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['docusign-connexion'] }),
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
  /** Compte DocuSign d'où l'enveloppe est partie. */
  emetteur?: string | null
}

/** Marqueur renvoyé par l'API quand l'utilisateur n'a pas encore autorisé DocuSign. */
export const DOCUSIGN_NON_CONNECTE = 'DOCUSIGN_NON_CONNECTE'

export class DocusignNonConnecte extends Error {}

export async function sendMandatForSignature(input: SendMandatInput): Promise<SendMandatResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — connecte-toi pour envoyer un mandat.')

  const res = await fetch('/api/docusign/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const result = (await res.json()) as SendMandatResult & { error?: string; code?: string }
  if (result.code === DOCUSIGN_NON_CONNECTE) {
    // Erreur distincte : l'appelant peut proposer le bouton de connexion au lieu d'afficher un
    // message d'échec, le mandat étant déjà enregistré.
    throw new DocusignNonConnecte(result.error ?? 'Compte DocuSign non connecté')
  }
  if (!res.ok || result.error) throw new Error(result.error ?? 'Erreur DocuSign inconnue')
  return result
}
