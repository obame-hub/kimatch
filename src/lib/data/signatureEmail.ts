import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LA SIGNATURE EMAIL DE LA PERSONNE CONNECTÉE ══
 *
 * Naoëlle, 07/09/2026 : « il faut bien la signature de chacun de nos commerciaux. »
 *
 * Elle vit dans `profils_signatures_email` (migration 20260907200000), une ligne par personne, sous
 * RLS : chacun lit et écrit la sienne, les administrateurs lisent toutes pour pouvoir dépanner.
 *
 * LE VOLET N'ENVOIE JAMAIS LA SIGNATURE. Il en montre un aperçu ; c'est le serveur qui la colle au
 * bas du mail, en la relisant en base. Sinon il suffirait de modifier la requête pour signer du nom
 * de quelqu'un d'autre.
 *
 * Comme les autres lectures posées sur une migration récente, elle se tait plutôt que de casser
 * l'écran quand la table n'existe pas encore.
 */

export interface SignatureEmail {
  /**
   * GÉNÉRÉ EN BASE, jamais écrit par l'écran.
   *
   * `fn_signature_html` le reconstruit à chaque modification des champs structurés (migration
   * 20260907230000). L'écran n'édite que fonction et téléphones, et le gabarit reste identique pour
   * toute l'équipe — dix blocs HTML modifiés séparément auraient divergé au troisième mois.
   */
  corps_html: string
  active_par_defaut: boolean
  fonction: string | null
  telephone_fixe: string | null
  telephone_mobile: string | null
}

const ABSENTE = /does not exist|schema cache|404/i

export function useSignatureEmail() {
  return useQuery({
    queryKey: ['signature-email'],
    retry: false,
    // Elle change rarement, et le volet la relit à chaque ouverture.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SignatureEmail | null> => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return null
      const { data, error } = await supabase
        .from('profils_signatures_email')
        .select('corps_html, active_par_defaut, fonction, telephone_fixe, telephone_mobile')
        .eq('profil_id', userData.user.id)
        .maybeSingle()
      if (error) {
        if (ABSENTE.test(error.message)) return null
        throw new Error(error.message)
      }
      return (data as SignatureEmail | null) ?? null
    },
  })
}

export function useEnregistrerSignatureEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<SignatureEmail>) => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('Non authentifié')
      // `upsert` et non `update` : la ligne existe pour tous les profils amorcés par la migration,
      // mais une personne arrivée depuis n'en a pas — et elle doit pouvoir écrire la sienne.
      const { error } = await supabase
        .from('profils_signatures_email')
        .upsert({ profil_id: userData.user.id, ...patch }, { onConflict: 'profil_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['signature-email'] }) },
  })
}

/* ════════════════════════════════════════ L'ENVOI ════════════════════════════════════════ */

export interface EnvoiEmail {
  to: string
  cc?: string
  bcc?: string
  subject: string
  html: string
  avecSignature: boolean
  threadId?: string
  contactId?: string
  compteId?: string
  siteId?: string
  recommandationId?: string
  mandatId?: string
  contratId?: string
}

export interface ResultatEnvoi {
  id: string
  threadId: string | null
  /** Faux quand le mail est parti mais que la trace dans Kimatch a échoué. */
  consigne: boolean
  contactId: string | null
}

/** Levée quand aucun compte Gmail n'est lié : l'écran propose alors de le connecter. */
export class GmailNonConnecte extends Error {
  constructor() {
    super('Aucun compte Gmail connecté.')
    this.name = 'GmailNonConnecte'
  }
}

export async function envoyerEmail(envoi: EnvoiEmail): Promise<ResultatEnvoi> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Non authentifié — reconnecte-toi pour envoyer un mail.')

  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(envoi),
  })
  const resultat = (await res.json()) as ResultatEnvoi & { error?: string; code?: string }
  if (!res.ok) {
    if (resultat.code === 'gmail_non_connecte') throw new GmailNonConnecte()
    throw new Error(resultat.error ?? 'Envoi impossible')
  }
  return resultat
}
