// Types alignés sur le vrai schéma Supabase (audité le 17/07/2026 via le Personal Access
// Token de Naoëlle). Les statuts/étapes/types sont des codes texte pilotés par les vraies
// tables de référence (statuts_signaux, etapes_recommandation, etc.) — voir useReferenceTable.

export interface Site {
  id: string
  nom: string
  compte_id: string
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
  contenu: string | null
  economie_pourcentage: number | null
  niveau_confiance: number | null
  date_validite_offres: string | null
  document_url: string | null
}

export interface Recommandation {
  id: string
  titre: string
  compte_id: string
  compte_nom: string
  sites: { id: string; nom: string }[]
  etape: string
  conseiller: string
  objectif: string
  description: string
  priorite: number
  commentaire_interne: string
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
  site_id: string | null
}

export interface Mandat {
  id: string
  compte_id: string
  compte_nom: string
  statut: string
  date_signature: string | null
  nb_sites_couverts: number
  contact_signataire_id?: string | null
  contact_signataire_nom?: string
}

export interface Contact {
  id: string
  compte_id: string
  compte_nom: string
  civilite: string | null
  prenom: string
  nom: string
  fonction: string | null
  telephone: string | null
  email: string | null
  contact_principal: boolean
  actif: boolean
  sites: { id: string; nom: string; fonction_sur_site: string | null }[]
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
  // Champs portés par la table `compteurs` elle-même.
  consommation_annuelle_mwh: number | null
  synchro_eneo: boolean
  date_derniere_synchro_eneo: string | null
  // Champs enrichis via `compteurs_electricite` (segment, tension, ventilation
  // conso/puissance par classe temporelle) — présents seulement pour un
  // compteur électrique déjà synchronisé.
  segment?: string | null
  tension?: string | null
  tarif_distribution?: string | null
  consoParClasseMwh?: Record<string, number>
  puissanceParClasseKva?: Record<string, number>
  // Champs enrichis via `compteurs_gaz`.
  car_mwh?: number | null
  profil_consommation?: string | null
  zone_tarifaire?: string | null
}

export interface Consommation {
  id: string
  compteur_id: string
  date_debut_periode: string
  date_fin_periode: string
  quantite: number
  unite: string
  poste_tarifaire: string
  type_valeur: string
  source: string | null
  commentaire: string | null
}

export interface DocumentItem {
  id: string
  nom: string
  nom_fichier: string
  url: string
  type_document: string
  entite_type: string
  entite_id: string
  objet_lie: string
  auteur: string
  date_creation: string
}

export interface Interaction {
  id: string
  type_interaction: string
  date_interaction: string
  sens: string | null
  objet: string | null
  resume: string | null
  resultat: string | null
  auteur: string
  compte_id: string | null
  compte_nom: string
  site_id: string | null
  site_nom: string
  contact_id: string | null
  contact_nom: string
}

export interface Contrat {
  id: string
  site_id: string
  site_nom: string
  fournisseur_compte_id: string | null
  fournisseur_nom: string
  type_energie: 'electricite' | 'gaz'
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  statut: string
}
