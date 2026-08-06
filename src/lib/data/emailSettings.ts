import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/data/gmail'

export type EmailModule = 'contrat' | 'cotation'

export interface EmailSetting {
  module: EmailModule
  actif: boolean
  destinataires: string[]
  copies: string[]
  copies_cachees: string[]
  sujet_template: string | null
}

async function fetchEmailSettings(): Promise<EmailSetting[]> {
  try {
    const { data, error } = await supabase
      .from('parametres_emails')
      .select('module, actif, destinataires, copies, copies_cachees, sujet_template')
      .order('module')
    if (error) throw error
    return (data ?? []) as EmailSetting[]
  } catch (error) {
    console.error('fetchEmailSettings', error)
    return []
  }
}

export function useEmailSettings() {
  return useQuery({ queryKey: ['parametres_emails'], queryFn: fetchEmailSettings })
}

export function useUpdateEmailSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ module, patch }: { module: EmailModule; patch: Partial<Omit<EmailSetting, 'module'>> }) => {
      const { error } = await supabase
        .from('parametres_emails')
        .update({ ...patch, date_modification: new Date().toISOString() })
        .eq('module', module)
      const persisted = !error
      queryClient.setQueryData<EmailSetting[]>(['parametres_emails'], (old) =>
        old?.map((s) => (s.module === module ? { ...s, ...patch } : s)),
      )
      return { persisted }
    },
  })
}

/** Remplace les jetons `{nom}` du gabarit par leur valeur. */
function appliquerJetons(gabarit: string, valeurs: Record<string, string>): string {
  return gabarit.replace(/\{(\w+)\}/g, (_, cle: string) => valeurs[cle] ?? '')
}

/**
 * Envoie la notification email d'un module, si elle est activée dans Paramètres.
 *
 * Best-effort et volontairement silencieux en cas d'échec : une notification qui ne part pas ne
 * doit jamais faire échouer la création de l'objet métier (même parti pris que `notifySlack`).
 * L'envoi passe par le compte Gmail du conseiller connecté — comme Tools pour la cotation, donc
 * les réponses lui reviennent directement.
 */
export async function notifyEmail(
  module: EmailModule,
  jetons: Record<string, string>,
  corps: string,
): Promise<void> {
  try {
    const { data } = await supabase
      .from('parametres_emails')
      .select('actif, destinataires, copies, sujet_template')
      .eq('module', module)
      .maybeSingle()

    const reglage = data as Pick<EmailSetting, 'actif' | 'destinataires' | 'copies' | 'sujet_template'> | null
    if (!reglage?.actif) return

    const tous = [...(reglage.destinataires ?? []), ...(reglage.copies ?? [])]
    if (tous.length === 0) return

    const sujet = appliquerJetons(reglage.sujet_template ?? `[${module}]`, jetons)
    // `sendEmail` n'expose pas encore le champ Cc : les copies sont ajoutées aux destinataires.
    await sendEmail({ to: tous.join(', '), subject: sujet, text: corps })
  } catch (error) {
    console.error('notifyEmail', module, error)
  }
}
