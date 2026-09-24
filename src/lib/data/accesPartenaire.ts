/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * OUVRIR KIMATCH À UN CONTACT DE PARTENAIRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 24/09/2026 : « faudrait qu'on ajoute dans les accès autorisés les mails des utilisateurs
 * des comptes partenaires, et faut que ce mail soit dans les contacts du compte partenaire ».
 *
 * ══ ON NE SAISIT PLUS D'ADRESSE, ON CHOISIT UNE PERSONNE ══
 *
 * Ouvrir un accès partenaire demandait deux champs libres : l'adresse, et le compte auquel la
 * rattacher. La seconde erreur est grave — une adresse rattachée au mauvais compte ouvre le
 * patrimoine d'un AUTRE partenaire, c'est-à-dire d'un concurrent.
 *
 * En partant du contact, le rattachement n'est plus saisi mais DÉDUIT : on choisit quelqu'un que le
 * compte connaît déjà, et le compte vient avec lui. Il n'y a plus rien à taper, donc plus rien à
 * se tromper.
 *
 * La base le garantit de son côté (migration 20260924153000) : elle refuse un contact qui n'est pas
 * celui d'un partenaire, et recopie l'adresse depuis la fiche plutôt que de la comparer — deux
 * valeurs comparées finissent toujours par diverger.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ContactPartenaire {
  id: string
  prenom: string | null
  nom: string | null
  email: string
  compte_id: string
  compte_nom: string
  /** Un accès est déjà ouvert pour cette personne : l'écran le dit au lieu de laisser réessayer. */
  deja_autorise: boolean
}

/**
 * Les contacts à qui l'on peut ouvrir un accès : ceux des comptes partenaires, actifs, avec une
 * adresse.
 *
 * LES TROIS CONDITIONS SONT CELLES DE LA BASE, reprises ici pour que l'écran ne propose pas un
 * choix qui sera refusé. Elles ne la remplacent pas : le déclencheur reste le seul garant, parce
 * qu'un filtre de liste se contourne par un appel direct.
 */
async function fetchContactsPartenaires(): Promise<ContactPartenaire[]> {
  const { data: type } = await supabase
    .from('types_comptes').select('id').eq('code', 'PARTENAIRE').maybeSingle()
  const typeId = (type as { id: string } | null)?.id
  if (!typeId) return []

  const { data: comptes } = await supabase
    .from('comptes').select('id, nom').eq('type_compte_id', typeId)
  const parCompte = new Map<string, string>()
  for (const c of (comptes ?? []) as { id: string; nom: string }[]) parCompte.set(c.id, c.nom)
  if (parCompte.size === 0) return []

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, prenom, nom, email, compte_id')
    .in('compte_id', [...parCompte.keys()])
    .eq('actif', true)
    .not('email', 'is', null)
    .order('nom')
  if (error) throw new Error(error.message)

  const { data: deja } = await supabase.from('profils_autorises').select('email')
  const ouverts = new Set(
    ((deja ?? []) as { email: string }[]).map((x) => x.email.trim().toLowerCase()),
  )

  return ((contacts ?? []) as unknown as {
    id: string; prenom: string | null; nom: string | null; email: string | null; compte_id: string
  }[])
    .filter((c) => (c.email ?? '').trim().length > 0)
    .map((c) => ({
      id: c.id,
      prenom: c.prenom,
      nom: c.nom,
      email: (c.email as string).trim(),
      compte_id: c.compte_id,
      compte_nom: parCompte.get(c.compte_id) ?? '',
      deja_autorise: ouverts.has((c.email as string).trim().toLowerCase()),
    }))
}

export function useContactsPartenaires() {
  return useQuery({ queryKey: ['contacts-partenaires'], queryFn: fetchContactsPartenaires })
}

/**
 * Ouvre l'accès à un contact de partenaire.
 *
 * ON N'ENVOIE PAS L'ADRESSE : le déclencheur la recopie depuis la fiche contact. L'envoyer d'ici
 * laisserait croire qu'on peut choisir autre chose, et créerait une divergence le jour où la fiche
 * change. On passe une valeur de remplissage, que la base écrase.
 *
 * LE RÔLE EST TOUJOURS `PARTENAIRE`, jamais un choix : c'est le seul rôle dont les quatre capacités
 * sont à faux et que le cloisonnement reconnaît. Laisser le choix ouvrirait la porte à un accès
 * partenaire qui ouvre l'administration — l'erreur la plus coûteuse de cet écran.
 */
export function useOuvrirAccesPartenaire() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contact: ContactPartenaire) => {
      const { data: role } = await supabase
        .from('roles_acces').select('id').eq('code', 'PARTENAIRE').maybeSingle()
      const roleId = (role as { id: string } | null)?.id
      if (!roleId) throw new Error('Le rôle Partenaire est introuvable : prévenez un administrateur.')

      const { data, error } = await supabase
        .from('profils_autorises')
        .insert({
          email: contact.email.trim().toLowerCase(),
          prenom: contact.prenom?.trim() || null,
          nom: contact.nom?.trim() || null,
          contact_id: contact.id,
          role_acces_id: roleId,
        })
        .select('id')
      if (error) {
        // 23505 : cette adresse est déjà autorisée. Postgres parle d'index ; ceci dit quoi faire.
        if (error.code === '23505') throw new Error('Cette adresse a déjà un accès.')
        throw new Error(error.message)
      }
      /* UN INSERT FILTRÉ PAR RLS REND 200 AVEC ZÉRO LIGNE, sans erreur. Sans ce contrôle, l'écran
         annoncerait un accès ouvert qui ne l'est pas — la leçon de la page Rôles, le 24/09. */
      if (!data || data.length === 0) {
        throw new Error('La base a refusé l’ouverture : votre rôle ne le permet peut-être plus.')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profils-autorises'] })
      void queryClient.invalidateQueries({ queryKey: ['contacts-partenaires'] })
    },
  })
}
