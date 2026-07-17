// Types alignés sur le vrai schéma Supabase (audité le 17/07/2026 via le Personal Access
// Token de Naoëlle). Les statuts/étapes/types sont des codes texte pilotés par les vraies
// tables de référence (statuts_signaux, etapes_recommandation, etc.) — voir useReferenceTable.

export interface Site {
  id: string
  nom: string
  compte_nom: string
  type_site: string
  ville: string
  code_postal: string
  nb_compteurs: number
  nb_signaux_ouverts: number
  statut: 'actif' | 'inactif'
}

export interface Signal {
  id: string
  site_id: string
  site_nom: string
  type_signal: string
  statut: string
  priorite: 'basse' | 'normale' | 'haute'
  conseiller: string
  date_creation: string
  description: string
}

export interface VersionRecommandation {
  id: string
  numero: number
  statut: string
  motif_creation: string
  date_creation: string
  gains_estimes: number | null
  resume: string
}

export interface Recommandation {
  id: string
  titre: string
  compte_nom: string
  sites: string[]
  etape: string
  conseiller: string
  objectif: string
  date_creation: string
  versions: VersionRecommandation[]
}

export interface ActionItem {
  id: string
  type_action: string
  statut: string
  responsable: string
  echeance: string
  cible_label: string
}

export interface Mandat {
  id: string
  compte_nom: string
  statut: string
  date_signature: string | null
  nb_sites_couverts: number
}

export type TypeCompte = 'client' | 'fournisseur' | 'partenaire' | 'kiwee'

export interface Compte {
  id: string
  nom: string
  type_compte: TypeCompte
  segment: string
  nb_sites: number
  ville: string
  siren: string | null
  score_ellipro: string | null
  score_ellipro_scale: string | null
  score_ellipro_maj: string | null
}

export interface Compteur {
  id: string
  site_id: string
  site_nom: string
  type_energie: 'electricite' | 'gaz'
  numero_pdl: string
  utilisation: string
  statut: 'actif' | 'inactif'
}

export interface DocumentItem {
  id: string
  nom: string
  type_document: string
  objet_lie: string
  auteur: string
  date_creation: string
}
