import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LA BOÎTE DE RÉCEPTION INTERNE ══
 *
 * Naoëlle, 09/09/2026 : « ce serait bien d'avoir des notifs sur l'app direct », « pour les
 * principaux concernés de l'action ».
 *
 * Kimatch n'avertissait que par Slack et par courriel, c'est-à-dire HORS de l'application : on
 * apprenait qu'il s'était passé quelque chose dans Kimatch en lisant ailleurs. Une notification en
 * base porte trois choses qu'un courriel n'a pas — elle sait si elle a été lue, elle pointe l'objet
 * concerné, et elle reste là où le travail se fait.
 *
 * ── CE QUI EST PERSONNEL, ET COMMENT C'EST TENU ──
 *
 * Contrairement au reste du schéma, dont les 263 politiques sont en `using (true)`, la table
 * `notifications` a une vraie politique : `destinataire_profil_id = auth.uid()`. Inutile donc de
 * filtrer par profil dans les requêtes ci-dessous — la base ne rend que ce qui nous appartient.
 * On ne s'en remet pas pour autant à la seule RLS pour l'écriture : `creerNotifications` refuse
 * silencieusement une liste de destinataires vide plutôt que d'écrire une ligne sans lecteur.
 */

export interface Notification {
  id: string
  titre: string
  message: string | null
  lien: string | null
  entite_type: string | null
  entite_id: string | null
  categorie: string
  lu_le: string | null
  date_creation: string
}

const COLONNES = 'id, titre, message, lien, entite_type, entite_id, categorie, lu_le, date_creation'

/**
 * Les cinquante dernières, lues comme non lues.
 *
 * `refetchInterval` d'une minute : une notification arrive pendant qu'on travaille ailleurs dans
 * l'application, et personne ne recharge sa page pour vérifier sa boîte. Une minute est assez court
 * pour qu'un relais de contrat ne dorme pas, assez long pour ne pas peser — la requête est un index
 * partiel sur une table qui ne dépassera pas quelques milliers de lignes.
 */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select(COLONNES)
        .order('date_creation', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return (data ?? []) as Notification[]
    },
    refetchInterval: 60_000,
  })
}

/** Celles qui restent à traiter — c'est le nombre que porte la pastille du rail. */
export function useNotificationsNonLues(): Notification[] {
  const { data } = useNotifications()
  return (data ?? []).filter((n) => !n.lu_le)
}

export function useMarquerLue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase
        .from('notifications')
        .update({ lu_le: new Date().toISOString() })
        .in('id', ids)
        /* ON NE RÉÉCRIT PAS UNE LECTURE DÉJÀ ENREGISTRÉE : rouvrir sa boîte ne doit pas repousser
           l'heure à laquelle on a vu passer une demande. C'est cette heure-là qui dira, plus tard,
           combien de temps un relais est resté sans réponse. */
        .is('lu_le', null)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

/**
 * ══ ÉCRIRE DANS LA BOÎTE DES AUTRES ══
 *
 * C'est l'usage normal : celui qui valide un contrat prévient le service client. La politique
 * d'insertion est donc ouverte à tout utilisateur connecté — la restreindre à soi-même reviendrait
 * à interdire de prévenir qui que ce soit.
 *
 * ── DEUX RÈGLES QUI ÉVITENT LES NOTIFICATIONS INUTILES ──
 *
 * ON NE SE PRÉVIENT PAS SOI-MÊME. Celui qui vient de cliquer sait ce qu'il a fait ; se retrouver
 * avec une pastille rouge pour sa propre action apprend surtout à ignorer la pastille.
 *
 * UNE LISTE VIDE N'ÉCRIT RIEN, et ce n'est pas une erreur : si le service client n'est pas encore
 * désigné dans Paramètres, la validation doit passer quand même. Un contrat ne doit pas rester
 * bloqué parce que personne n'a rempli un champ de configuration.
 */
export async function creerNotifications(input: {
  destinataires: string[]
  titre: string
  message?: string | null
  lien?: string | null
  entiteType?: string | null
  entiteId?: string | null
  categorie?: string
  emetteurId?: string | null
}): Promise<number> {
  const destinataires = [...new Set(input.destinataires)].filter(
    (id) => id && id !== input.emetteurId,
  )
  if (destinataires.length === 0) return 0

  const { error } = await supabase.from('notifications').insert(
    destinataires.map((destinataire_profil_id) => ({
      destinataire_profil_id,
      titre: input.titre,
      message: input.message ?? null,
      lien: input.lien ?? null,
      entite_type: input.entiteType ?? null,
      entite_id: input.entiteId ?? null,
      categorie: input.categorie ?? 'general',
      cree_par_id: input.emetteurId ?? null,
    })),
  )
  if (error) throw new Error(error.message)
  return destinataires.length
}

/**
 * ══ QUI EST DERRIÈRE UN MODULE DE `parametres_emails` ══
 *
 * Rien dans la base ne dit que Fabien Dubarry est le service client : la table `postes` est VIDE et
 * `profils` ne porte aucun rôle métier. William le dit de vive voix — « avant c'était Agathe,
 * maintenant c'est Fabien » — et ça changera encore.
 *
 * On lit donc les destinataires configurés dans Paramètres, et on les traduit en profils par leur
 * adresse. Une adresse configurée qui ne correspond à aucun profil actif est ignorée : elle peut
 * désigner quelqu'un d'extérieur, qui recevra le courriel mais n'a pas de boîte dans Kimatch.
 */
export async function profilsDuModule(module: string): Promise<string[]> {
  const { data: parametre } = await supabase
    .from('parametres_emails')
    .select('destinataires, actif')
    .eq('module', module)
    .maybeSingle()

  const adresses = (parametre as { destinataires?: string[]; actif?: boolean } | null)
  if (!adresses?.actif || !adresses.destinataires?.length) return []

  const { data: profils } = await supabase
    .from('profils')
    .select('id')
    .in('email', adresses.destinataires)
    .eq('actif', true)

  return ((profils ?? []) as { id: string }[]).map((p) => p.id)
}
