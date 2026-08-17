import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Partage de l'étude client — le bloc « ÉTUDE CLIENT » du volet gauche.
 *
 * Un partage = un envoi. La table `partages_etude_client` (migration 20260816180000) garde
 * l'historique plutôt que d'écraser : on veut pouvoir dire qu'un lien a existé, à qui il est
 * parti, et combien de fois il a été ouvert. Le partage courant est donc simplement le plus
 * récent non révoqué.
 *
 * CE QUI N'EST PAS BRANCHÉ, ET POURQUOI. Le lien public n'est pas envoyé au client par email :
 * l'écran « Étude Client » (maquette séparée) n'est pas encore porté, l'URL ne servirait donc
 * rien. Le geste enregistre le partage et met le lien dans le presse-papiers, ce qui permet au
 * conseiller de le tester ; l'envoi au client suivra avec l'écran. Envoyer aujourd'hui un lien
 * qui tombe sur une page absente serait pire que ne pas l'envoyer.
 */

export interface PartageEtudeClient {
  id: string
  recommandation_id: string
  version_recommandation_id: string | null
  jeton: string
  contact_id: string | null
  contact_nom: string | null
  date_envoi: string | null
  date_expiration: string | null
  nb_visites: number
  date_derniere_visite: string | null
  revoque: boolean
  date_creation: string
}

/** URL publique du lien. Une seule fonction pour que l'écran et l'email ne divergent jamais. */
export function urlEtudeClient(jeton: string): string {
  return `${window.location.origin}/etude/${jeton}`
}

/** Le partage courant d'une recommandation : le plus récent qui n'a pas été révoqué. */
export function usePartageEtudeClient(recoId: string | undefined) {
  return useQuery({
    queryKey: ['recommandations', 'partage-etude', recoId],
    enabled: !!recoId,
    queryFn: async (): Promise<PartageEtudeClient | null> => {
      const { data, error } = await supabase
        .from('partages_etude_client')
        .select(
          'id, recommandation_id, version_recommandation_id, jeton, contact_id, date_envoi, date_expiration, nb_visites, date_derniere_visite, revoque, date_creation, contact:contacts(prenom, nom)',
        )
        .eq('recommandation_id', recoId as string)
        .eq('revoque', false)
        .order('date_creation', { ascending: false })
        .limit(1)
      if (error) {
        console.error('usePartageEtudeClient', error)
        return null
      }
      type Ligne = Omit<PartageEtudeClient, 'contact_nom'> & { contact: { prenom: string; nom: string } | null }
      const ligne = ((data ?? []) as unknown as Ligne[])[0]
      if (!ligne) return null
      return {
        ...ligne,
        contact_nom: ligne.contact ? `${ligne.contact.prenom} ${ligne.contact.nom}` : null,
      }
    },
  })
}

function jourDansNJours(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

/**
 * Crée le partage, ou le renvoie s'il existe déjà.
 *
 * Renvoyer ne recrée PAS de jeton : le client a peut-être déjà le lien dans sa boîte, et le
 * changer sous lui casserait celui qu'il utilise. Seule `date_envoi` est repoussée, et
 * l'échéance repart de cet envoi — c'est le sens de « renvoyer ».
 */
export function useEnvoyerEtudeClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      recommandationId: string
      versionId: string | null
      contactId: string | null
      /** Durée de validité en jours. 14 par défaut, comme la maquette. */
      joursValidite?: number
    }): Promise<PartageEtudeClient> => {
      const jours = input.joursValidite ?? 14
      const { data: existant, error: eLecture } = await supabase
        .from('partages_etude_client')
        .select('id')
        .eq('recommandation_id', input.recommandationId)
        .eq('revoque', false)
        .order('date_creation', { ascending: false })
        .limit(1)
      if (eLecture) throw new Error(eLecture.message)

      const champs = {
        date_envoi: new Date().toISOString(),
        date_expiration: jourDansNJours(jours),
        version_recommandation_id: input.versionId,
        contact_id: input.contactId,
        date_modification: new Date().toISOString(),
      }

      const id = (existant ?? [])[0]?.id
      const requete = id
        ? supabase.from('partages_etude_client').update(champs).eq('id', id)
        : supabase.from('partages_etude_client').insert({ recommandation_id: input.recommandationId, ...champs })

      const { data, error } = await requete.select('id, jeton, date_envoi, date_expiration').single()
      if (error) throw new Error(error.message)
      return data as unknown as PartageEtudeClient
    },
    onSuccess: (_r, input) =>
      queryClient.invalidateQueries({ queryKey: ['recommandations', 'partage-etude', input.recommandationId] }),
  })
}

/** Les pastilles « 7 / 14 / 30 j » : repousse l'échéance à partir de l'envoi, ou d'aujourd'hui
 *  si le lien n'est pas encore parti. */
export function useDefinirExpirationEtude() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { partageId: string; recommandationId: string; jours: number; dateEnvoi: string | null }) => {
      const depart = input.dateEnvoi ? new Date(input.dateEnvoi) : new Date()
      depart.setDate(depart.getDate() + input.jours)
      const { error } = await supabase
        .from('partages_etude_client')
        .update({ date_expiration: depart.toISOString(), date_modification: new Date().toISOString() })
        .eq('id', input.partageId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, input) =>
      queryClient.invalidateQueries({ queryKey: ['recommandations', 'partage-etude', input.recommandationId] }),
  })
}

/** Coupe l'accès sans supprimer la ligne : la trace du lien et son compteur de visites restent. */
export function useRevoquerEtudeClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { partageId: string; recommandationId: string }) => {
      const { error } = await supabase
        .from('partages_etude_client')
        .update({ revoque: true, date_modification: new Date().toISOString() })
        .eq('id', input.partageId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, input) =>
      queryClient.invalidateQueries({ queryKey: ['recommandations', 'partage-etude', input.recommandationId] }),
  })
}

/** « consultée il y a 2 h » : mis en forme ici pour que le volet gauche n'ait pas à le refaire. */
export function ilYA(date: string): string {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.round(heures / 24)
  if (jours < 31) return `il y a ${jours} j`
  return `le ${new Date(date).toLocaleDateString('fr-FR')}`
}
