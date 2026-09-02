import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LE SCORE DE QUALITÉ D'UN COMPTE, ET LE DÉTAIL DE SES COMPTEURS ══
 *
 * Le calcul est en base — `v_qualite_compte` et `v_qualite_compteur`, migration 20260902100000.
 * Il n'est PAS refait ici, et c'est délibéré : le barème de Naoëlle rend six valeurs par compteur
 * puis leur moyenne, et une seconde implémentation en JavaScript finirait par afficher un chiffre
 * différent de celui qui sert à trier ou à compter. Un score qui change selon l'écran ne se croit
 * plus.
 */

/** Un compteur, son score, et les trois faits qui l'expliquent. */
export interface QualiteCompteur {
  compteur_id: string
  numero_point: string
  site_id: string
  site_nom: string | null
  type_energie: string | null
  date_echeance: string | null
  /** Le volume concerné : à score égal, c'est lui qui décide par quel compteur commencer. */
  consommation_annuelle_mwh: number | null
  responsable_nom: string
  a_contrat: boolean
  echeance_future: boolean
  a_responsable: boolean
  score: number
}

export interface QualiteCompte {
  compte_id: string
  compte_nom: string
  nb_compteurs: number
  score: number
  sans_contrat: number
  echeance_a_revoir: number
  sans_responsable: number
  parfaits: number
}

/**
 * Le score d'UN compte.
 *
 * `maybeSingle` et non `single` : un compte inactif, ou dont la vue ne rend aucune ligne, doit
 * rendre `null` sans faire échouer la fiche entière. La carte affiche alors zéro, ce qui est la
 * réponse voulue pour un compte neuf — « quand on créera un compte, ce score sera à zéro ».
 */
export function useQualiteCompte(compteId: string | undefined) {
  return useQuery({
    queryKey: ['qualite-compte', compteId],
    enabled: Boolean(compteId),
    queryFn: async (): Promise<QualiteCompte | null> => {
      const { data, error } = await supabase
        .from('v_qualite_compte')
        .select('*')
        .eq('compte_id', compteId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as QualiteCompte | null) ?? null
    },
  })
}

/**
 * Les compteurs d'un compte, du moins bon au meilleur.
 *
 * L'ORDRE EST CELUI DU TRAVAIL : le score croissant met en tête ce qui manque, puis la consommation
 * décroissante départage — entre deux compteurs à zéro, celui qui pèse mille mégawattheures se
 * traite avant celui qui en pèse dix. C'est la même logique que l'écran de qualité qu'on retire :
 * la donnée absente coûte plus cher là où il y a du volume.
 *
 * Chargé seulement quand on ouvre le détail : la fiche compte n'a besoin que du score, et lire les
 * trois cents compteurs d'un cabinet pour afficher un chiffre serait du gâchis.
 */
export function useQualiteCompteurs(compteId: string | undefined, actif: boolean) {
  return useQuery({
    queryKey: ['qualite-compteurs', compteId],
    enabled: Boolean(compteId) && actif,
    queryFn: async (): Promise<QualiteCompteur[]> => {
      const { data, error } = await supabase
        .from('v_qualite_compteur')
        .select('*')
        .eq('compte_id', compteId)
        .order('score', { ascending: true })
        .order('consommation_annuelle_mwh', { ascending: false, nullsFirst: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as QualiteCompteur[]
    },
  })
}

/**
 * Ce qui manque à un compteur, en clair.
 *
 * Écrit une fois ici plutôt que dans l'écran : la phrase doit dire exactement ce que le barème a
 * regardé, sinon on lit « échéance dépassée » sur un compteur noté pour autre chose.
 */
export function manquesCompteur(q: QualiteCompteur): string[] {
  const manques: string[] = []
  if (!q.a_contrat) manques.push('aucun contrat en cours')
  // L'échéance ne compte QUE sans contrat : sous contrat, c'est sa date de fin qui fait l'échéance,
  // et la réclamer au client n'aurait pas de sens.
  if (!q.a_contrat && !q.echeance_future) {
    manques.push(q.date_echeance ? 'échéance dépassée' : 'aucune échéance')
  }
  if (!q.a_responsable) manques.push('aucun responsable')
  return manques
}
