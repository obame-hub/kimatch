// Types alignés sur le vrai schéma Supabase (audité le 17/07/2026 via le Personal Access
// Token de Naoëlle). Les statuts/étapes/types sont des codes texte pilotés par les vraies
// tables de référence (statuts_signaux, etapes_recommandation, etc.) — voir useReferenceTable.

export interface Site {
  id: string
  nom: string
  compte_id: string
  compte_nom: string
  type_site: string
  /** Identifiant du type, en plus de son libellé : l'édition en place écrit la clé étrangère. */
  type_site_id: string | null
  adresse: string
  ville: string
  code_postal: string
  /** Rue (numéro + voie), distincte de `adresse` -- colonne ajoutée le 05/08/2026. */
  rue?: string | null
  departement_code?: string | null
  departement_nom?: string | null
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
  /** Rang de la version. Les versions d'une recommandation sont toujours triées du plus grand au
   *  plus petit : `versions[0]` est la plus récente (réunion du 12/08/2026). */
  numero_version: number | null
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
  /** Durées demandées PAR PDL (Tools: StepCharacteristics.pdlDurations), 3 max par compteur.
   * Clé = compteur_id. Vide tant que la version date d'avant la migration du 06/08/2026. */
  durees_par_compteur: Record<string, number[]>
  /** Union aplatie des durées de tous les PDL, triée -- ce que voit le fan-out fournisseur. */
  durees: number[]
  /** Types de prix demandés : « Fixe » et/ou « Indexé » (cumulables). */
  types_prix: string[]
  date_souhaitee: string | null
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
  /** Fournisseur consulté dont cette offre est la réponse — la clé qui range « la ou les offres
   *  différentes » sous chaque fournisseur (demande de Michel, 17/08/2026). */
  optimisation_fournisseur_id: string | null
  fournisseur_nom: string
  reference_offre: string | null
  nom: string | null
  description: string | null
  /** ENVOYEE → ACCUSE_RECEPTION → RELANCEE → INFO_COMPLEMENTAIRE_DEMANDEE → RECUE / REFUSEE.
   *  Vocabulaire de `statuts_consultations_fournisseurs` ; la colonne est un texte libre. */
  statut: string | null
  montant_annuel_ht: number | null
  montant_total_ht: number | null
  economie_annuelle_estimee: number | null
  economie_pourcentage: number | null
  duree_mois: number | null
  /** Fixe | Indexé — ce qui distingue deux offres du même fournisseur sur la même durée. */
  type_prix?: string | null
  /** Prix €/MWh tel que le fournisseur l'annonce. Donnée primaire de l'offre : le détail par PDL,
   *  quand il existe, la précise sans la remplacer. */
  prix_moyen_mwh?: number | null
  date_reception?: string | null
  date_validite?: string | null
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
  /**
   * Les offres de CE fournisseur : celle qu'il a envoyée, ou les plusieurs qu'il propose (24 et
   * 36 mois, fixe et indexé…).
   *
   * « Il faut qu'on voie sous chaque fournisseur consulté la ou les offres différentes, sinon la
   * version ne sert à rien » (Michel, 17/08/2026). Une ligne est créée par combinaison demandée dès
   * la consultation, en attente de réponse, puis complétée quand elle arrive.
   */
  offres: OffreFournisseur[]
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
  /** Sous-statut de l'étape Clôture : ACCEPTEE, REFUSEE ou EXPIREE. Colonne ajoutée par la
   *  migration des cycles de vie du 12/08/2026 ; nulle tant que la reco n'est pas clôturée. */
  finalite_cloture?: 'ACCEPTEE' | 'REFUSEE' | 'EXPIREE' | null
  /** Pourquoi la reco a été close. Obligatoire à la saisie ; NULL sur les lignes closes avant le 16/08/2026. */
  motif_cloture?: string | null
  date_reactivation?: string | null
  /** Renouvellement | Captation -- dérivé automatiquement du mix client/prospect des PDL, jamais
   * choisi manuellement (voir recommandations.ts). */
  type_opportunite?: string | null
  compteur_ids?: string[]
  /**
   * Champs chiffrés de l'affaire, repris de l'objet Opportunity de Salesforce le 15/08/2026
   * (migration 20260815150000). Ils manquaient tous : « le montant n'est pas affiché sur toutes
   * les recos » venait de là, l'interface l'affichait mais la donnée n'existait pas.
   * Nuls sur les 103 recommandations dont le nom existe en double des deux côtés, qui n'ont pas
   * pu être appariées sans risque de les attribuer au mauvais dossier.
   */
  montant?: number | null
  marge_nette_mwh?: number | null
  duree_mois?: number | null
  volume_contractuel?: number | null
  budget_ancienne_offre?: number | null
  budget_nouvelle_offre?: number | null
  difference_budgetaire?: number | null
  difference_budgetaire_pourcentage?: number | null
  commission_interne?: number | null
  commission_nette?: number | null
  remuneration_apporteur?: number | null
  fournisseur_compte_id?: string | null
  fournisseur_nom?: string | null
  /** Identifiant Salesforce de l'opportunité d'origine — évite de rapprocher par le nom. */
  id_salesforce?: string | null
  /**
   * Champs de la fiche Recommandation portée depuis la maquette de William
   * (migration 20260816180000).
   *
   * `reference` est la référence métier affichée en tête de fiche (« RC-2026-027 » dans le
   * design). La colonne existe mais elle est VIDE sur les 1703 recommandations : aucune référence
   * n'a jamais été attribuée. La fiche retombe donc sur le nom, et l'attribution des références
   * reste à décider (voir POINTS-A-ARBITRER.md).
   */
  reference?: string | null
  /** Ce que le client a demandé, dans ses termes. Distinct de `commentaire_interne`, qui est une
   *  note de travail et n'a pas à sortir au client. */
  contexte_demande?: string | null
  cout_prestation_estime?: number | null
  /** Coût facturé, une fois fixé. NULL tant que l'estimation n'a pas été arrêtée. */
  cout_prestation_reel?: number | null
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
  /** Auteur du mandat. C'est lui qu'on affiche et sur qui porte le filtre du tableau de bord :
   * Mandat__c n'a pas d'OwnerId côté Salesforce, le créateur est la seule responsabilité tracée. */
  cree_par_id: string | null
  createur_nom?: string | null
  courtier_codes: string[]
  /** Durée du mandat en mois (12/24/36/48, défaut 36) -- colonne ajoutée le 04/08/2026 pour le
   * flot Mandat calqué sur Tools. */
  duree_mois?: number | null
  date_creation?: string
  date_modification?: string
}

/** Rattachement d'un contact à un compte. Un contact peut en avoir plusieurs (table
 *  contacts_comptes, reprise de AccountContactRelation le 13/08/2026). */
export interface LienCompteContact {
  id: string
  nom: string
  /** Vrai pour le compte de rattachement principal, celui que porte `compte_id`. */
  relation_directe: boolean
}

export interface Contact {
  id: string
  /** Compte de rattachement principal. Ne suffit PAS à savoir où le contact apparaît : voir
   *  `comptes`, qui porte l'ensemble de ses rattachements. */
  compte_id: string
  compte_nom: string
  /** Tous les comptes auxquels le contact est rattaché, le principal inclus. */
  comptes: LienCompteContact[]
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
  /** `compte_id` sert à regrouper les sites par compte dans l'onglet Rattachements : un
   *  contact intervenant sur plusieurs comptes a des sites appartenant à des comptes différents. */
  sites: { id: string; nom: string; compte_id: string | null; fonction_sur_site: string | null }[]
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
  /** Critères d'éligibilité fournisseur (Tools: table `suppliers`) -- ajoutés le 04/08/2026 pour
   * le moteur d'éligibilité du flot Cotation. */
  partnership?: string | null
  intermediary?: string | null
  targets?: string[]
  energy_types?: string[]
  segments?: string[]
  tariffs?: string[]
  profiles?: string[]
  min_consumption?: number | null
  max_consumption?: number | null
  min_ellipro_score?: number | null
  max_ddf?: string | null
  max_dff?: string | null
  response_delay_days?: number | null
  update_delay_days?: number | null
  notice_days?: number | null
  partner_category?: string | null
  fournisseur_actif?: boolean
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
  /**
   * Adresse propre au point de livraison, quand elle diffère de celle du site — le cas dès
   * qu'une copropriété a plusieurs entrées. Colonnes ajoutées le 16/08/2026 ; vides, c'est
   * l'adresse du site qui fait foi.
   */
  adresse?: string | null
  code_postal?: string | null
  ville?: string | null
  /** Où le trouver sur place : « Local TGBT — Bât. A ». Distinct du commentaire libre. */
  localisation_site?: string | null
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
  /** Durée en mois, saisie libre -- date_fin est calculée à partir de date_debut + duree_mois,
   * jamais saisie directement (Tools: ContratWizard étape "Durée"). Ajouté le 05/08/2026. */
  duree_mois?: number | null
  /** Date de réception souhaitée du contrat signé, jour ouvré uniquement (Tools: ContratWizard
   * étape "Durée"). Ajoutée le 05/08/2026. */
  date_reception_souhaitee?: string | null
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
  /** marge_fixe (défaut) | prix_cible -- ajouté le 04/08/2026 pour le flot Contrat. */
  strategie_tarifaire?: string | null
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
