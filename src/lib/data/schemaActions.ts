import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * MODIFIER LE SCHÉMA DEPUIS KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 16/09/2026 : « je te laisse trouver un moyen que ce soit un gestionnaire avec de la
 * sécurité, lié à notre database, comme ça on ne fait pas n'importe quoi, avec des garde-fous, des
 * avertissements ».
 *
 * AUCUN SQL NE PART D'ICI. Ces fonctions passent un nom de table, un nom de colonne et un type ;
 * c'est PostgreSQL qui construit l'ordre, après neuf refus possibles. Envoyer du SQL depuis une
 * page web reviendrait à confier la base à quiconque sait ouvrir les outils de développement.
 *
 * Voir `20260916140000_le_gestionnaire_d_objets_peut_modifier_le_schema.sql` pour la liste des
 * refus, l'archivage avant suppression et le journal.
 */

export const TYPES_CHAMP = [
  { valeur: 'text', libelle: 'Texte', exemple: 'un nom, une adresse, une note' },
  { valeur: 'integer', libelle: 'Nombre entier', exemple: 'un effectif, un rang' },
  { valeur: 'bigint', libelle: 'Grand nombre entier', exemple: 'un identifiant externe' },
  { valeur: 'numeric', libelle: 'Nombre décimal', exemple: 'un montant, un taux' },
  { valeur: 'boolean', libelle: 'Oui / non', exemple: 'une case à cocher' },
  { valeur: 'date', libelle: 'Date', exemple: 'une échéance' },
  { valeur: 'timestamptz', libelle: 'Date et heure', exemple: 'un horodatage' },
  { valeur: 'uuid', libelle: 'Identifiant', exemple: 'un lien vers une autre ligne' },
  { valeur: 'jsonb', libelle: 'Données structurées', exemple: 'un contenu libre, pour le code' },
] as const

function messageDe(error: { code?: string; message: string }): string {
  /* LE MOTIF DU REFUS EST DÉJÀ ÉCRIT EN FRANÇAIS PAR LA BASE — on le laisse passer tel quel plutôt
     que de le traduire une seconde fois, au risque de dire autre chose. */
  return error.message.replace(/^.*?:\s*/, '') || 'Opération refusée.'
}

function useOperationSchema<T extends Record<string, unknown>>(rpc: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: T) => {
      const { data, error } = await supabase.rpc(rpc, args)
      if (error) throw new Error(messageDe(error))
      return data as { ok: boolean; sql: string; valeurs_archivees?: number }
    },
    onSuccess: () => {
      /* LE CATALOGUE EST RELU APRÈS CHAQUE OPÉRATION : sans ça l'écran continue d'afficher le
         schéma d'avant, et on croit que rien ne s'est passé. */
      void qc.invalidateQueries({ queryKey: ['catalogue-schema'] })
      void qc.invalidateQueries({ queryKey: ['journal-schema'] })
    },
  })
}

export const useAjouterChamp = () =>
  useOperationSchema<{ p_table: string; p_colonne: string; p_type: string; p_defaut?: string | null; p_commentaire?: string | null }>('fn_champ_ajouter')

export const useDocumenterChamp = () =>
  useOperationSchema<{ p_table: string; p_colonne: string; p_commentaire: string }>('fn_champ_documenter')

export const useRenommerChamp = () =>
  useOperationSchema<{ p_table: string; p_colonne: string; p_nouveau: string }>('fn_champ_renommer')

export const useSupprimerChamp = () =>
  useOperationSchema<{ p_table: string; p_colonne: string }>('fn_champ_supprimer')

export interface LigneJournal {
  id: string
  operation: string
  table_cible: string
  colonne: string
  nouvelle_valeur: string | null
  sql_execute: string | null
  accepte: boolean
  refus_motif: string | null
  fait_le: string
  auteur: { prenom: string | null; nom: string | null } | null
}

export function useJournalSchema() {
  return useQuery({
    queryKey: ['journal-schema'],
    staleTime: 60_000,
    queryFn: async (): Promise<LigneJournal[]> => {
      const { data, error } = await supabase
        .from('journal_schema')
        .select('id, operation, table_cible, colonne, nouvelle_valeur, sql_execute, accepte, refus_motif, fait_le, auteur:profils(prenom, nom)')
        .order('fait_le', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return data as unknown as LigneJournal[]
    },
  })
}

/**
 * ══ L'AVERTISSEMENT QUE LA BASE NE PEUT PAS DONNER ══
 *
 * PostgreSQL acceptera toujours un renommage : c'est l'application qui cassera une seconde plus
 * tard, en silence. La seule question qui vaut — « cette colonne est-elle nommée dans le code ? » —
 * demande de lire le dépôt, ce que la base ne fait pas.
 *
 * `scripts/recenser-mots-du-code.cjs` produit ce relevé à chaque construction, donc il décrit
 * exactement le code qui part en production. Il est chargé À LA DEMANDE : 357 Ko n'ont rien à faire
 * dans le paquet principal pour un écran que seuls les administrateurs ouvrent.
 */
export interface UsageCode {
  n: number
  f: string[]
}

let releve: Record<string, UsageCode> | null = null

export async function usageDansLeCode(mot: string): Promise<UsageCode | null> {
  if (!releve) {
    const module = await import('@/generated/mots-du-code.json')
    releve = (module.default ?? module) as unknown as Record<string, UsageCode>
  }
  return releve[mot] ?? null
}
