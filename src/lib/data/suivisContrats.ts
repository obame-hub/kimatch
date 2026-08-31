import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/data/paginatedFetch'
import { fetchComptesVisibles, filterVisibles } from '@/lib/data/visibility'

/**
 * LE SUIVI DE CONTRAT — le dernier objet de la chaîne.
 *
 * Dossier de transmission KiMatch du 31/08/2026, § 7 : « Création automatique dès qu'un contrat passe
 * au statut "Signé". Le suivi couvre la vie entière du contrat. »
 *
 * Piste → opportunité → recommandation → contrat → SUIVI. Les quatre premiers servent à gagner
 * l'affaire ; celui-ci sert à la tenir : bienvenue, résiliation de l'ancien fournisseur, bascule,
 * première facture, points clients, renouvellement à douze mois de l'échéance.
 *
 * TOUT VIENT DE `v_suivis_contrats_liste`, et rien n'est recalculé ici. L'étape, la santé et la
 * prochaine action sont produites par la base — § 9 du dossier : « statuts calculés depuis les
 * données lorsque possible », « impossible d'afficher un statut incohérent ». Une santé recalculée
 * dans le navigateur serait une deuxième vérité à tenir d'accord avec la première.
 */

/** Les huit étapes du § 7, dans l'ordre du parcours. */
export const ETAPES_SUIVI = [
  { code: 'A_PREPARER', libelle: 'À préparer' },
  { code: 'RESILIATION_A_CONFIRMER', libelle: 'Résiliation à confirmer' },
  { code: 'EN_ATTENTE_ACTIVATION', libelle: "En attente d'activation" },
  { code: 'CONTRAT_ACTIF', libelle: 'Contrat actif' },
  { code: 'SUIVI_CLIENT', libelle: 'Suivi client' },
  { code: 'RENOUVELLEMENT_A_ANTICIPER', libelle: 'Renouvellement à anticiper' },
  { code: 'EN_RENOUVELLEMENT', libelle: 'En renouvellement' },
  { code: 'CLOTURE', libelle: 'Terminé ou résilié' },
] as const

/**
 * LES QUATRE ÉTATS DE SANTÉ, avec leur ton.
 *
 * « La couleur seule ne porte jamais l'information » (§ 11) : chaque état a donc un LIBELLÉ, et la
 * couleur ne fait que le doubler.
 */
export const SANTE_LIBELLE: Record<string, string> = {
  SAIN: 'Sain',
  A_SURVEILLER: 'À surveiller',
  A_RISQUE: 'À risque',
  OPPORTUNITE: 'Opportunité',
}

export const SANTE_TONE: Record<string, 'kiwi' | 'amber' | 'red' | 'blue'> = {
  SAIN: 'kiwi',
  A_SURVEILLER: 'amber',
  A_RISQUE: 'red',
  OPPORTUNITE: 'blue',
}

export interface SuiviContrat {
  id: string
  reference: string | null
  contrat_id: string
  compte_id: string | null
  site_id: string | null
  fournisseur_compte_id: string | null
  contact_principal_id: string | null
  recommandation_id: string | null
  responsable_profil_id: string | null
  proprietaire_id: string | null
  date_ouverture: string
  date_cloture: string | null
  finalite: string | null
  commentaire: string | null
  sante_forcee: string | null
  motif_sante_forcee: string | null
  etape: string
  etape_libelle: string
  /** Ce que l'étape sert à obtenir, mot pour mot le § 7. Sans elle, « À préparer » ne dit rien. */
  etape_finalite: string
  etape_ordre: number
  compte_nom: string | null
  site_nom: string | null
  fournisseur_nom: string | null
  contrat_reference: string | null
  contrat_statut: string | null
  date_debut: string | null
  date_fin: string | null
  responsable: string
  contact_principal_nom: string
  jours_avant_echeance: number | null
  actions_ouvertes: number
  actions_en_retard: number
  prochaine_action: string | null
  prochaine_echeance: string | null
  prochain_responsable: string | null
  requetes_ouvertes: number
  requetes_en_retard: number
  sante: string
}

const COLONNES_LUES =
  'id, reference, contrat_id, compte_id, site_id, fournisseur_compte_id, contact_principal_id,' +
  ' recommandation_id, responsable_profil_id, proprietaire_id, date_ouverture, date_cloture,' +
  ' finalite, commentaire, sante_forcee, motif_sante_forcee, etape, etape_libelle, etape_finalite,' +
  ' etape_ordre, compte_nom, site_nom, fournisseur_nom, contrat_reference, contrat_statut,' +
  ' date_debut, date_fin, responsable, contact_principal_nom, jours_avant_echeance,' +
  ' actions_ouvertes, actions_en_retard, prochaine_action, prochaine_echeance, prochain_responsable,' +
  ' requetes_ouvertes, requetes_en_retard, sante'

/** Tous les suivis visibles, filtrés par le périmètre de comptes comme les autres listes. */
export function useSuivisContrats() {
  return useQuery({
    queryKey: ['suivis-contrats'],
    queryFn: async (): Promise<SuiviContrat[]> => {
      try {
        const lignes = await fetchAllRows<SuiviContrat>(
          'v_suivis_contrats_liste',
          COLONNES_LUES,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q: any) => q.order('etape_ordre').order('date_ouverture', { ascending: false }),
        )
        const comptesVisibles = await fetchComptesVisibles()
        /* Un suivi sans compte reste visible : le contrat peut n'avoir été rattaché qu'à un site.
           Mesuré le 31/08/2026 : 0 suivi sans compte, mais la règle protège le jour où il y en a. */
        return filterVisibles(lignes, comptesVisibles, (s) => s.compte_id ?? '')
      } catch (error) {
        console.error('useSuivisContrats', error)
        return []
      }
    },
  })
}

/** Un suivi par son identifiant — pour la fiche, sans télécharger la liste entière. */
export function useSuiviContrat(id: string | undefined) {
  return useQuery({
    queryKey: ['suivis-contrats', 'un', id],
    enabled: !!id,
    queryFn: async (): Promise<SuiviContrat | null> => {
      const { data, error } = await supabase
        .from('v_suivis_contrats_liste')
        .select(COLONNES_LUES)
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as SuiviContrat | null) ?? null
    },
  })
}

/** Le suivi d'un contrat donné — pour le montrer depuis la fiche contrat. */
export function useSuiviDuContrat(contratId: string | undefined) {
  return useQuery({
    queryKey: ['suivis-contrats', 'du-contrat', contratId],
    enabled: !!contratId,
    queryFn: async (): Promise<SuiviContrat | null> => {
      const { data, error } = await supabase
        .from('v_suivis_contrats_liste')
        .select(COLONNES_LUES)
        .eq('contrat_id', contratId as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as SuiviContrat | null) ?? null
    },
  })
}

/** Les huit étapes, lues en base pour disposer de leurs identifiants. */
export function useEtapesSuivi() {
  return useQuery({
    queryKey: ['etapes_suivis_contrats'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('etapes_suivis_contrats')
        .select('id, code, libelle, finalite, ordre')
        .eq('actif', true)
        .order('ordre')
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; code: string; libelle: string; finalite: string; ordre: number }[]
    },
  })
}

/**
 * FAIRE AVANCER UN SUIVI D'UNE ÉTAPE.
 *
 * L'écran n'écrit que les étapes que la base ne sait pas déduire — « Résiliation à confirmer »,
 * « En attente d'activation », « En renouvellement ». Les autres arrivent d'elles-mêmes par
 * `recalculer_etape_suivi_contrat`. Rien n'interdit ici d'écrire une autre étape : c'est un geste
 * humain, et l'écran ne propose que celle qui suit.
 *
 * `date_cloture` et `finalite` accompagnent le passage à « Terminé ou résilié » : la contrainte de la
 * table refuse une finalité sans date de clôture, et une clôture doit dire laquelle des deux elle est.
 */
export function useMajEtapeSuivi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      etape_id: string
      finalite?: 'TERMINE' | 'RESILIE' | null
      cloture?: boolean
    }) => {
      const patch: Record<string, unknown> = { etape_id: input.etape_id }
      if (input.cloture) {
        patch.date_cloture = new Date().toISOString()
        patch.finalite = input.finalite ?? 'TERMINE'
      }
      const { error } = await supabase.from('suivis_contrats').update(patch).eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suivis-contrats'] })
      void qc.invalidateQueries({ queryKey: ['kanban-serveur'] })
    },
  })
}

/** Les champs qui se corrigent au clic sur la fiche : responsable, commentaire, santé forcée. */
export function useMajChampSuivi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('suivis_contrats').update(input.patch).eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suivis-contrats'] })
      void qc.invalidateQueries({ queryKey: ['kanban-serveur'] })
    },
  })
}
