// Types alignés sur le vrai schéma Supabase (audité le 17/07/2026 via le Personal Access
// Token de Naoëlle). Les statuts/étapes/types sont des codes texte pilotés par les vraies
// tables de référence (statuts_signaux, etapes_recommandation, etc.) — voir useReferenceTable.

export interface Site {
  id: string
  nom: string
  compte_id: string
  compte_nom: string
  type_site: string
  adresse: string
  ville: string
  code_postal: string
  latitude: number | null
  longitude: number | null
  annee_construction: number | null
  surface_m2: number | null
  date_derniere_ag: string | null
  nb_compteurs: number
  nb_signaux_ouverts: number
  statut: 'actif' | 'inactif'
  proprietaire_id: string | null
}

export interface Signal {
  id: string
  site_id: string
  site_nom: string
  contrat_id: string | null
  type_signal: string
  gravite: number | null
  statut: string
  conseiller: string
  date_creation: string
  description: string
  proprietaire_id: string | null
}

export interface VersionRecommandation {
  id: string
  nom: string | null
  statut: string
  motif_creation: string
  date_creation: string
  gains_estimes: number | null
  resume: string
  contexte_et_hypotheses: string | null
  economie_pourcentage: number | null
  niveau_confiance: number | null
  version_actuelle: boolean
  est_figee: boolean
  date_publication: string | null
  date_presentation_client: string | null
  date_decision_client: string | null
  compteur_ids: string[]
  optimisations: Optimisation[]
}

export interface OffreFournisseur {
  id: string
  fournisseur_nom: string
  reference_offre: string | null
  nom: string | null
  description: string | null
  statut: string | null
  montant_annuel_ht: number | null
  montant_total_ht: number | null
  economie_annuelle_estimee: number | null
  economie_pourcentage: number | null
  duree_mois: number | null
  est_offre_recommandee: boolean
}

export interface Optimisation {
  id: string
  nom: string | null
  type_optimisation: string
  description: string | null
  resultat_attendu: string | null
  gain_estime_annuel: number | null
  cout_estime: number | null
  roi_mois: number | null
  priorite: number | null
  est_retenue: boolean
  offres: OffreFournisseur[]
}

export interface Recommandation {
  id: string
  titre: string
  compte_id: string
  compte_nom: string
  sites: { id: string; nom: string }[]
  etape: string
  conseiller: string
  origine?: string
  description: string
  priorite: number
  commentaire_interne: string
  date_creation: string
  versions: VersionRecommandation[]
  proprietaire_id: string | null
}

export interface ActionItem {
  id: string
  titre: string
  type_action: string
  statut: string
  priorite: number
  responsable: string
  responsable_id: string | null
  date_creation: string
  echeance: string
  date_realisation: string | null
  commentaire: string | null
  cible_label: string
  site_id: string | null
  contact_id: string | null
  contact_nom: string
  recommandation_id: string | null
  recommandation_titre: string
  proprietaire_id: string | null
}

export interface Mandat {
  id: string
  compte_id: string
  compte_nom: string
  statut: string
  date_signature: string | null
  date_envoi: string | null
  date_debut_validite: string | null
  date_fin_validite: string | null
  nb_sites_couverts: number
  site_ids: string[]
  contact_signataire_id?: string | null
  contact_signataire_nom?: string
  docusign_envelope_id?: string | null
  proprietaire_id: string | null
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
  proprietaire_id: string | null
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
  siret: string | null
  telephone: string | null
  email: string | null
  site_web: string | null
  score_ellipro: string | null
  score_ellipro_scale: string | null
  score_ellipro_maj: string | null
  // comptes_clients (type_compte === 'client')
  segment_compte_id?: string | null
  segment_compte_libelle?: string | null
  conseiller_referent_id?: string | null
  conseiller_referent_nom?: string | null
  origine_acquisition?: string | null
  mandat_cadre_actif?: boolean
  note_interne?: string | null
  // comptes_fournisseurs (type_compte === 'fournisseur')
  fournit_electricite?: boolean
  fournit_gaz?: boolean
  contact_commercial_id?: string | null
  contact_commercial_nom?: string | null
  // comptes_partenaires (type_compte === 'partenaire')
  type_partenariat?: string | null
  modele_remuneration?: string | null
  contact_referent_id?: string | null
  contact_referent_nom?: string | null
  date_debut_partenariat?: string | null
  // partagé fournisseur/partenaire
  statut_partenariat?: string | null
  conditions_commerciales?: string | null
  commentaire_partenariat?: string | null
  proprietaire_id: string | null
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
  proprietaire_id: string | null
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
  proprietaire_id: string | null
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
  issue_libelle?: string
  issue_couleur?: string | null
  proprietaire_id: string | null
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
  preavis_resiliation_jours: number | null
  statut: string
  compteurs: { id: string; numero_pdl: string; utilisation: string }[]
  proprietaire_id: string | null
}
