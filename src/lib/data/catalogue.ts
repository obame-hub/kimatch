import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LE CATALOGUE DU SCHÉMA ══
 *
 * Une seule requête rend tout : 153 tables, leurs colonnes, leurs liens. C'est gros (quelques
 * centaines de kilo-octets) mais ça ne change qu'au rythme des migrations — d'où le cache long.
 * Charger table par table aurait rendu impossible la seule chose qu'on fait vraiment ici :
 * chercher « où vit ce champ » à travers toute la base.
 */

export interface ReferenceChamp {
  table: string
  colonne: string
  a_la_suppression: string | null
}

export interface ChampCatalogue {
  nom: string
  position: number
  type: string
  obligatoire: boolean
  defaut: string | null
  genere: boolean
  commentaire: string | null
  cle_primaire: boolean
  unique: boolean
  indexee: boolean
  reference: ReferenceChamp | null
}

export interface TableCatalogue {
  nom: string
  commentaire: string | null
  lignes_estimees: number
  rls_active: boolean
  nb_politiques: number
  colonnes: ChampCatalogue[]
  referencee_par: { table: string; colonne: string }[]
}

export interface Catalogue {
  genere_le: string
  tables: TableCatalogue[]
}

export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue-schema'],
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<Catalogue> => {
      const { data, error } = await supabase.rpc('fn_catalogue_schema')
      if (error) {
        /* 42501 EST UN REFUS, PAS UNE PANNE. Le dire en clair évite qu'un non-administrateur
           conclue que le gestionnaire est cassé. */
        if (error.code === '42501' || /administrateur/i.test(error.message)) {
          throw new Error('Le gestionnaire d’objets est réservé aux administrateurs.')
        }
        /* LA FONCTION ABSENTE EST UN CAS ATTENDU : le code part avant que la migration soit
           appliquée. Le dire évite de chercher une panne là où il n'y a qu'une étape en attente. */
        if (error.code === 'PGRST202' || error.code === '42883' || /fn_catalogue_schema/.test(error.message)) {
          throw new Error(
            'La migration du gestionnaire d’objets n’est pas encore appliquée '
            + '(20260916120000_le_gestionnaire_d_objets_lit_le_schema).',
          )
        }
        throw new Error(error.message)
      }
      return data as Catalogue
    },
  })
}

/**
 * LES OBJETS MÉTIER D'ABORD, LE RESTE ENSUITE.
 *
 * 153 tables, dont la majorité sont des tables de liaison, des référentiels et de la plomberie. Les
 * lister à plat obligerait à connaître le schéma pour s'y retrouver — c'est-à-dire à savoir déjà ce
 * qu'on vient chercher. Cette liste est celle des objets qu'on manipule dans Kimatch, dans l'ordre
 * du parcours commercial.
 */
export const OBJETS_PRINCIPAUX = [
  'comptes', 'contacts', 'sites', 'compteurs',
  'pistes', 'opportunites', 'recommandations', 'mandats', 'contrats',
  'interactions', 'actions', 'requetes', 'lots_prospection', 'profils',
]

/** Les tables techniques, reconnues à leur nom : historiques, journaux, files, rattrapages. */
export function estTechnique(nom: string): boolean {
  return /^(historique|webhook|migration|audit|journal|_)/.test(nom) || nom.endsWith('_audit')
}
