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
  proprietaire_nom?: string | null
  date_creation?: string
  date_modification?: string
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
  /** Recommandation liee (Case.Opportunity__c en Salesforce) -- ajoute le 31/07/2026. */
  recommandation_id?: string | null
  recommandation_nom?: string | null
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
  /** Contact de la cotation (Cotation__c.Contact__c en Salesforce) -- ajoute le 31/07/2026. */
  contact_id?: string | null
  contact_nom?: string | null
}

export interface OffreFournisseurCompteur {
  id: string
  compteur_id: string
  compteur_label: string
  consommation_annuelle_reference_mwh: number | null
  cout_fourniture_annuel_ht: number | null
  cout_acheminement_annuel_ht: number | null
  cout_taxes_annuel: number | null
  cout_total_annuel_estime_ht: number | null
  economie_annuelle_estimee: number | null
  economie_pourcentage: number | null
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
  details_par_compteur: OffreFournisseurCompteur[]
}

export interface SuiviConsultationFournisseur {
  id: string
  statut: string
  date_evenement: string
  commentaire: string | null
  auteur_nom: string | null
}

export interface FournisseurConsulte {
  id: string
  fournisseur_compte_id: string
  fournisseur_nom: string
  date_creation: string
  statut_actuel: string | null
  historique: SuiviConsultationFournisseur[]
}

export interface Optimisation {
  id: string
  nom: string | null
  type_optimisation: string
  type_optimisation_code: string
  description: string | null
  resultat_attendu: string | null
  gain_estime_annuel: number | null
  cout_estime: number | null
  roi_mois: number | null
  priorite: number | null
  est_retenue: boolean
  offres: OffreFournisseur[]
  fournisseurs_consultes: FournisseurConsulte[]
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
  /** Contact signataire (Opportunity.Contact__c en Salesforce) -- ajoute le 31/07/2026, jamais
   * affiche a l'ecran avant ce meme jour (colonne presente en base, invisible cote UI). */
  contact_signataire_id?: string | null
  contact_signataire_nom?: string | null
  contact_signataire_email?: string | null
  contact_signataire_telephone?: string | null
  /** Marges (Opportunity.Amount / Montant_commission_nette_kiwee__c / Montant_commission_interne__c /
   * R_mun_ration_ap__c en Salesforce) -- ajoute le 31/07/2026. */
  marge_brute?: number | null
  marge_nette?: number | null
  marge_nette_coeff?: number | null
  marge_apporteur?: number | null
  /** Champs ajoutés le 04/08/2026 pour le flot Opportunité calqué sur Tools. */
  type_energie?: 'electricite' | 'gaz' | null
  date_cloture?: string | null
  /** Renouvellement | Captation -- dérivé automatiquement du mix client/prospect des PDL, jamais
   * choisi manuellement (voir recommandations.ts). */
  type_opportunite?: string | null
  compteur_ids?: string[]
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
  id_salesforce: string | null
  compte_id: string
  compte_nom: string
  statut: string
  date_signature: string | null
  date_envoi: string | null
  date_debut_validite: string | null
  date_fin_validite: string | null
  nb_sites_couverts: number
  site_ids: string[]
  compteur_ids: string[]
  contact_signataire_id?: string | null
  contact_signataire_nom?: string
  docusign_envelope_id?: string | null
  proprietaire_id: string | null
  proprietaire_nom?: string | null
  courtier_codes: string[]
  /** Durée du mandat en mois (12/24/36/48, défaut 36) -- colonne ajoutée le 04/08/2026 pour le
   * flot Mandat calqué sur Tools. */
  duree_mois?: number | null
  date_creation?: string
  date_modification?: string
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
  telephone_mobile: string | null
  email: string | null
  /** Décisionnaire | Administratif | Conseil syndical (syndics uniquement) — voir contactRoles.ts. */
  role: string | null
  contact_principal: boolean
  actif: boolean
  sites: { id: string; nom: string; fonction_sur_site: string | null }[]
  proprietaire_id: string | null
  proprietaire_nom?: string | null
  linkedin_url: string | null
  disponibilites: string | null
  type_canal_communication_id: string | null
  canal_communication: string | null
  date_creation?: string
  date_modification?: string
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
  apporteur_partenaire_id?: string | null
  // comptes_fournisseurs (type_compte === 'fournisseur')
  fournit_electricite?: boolean
  fournit_gaz?: boolean
  contact_commercial_id?: string | null
  contact_commercial_nom?: string | null
  limite_ellipro?: number | null
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
  proprietaire_nom?: string | null
  date_creation?: string
  date_modification?: string
  // Identite (fiche Compte, handoff design William 30/07/2026) -- colonnes ajoutees le 30/07/2026,
  // toutes nullable en attendant d'etre renseignees compte par compte.
  code_naf?: string | null
  libelle_ape?: string | null
  rue?: string | null
  code_postal?: string | null
  departement_code?: string | null
  departement_nom?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface Compteur {
  id: string
  site_id: string
  site_nom: string
  type_energie: 'electricite' | 'gaz'
  numero_pdl: string
  utilisation: string
  type_utilisation_compteur_id: string | null
  type_utilisation_compteur: string | null
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
  proprietaire_nom?: string | null
  date_creation?: string
  date_modification?: string
  /** Fournisseur avant KiWee (PDL.Fournisseur_actuel__c en Salesforce) -- ajoute le 31/07/2026. */
  fournisseur_actuel_compte_id?: string | null
  fournisseur_actuel_nom?: string | null
  /** Contacts du compteur (PDL.Responsable__c / Contact_conseil_syndical__c en Salesforce) --
   * colonnes ajoutees le 31/07/2026, jamais affichees dans l'UI avant ce meme jour. */
  responsable_contact_id?: string | null
  responsable_contact_nom?: string | null
  contact_conseil_syndical_id?: string | null
  contact_conseil_syndical_nom?: string | null
  /** Échéance du contrat fournisseur actuel sur ce PDL (optionnelle) -- colonne ajoutée le
   * 04/08/2026 pour le flot PDL calqué sur Tools. */
  date_echeance?: string | null
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
  /** Entite "Related To" de Salesforce (WhatId) -- recommandation ou signal lie a l'interaction,
   * ajoute le 31/07/2026 pour reproduire le fil d'activite Salesforce (auteur + contact + related
   * to, tous cliquables) que les commerciaux connaissent. */
  recommandation_id?: string | null
  recommandation_nom?: string | null
  signal_id?: string | null
  signal_nom?: string | null
  /** Detail d'appel Aircall (Task Salesforce) -- ajoute le 31/07/2026, jamais repris avant. */
  duree_appel_secondes?: number | null
  appel_manque?: boolean | null
  messagerie_vocale?: boolean | null
  numero_correspondant?: string | null
  decroche_par?: string | null
  enregistrement_url?: string | null
}

export interface Contrat {
  id: string
  id_salesforce: string | null
  /** Lien direct et independant vers le compte (decision Michel/William 31/07/2026) --
   * source de verite de "a quel compte appartient ce contrat", pas site_id. */
  compte_id: string | null
  compte_nom?: string
  /** Deductible via les compteurs, garde pour affichage/compat -- plus la source de verite. */
  site_id: string | null
  site_nom: string
  fournisseur_compte_id: string | null
  fournisseur_nom: string
  type_energie: 'electricite' | 'gaz'
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  preavis_resiliation_jours: number | null
  statut: string
  compteurs: { id: string; contrat_compteur_id: string | null; numero_pdl: string; utilisation: string }[]
  proprietaire_id: string | null
  proprietaire_nom?: string | null
  contact_signataire_id?: string | null
  contact_signataire_nom?: string
  docusign_envelope_id: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  statut_signature: string | null
  date_creation?: string
  date_modification?: string
  // Clauses + pricing (fiche Contrat, handoff design William 30/07/2026) -- colonnes ajoutees
  // le 30/07/2026, toutes nullable en attendant d'etre renseignees contrat par contrat.
  prix_molecule_eur_mwh?: number | null
  type_prix?: string | null
  clause_tacite_reconduction?: boolean | null
  clause_renegociation_anticipee?: boolean | null
  clause_engagement_consommation?: boolean | null
  clause_energie_verte?: boolean | null
  clause_indexation_prix?: boolean | null
  clause_penalites_resiliation?: boolean | null
  /** Interlocuteur pricing (Contract.Interlocuteur_pricing__c en Salesforce) -- ajoute le 31/07/2026. */
  interlocuteur_pricing_contact_id?: string | null
  interlocuteur_pricing_nom?: string | null
}

export interface TarifContratCompteur {
  id: string
  contrat_compteur_id: string
  type_formule_tarifaire_id: string | null
  formule_code: string | null
  formule_libelle: string | null
  indexation: string | null
  prix_base_eur_mwh: number | null
  prix_hp_eur_mwh: number | null
  prix_hc_eur_mwh: number | null
  prix_pointe_eur_mwh: number | null
  prix_hph_eur_mwh: number | null
  prix_hch_eur_mwh: number | null
  prix_hpe_eur_mwh: number | null
  prix_hce_eur_mwh: number | null
  prix_gaz_eur_mwh: number | null
  abonnement_mensuel_ht: number | null
  abonnement_annuel_ht: number | null
  date_debut_validite: string | null
  date_fin_validite: string | null
  actif: boolean
}
