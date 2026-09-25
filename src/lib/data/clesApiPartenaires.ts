import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES CLÉS D'API DES PARTENAIRES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 25/09/2026 : « on pourrait avoir l'option de faire une interface externe où le
 * partenaire pourra se connecter, récupérer nos données via clé API, via endpoint ».
 *
 * ══ LA CLÉ SE FABRIQUE DANS LE NAVIGATEUR, ET N'Y RESTE PAS ══
 *
 * `crypto.getRandomValues` est le générateur du navigateur, adossé à celui du système. On en tire
 * 32 octets, on calcule l'empreinte SHA-256, et on n'envoie QUE l'empreinte à la base. La clé
 * elle-même est affichée une fois puis oubliée : elle ne transite dans aucun enregistrement, aucun
 * journal, aucune sauvegarde.
 *
 * C'est le même raisonnement que pour le jeton de dépôt, à une différence près : là-bas le jeton
 * naît sur le serveur parce que c'est lui qui l'envoie au client. Ici, c'est un humain qui doit le
 * lire et le transmettre — le faire naître sous ses yeux est ce qui garantit que personne d'autre
 * ne l'a vu.
 *
 * ══ ON NE PEUT PAS LA RETROUVER, ET C'EST VOULU ══
 *
 * Perdre une clé oblige à en émettre une autre. C'est le prix d'une base qui, volée, ne donne
 * aucune clé utilisable — et ce prix se paie une fois, en deux minutes.
 */

export interface CleApiPartenaire {
  id: string
  compte_id: string
  libelle: string
  prefixe: string
  actif: boolean
  date_creation: string
  derniere_utilisee: string | null
  nb_appels: number
  revoquee_le: string | null
  compte?: { nom: string } | null
}

const CHAMPS = 'id, compte_id, libelle, prefixe, actif, date_creation, derniere_utilisee, nb_appels, revoquee_le, compte:comptes(nom)'

export function useClesApiPartenaires() {
  return useQuery({
    queryKey: ['cles-api-partenaires'],
    queryFn: async (): Promise<CleApiPartenaire[]> => {
      const { data, error } = await supabase
        .from('cles_api_partenaires')
        .select(CHAMPS)
        .order('date_creation', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as CleApiPartenaire[]
    },
  })
}

/** 32 octets tirés au sort, en base64url, précédés du préfixe qui les rend reconnaissables. */
function fabriquerCle(): string {
  const octets = new Uint8Array(32)
  crypto.getRandomValues(octets)
  const b64 = btoa(String.fromCharCode(...octets))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `kw_${b64}`
}

async function empreinteDe(cle: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cle))
  return Array.from(new Uint8Array(digest)).map((o) => o.toString(16).padStart(2, '0')).join('')
}

export function useEmettreCleApi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ compteId, libelle }: { compteId: string; libelle: string }) => {
      const cle = fabriquerCle()
      const { data: session } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('cles_api_partenaires')
        .insert({
          compte_id: compteId,
          libelle: libelle.trim(),
          empreinte: await empreinteDe(cle),
          prefixe: cle.slice(0, 11),
          creee_par_id: session.user?.id ?? null,
        })
        .select('id')

      if (error) throw new Error(error.message)
      /* UNE ÉCRITURE FILTRÉE PAR RLS REND 200 AVEC ZÉRO LIGNE, SANS ERREUR. Sans ce contrôle,
         l'écran annoncerait une clé émise qui n'existe nulle part. */
      if (!data || data.length === 0) {
        throw new Error('La clé n’a pas été enregistrée : vérifiez que vous êtes administrateur.')
      }

      /* LA CLÉ EST RENDUE À L'APPELANT, UNE FOIS. Elle n'existe plus nulle part après cet instant. */
      return { cle, id: data[0].id as string }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cles-api-partenaires'] }) },
  })
}

export function useRevoquerCleApi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: session } = await supabase.auth.getUser()
      /* ON NE SUPPRIME PAS LA LIGNE. Savoir qu'une clé a existé, pour quel partenaire et jusqu'à
         quand, fait partie de ce qu'on doit pouvoir répondre — y compris des mois après. */
      const { data, error } = await supabase
        .from('cles_api_partenaires')
        .update({ actif: false, revoquee_le: new Date().toISOString(), revoquee_par_id: session.user?.id ?? null })
        .eq('id', id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('La révocation n’a pas été enregistrée.')
      return data[0].id as string
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cles-api-partenaires'] }) },
  })
}
