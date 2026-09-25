import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { utilisateurCourant } from '@/lib/data/utilisateurCourant'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CHECK-LIST D'UN SUIVI DE CONTRAT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « ce sera à Fabien de cocher à la main les étapes qu'il a faites. Ce sera
 * utile par la suite pour faire évoluer le chemin du suivi de contrat. »
 *
 * Un JALON n'est pas une ÉTAPE : le chemin du dossier (`etapes_suivis_contrats`) n'a qu'une valeur
 * à la fois, alors que les jalons se cochent indépendamment et coexistent. Voir la migration
 * `la_checklist_d_un_suivi_de_contrat` pour la raison de cette séparation.
 *
 * COCHER ÉCRIT UNE LIGNE, DÉCOCHER LA SUPPRIME. Une case décochée n'est pas un fait : c'est
 * l'absence de fait. Garder un `false` ferait croire à un geste annulé là où il n'y a eu qu'une
 * erreur de clic — et fausserait le jour où l'on comptera en combien de temps chaque geste arrive.
 */

export interface Jalon {
  id: string
  code: string
  libelle: string
  ordre: number
  optionnel: boolean
  /** Quand il a été coché, et par qui. `null` tant qu'il ne l'est pas. */
  fait_le: string | null
  fait_par: string | null
}

export function useJalonsSuivi(suiviId: string | undefined) {
  return useQuery({
    queryKey: ['suivi-contrat', 'jalons', suiviId],
    enabled: Boolean(suiviId),
    queryFn: async (): Promise<Jalon[]> => {
      const [refs, faits] = await Promise.all([
        supabase.from('jalons_suivi_contrat').select('id, code, libelle, ordre, optionnel').eq('actif', true).order('ordre'),
        supabase
          .from('suivis_contrats_jalons')
          .select('jalon_id, fait_le, fait_par:profils(prenom, nom)')
          .eq('suivi_contrat_id', suiviId as string),
      ])

      /* Aucun échec muet : une check-list vide se lit comme « rien n'est fait », ce qui est faux
         et se corrige en cochant une seconde fois ce qui l'était déjà. */
      if (refs.error) { console.error('useJalonsSuivi — référence', refs.error); throw new Error(refs.error.message) }
      if (faits.error) { console.error('useJalonsSuivi — faits', faits.error); throw new Error(faits.error.message) }

      /* PostgREST rend un embed tantôt en objet, tantôt en tableau selon qu'il juge la relation
         unique : on accepte les deux plutôt que de parier sur l'un. Même précaution que dans
         `publications.ts`. */
      type Personne = { prenom: string; nom: string }
      const premier = (v: Personne | Personne[] | null): Personne | null =>
        Array.isArray(v) ? v[0] ?? null : v

      const parJalon = new Map<string, { fait_le: string; fait_par: string | null }>()
      for (const f of (faits.data ?? []) as unknown as {
        jalon_id: string; fait_le: string; fait_par: Personne | Personne[] | null
      }[]) {
        const qui = premier(f.fait_par)
        parJalon.set(f.jalon_id, { fait_le: f.fait_le, fait_par: qui ? `${qui.prenom} ${qui.nom}` : null })
      }

      return ((refs.data ?? []) as Omit<Jalon, 'fait_le' | 'fait_par'>[]).map((j) => ({
        ...j,
        fait_le: parJalon.get(j.id)?.fait_le ?? null,
        fait_par: parJalon.get(j.id)?.fait_par ?? null,
      }))
    },
  })
}

export function useBasculerJalon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ suiviId, jalonId, fait }: { suiviId: string; jalonId: string; fait: boolean }) => {
      if (fait) {
        const profil = await utilisateurCourant()
        const { error } = await supabase
          .from('suivis_contrats_jalons')
          .insert({ suivi_contrat_id: suiviId, jalon_id: jalonId, fait_par_id: profil?.id ?? null })
        /* Deux clics rapides sur la même case : la seconde écriture bute sur l'unicité. Ce n'est
           pas une panne, c'est l'état voulu — la ligne existe. */
        if (error && !/duplicate key|unique/i.test(error.message)) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('suivis_contrats_jalons')
          .delete()
          .eq('suivi_contrat_id', suiviId)
          .eq('jalon_id', jalonId)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: (_d, { suiviId }) => {
      void qc.invalidateQueries({ queryKey: ['suivi-contrat', 'jalons', suiviId] })
    },
  })
}
