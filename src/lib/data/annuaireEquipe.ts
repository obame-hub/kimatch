import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ L'ANNUAIRE DE L'ÉQUIPE, POUR LES CHAMPS D'ADRESSE ══
 *
 * William, 28/09/2026 : « j'aimerais que dans les éditeurs de mails soient pré-enregistrés les mails
 * des utilisateurs. Ainsi si je tape marie, on me propose directement le mail de Marie THONNARD —
 * plusieurs utilisateurs sont régulièrement mis en copie des mails ».
 *
 * L'ÉQUIPE, ET SEULEMENT ELLE : un profil actif, rattaché à aucun compte partenaire, qui porte une
 * adresse. Un partenaire est externe — le proposer en copie d'un mail client ferait circuler chez lui
 * ce qui ne le regarde pas. Un ancien de l'équipe n'a plus de boîte qui réponde.
 *
 * Mesuré le 28/09/2026 : dix personnes, trois profils inactifs écartés.
 */
export interface MembreEquipe {
  id: string
  prenom: string
  nom: string
  email: string
}

export function useAnnuaireEquipe() {
  return useQuery({
    queryKey: ['annuaire-equipe'],
    /* L'équipe ne change pas pendant qu'on écrit un mail : une lecture par quart d'heure suffit. */
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<MembreEquipe[]> => {
      const { data, error } = await supabase
        .from('profils')
        .select('id, prenom, nom, email')
        .eq('actif', true)
        .is('compte_partenaire_id', null)
        .not('email', 'is', null)
        .order('prenom')
      if (error) throw new Error(error.message)
      return ((data ?? []) as MembreEquipe[]).filter((m) => m.email.trim() !== '')
    },
  })
}
