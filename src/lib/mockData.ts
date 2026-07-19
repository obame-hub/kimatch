import type { ActionItem, Compte, Compteur, Consommation, Contact, Contrat, DocumentItem, Interaction, Mandat, Recommandation, Signal, Site } from '@/types/domain'

export const mockSites: Site[] = [
  { id: 's1', nom: 'Résidence Les Tilleuls', compte_id: 'c1', compte_nom: 'Cabinet Durand', type_site: 'Copropriété', ville: 'Lyon', code_postal: '69003', nb_compteurs: 4, nb_signaux_ouverts: 2, statut: 'actif' },
  { id: 's2', nom: 'Siège social — Paris', compte_id: 'c2', compte_nom: 'Groupe Meridia', type_site: 'Immeuble tertiaire', ville: 'Paris', code_postal: '75008', nb_compteurs: 2, nb_signaux_ouverts: 1, statut: 'actif' },
  { id: 's3', nom: 'Entrepôt Nord', compte_id: 'c2', compte_nom: 'Groupe Meridia', type_site: 'Entrepôt', ville: 'Lille', code_postal: '59000', nb_compteurs: 3, nb_signaux_ouverts: 0, statut: 'actif' },
  { id: 's4', nom: 'Hôtel Belvédère', compte_id: 'c3', compte_nom: 'Hôtellerie du Sud', type_site: 'Hôtel', ville: 'Marseille', code_postal: '13001', nb_compteurs: 5, nb_signaux_ouverts: 1, statut: 'actif' },
  { id: 's5', nom: 'Résidence Le Parc', compte_id: 'c1', compte_nom: 'Cabinet Durand', type_site: 'Copropriété', ville: 'Lyon', code_postal: '69006', nb_compteurs: 2, nb_signaux_ouverts: 3, statut: 'actif' },
  { id: 's6', nom: 'Magasin Centre-ville', compte_id: 'c4', compte_nom: 'Retail Plus', type_site: 'Commerce', ville: 'Bordeaux', code_postal: '33000', nb_compteurs: 1, nb_signaux_ouverts: 0, statut: 'actif' },
]

// Codes de statut alignés sur la vraie table statuts_signaux (NOUVEAU, A_CONTACTER,
// CONTACTE, REPORTE, INTERET_CONFIRME, REFUSE, TRANSFORME, CLOTURE).
export const mockSignaux: Signal[] = [
  { id: 'sig1', site_id: 's1', site_nom: 'Résidence Les Tilleuls', type_signal: 'Échéance de contrat', statut: 'A_CONTACTER', priorite: 'haute', conseiller: 'Naoëlle Ghouma', date_creation: '2026-07-10', description: 'Contrat électricité parties communes arrivant à échéance dans 45 jours.' },
  { id: 'sig2', site_id: 's2', site_nom: 'Siège social — Paris', type_signal: 'Opportunité fournisseur', statut: 'INTERET_CONFIRME', priorite: 'normale', conseiller: 'William Goupil', date_creation: '2026-07-08', description: 'Nouvelle offre marché plus compétitive détectée sur le segment tertiaire.' },
  { id: 'sig3', site_id: 's5', site_nom: 'Résidence Le Parc', type_signal: 'Nouvelle facture', statut: 'NOUVEAU', priorite: 'normale', conseiller: 'Naoëlle Ghouma', date_creation: '2026-07-14', description: 'Hausse de consommation inhabituelle détectée sur le compteur chaufferie.' },
  { id: 'sig4', site_id: 's4', site_nom: 'Hôtel Belvédère', type_signal: 'Demande du client', statut: 'CONTACTE', priorite: 'haute', conseiller: 'William Goupil', date_creation: '2026-07-12', description: 'Le directeur de site demande un audit énergétique complet.' },
  { id: 'sig5', site_id: 's1', site_nom: 'Résidence Les Tilleuls', type_signal: 'Préavis', statut: 'A_CONTACTER', priorite: 'normale', conseiller: 'Naoëlle Ghouma', date_creation: '2026-07-15', description: 'Période de préavis ouverte sur le contrat gaz chaufferie.' },
]

// Codes d'étape alignés sur la vraie table etapes_recommandation (A_PREPARER, EN_ANALYSE,
// EN_PREPARATION, PRETE, PRESENTEE, ACTUALISATION, ACCEPTEE, REFUSEE, CLOTUREE) et de
// statut de version sur statuts_versions_recommandation (BROUILLON, A_VALIDER, VALIDEE,
// PRESENTEE, REMPLACEE, ACCEPTEE, REFUSEE, EXPIREE, ARCHIVEE).
export const mockRecommandations: Recommandation[] = [
  {
    id: 'r1',
    titre: 'Optimisation tarifaire — Siège Meridia',
    compte_id: 'c2',
    compte_nom: 'Groupe Meridia',
    sites: [{ id: 's2', nom: 'Siège social — Paris' }],
    etape: 'PRESENTEE',
    conseiller: 'William Goupil',
    objectif: 'Optimisation tarifaire',
    description: 'Le contrat électricité actuel arrive à échéance et le marché propose des conditions plus favorables.',
    priorite: 2,
    commentaire_interne: 'Client sensible au prix, insister sur la sécurisation du prix sur 24 mois.',
    date_creation: '2026-06-28',
    versions: [
      {
        id: 'v1', numero: 1, statut: 'PRESENTEE', motif_creation: 'Analyse initiale', date_creation: '2026-07-05',
        gains_estimes: 18400, resume: 'Renégociation puissance souscrite + mise en concurrence.',
        contenu: 'Comparatif de 3 offres fournisseurs sur 24 mois, avec réduction de la puissance souscrite de 250 à 210 kVA.',
        economie_pourcentage: 12.5, niveau_confiance: 85, date_validite_offres: '2026-08-05', document_url: null,
      },
    ],
  },
  {
    id: 'r2',
    titre: 'Renouvellement contrat — Résidence Les Tilleuls',
    compte_id: 'c1',
    compte_nom: 'Cabinet Durand',
    sites: [{ id: 's1', nom: 'Résidence Les Tilleuls' }],
    etape: 'EN_ANALYSE',
    conseiller: 'Naoëlle Ghouma',
    objectif: 'Renouvellement de contrat',
    description: "Le contrat des parties communes arrive à échéance dans 45 jours, étude de renouvellement en cours.",
    priorite: 1,
    commentaire_interne: '',
    date_creation: '2026-07-11',
    versions: [
      {
        id: 'v2', numero: 1, statut: 'A_VALIDER', motif_creation: 'Signal échéance de contrat', date_creation: '2026-07-11',
        gains_estimes: null, resume: "Étude en cours sur l'échéance des parties communes.",
        contenu: null, economie_pourcentage: null, niveau_confiance: null, date_validite_offres: null, document_url: null,
      },
    ],
  },
  {
    id: 'r3',
    titre: 'Étude énergétique — Hôtel Belvédère',
    compte_id: 'c3',
    compte_nom: 'Hôtellerie du Sud',
    sites: [{ id: 's4', nom: 'Hôtel Belvédère' }],
    etape: 'A_PREPARER',
    conseiller: 'William Goupil',
    objectif: 'Étude énergétique',
    description: 'Le directeur de site souhaite un audit complet de la consommation énergétique de l\'hôtel.',
    priorite: 3,
    commentaire_interne: '',
    date_creation: '2026-07-13',
    versions: [],
  },
]

// Codes alignés sur statuts_actions (A_FAIRE, EN_COURS, EN_ATTENTE, TERMINEE, ANNULEE).
export const mockActions: ActionItem[] = [
  { id: 'a1', type_action: 'Contacter le client', statut: 'A_FAIRE', responsable: 'Naoëlle Ghouma', echeance: '2026-07-17', cible_label: 'Résidence Les Tilleuls', site_id: 's1' },
  { id: 'a2', type_action: 'Préparer le mandat', statut: 'A_FAIRE', responsable: 'William Goupil', echeance: '2026-07-18', cible_label: 'Hôtel Belvédère', site_id: 's4' },
  { id: 'a3', type_action: 'Présenter la recommandation', statut: 'EN_COURS', responsable: 'William Goupil', echeance: '2026-07-16', cible_label: 'Siège social — Paris', site_id: 's2' },
  { id: 'a4', type_action: 'Relancer le client', statut: 'A_FAIRE', responsable: 'Naoëlle Ghouma', echeance: '2026-07-20', cible_label: 'Résidence Le Parc', site_id: 's5' },
]

// Codes alignés sur statuts_mandats (A_PREPARER, ENVOYE, EN_SIGNATURE, SIGNE, ACTIF, EXPIRE, REVOQUE).
export const mockMandats: Mandat[] = [
  { id: 'm1', compte_id: 'c1', compte_nom: 'Cabinet Durand', statut: 'ACTIF', date_signature: '2026-05-02', nb_sites_couverts: 2, contact_signataire_id: 'ct1', contact_signataire_nom: 'Marc Lefebvre' },
  { id: 'm2', compte_id: 'c2', compte_nom: 'Groupe Meridia', statut: 'ACTIF', date_signature: '2026-03-14', nb_sites_couverts: 2, contact_signataire_id: 'ct2', contact_signataire_nom: 'Sophie Nguyen' },
  { id: 'm3', compte_id: 'c3', compte_nom: 'Hôtellerie du Sud', statut: 'EN_SIGNATURE', date_signature: null, nb_sites_couverts: 1 },
]

export const mockContacts: Contact[] = [
  { id: 'ct1', compte_id: 'c1', compte_nom: 'Cabinet Durand', civilite: 'M.', prenom: 'Marc', nom: 'Lefebvre', fonction: 'Syndic', telephone: '01 23 45 67 89', email: 'marc.lefebvre@cabinet-durand.fr', contact_principal: true, actif: true, sites: [{ id: 's1', nom: 'Résidence Les Tilleuls', fonction_sur_site: 'Contact principal' }] },
  { id: 'ct2', compte_id: 'c2', compte_nom: 'Groupe Meridia', civilite: 'Mme', prenom: 'Sophie', nom: 'Nguyen', fonction: 'Directrice des achats', telephone: '01 98 76 54 32', email: 's.nguyen@meridia.fr', contact_principal: true, actif: true, sites: [{ id: 's2', nom: 'Siège social — Paris', fonction_sur_site: null }] },
  { id: 'ct3', compte_id: 'c3', compte_nom: 'Hôtellerie du Sud', civilite: 'M.', prenom: 'Antoine', nom: 'Perez', fonction: 'Directeur technique', telephone: '04 91 22 33 44', email: 'a.perez@hotellerie-sud.fr', contact_principal: false, actif: true, sites: [{ id: 's4', nom: 'Hôtel Belvédère', fonction_sur_site: 'Contact site' }] },
]

// Les SIREN ci-dessous sont fictifs sauf celui d'EDF (réel, pour pouvoir démontrer
// un vrai appel Ellisphere) — à remplacer par les vrais SIREN une fois les comptes réels importés.
export const mockComptes: Compte[] = [
  { id: 'c1', nom: 'Cabinet Durand', type_compte: 'client', segment: 'Syndic', nb_sites: 2, ville: 'Lyon', siren: '123456789', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null, segment_compte_libelle: 'Grand compte', conseiller_referent_nom: 'Naoëlle Ghouma', origine_acquisition: 'Recommandation', mandat_cadre_actif: true },
  { id: 'c2', nom: 'Groupe Meridia', type_compte: 'client', segment: 'Entreprise', nb_sites: 2, ville: 'Paris', siren: '234567891', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c3', nom: 'Hôtellerie du Sud', type_compte: 'client', segment: 'Hôtellerie', nb_sites: 1, ville: 'Marseille', siren: '345678912', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c4', nom: 'Retail Plus', type_compte: 'client', segment: 'Commerce', nb_sites: 1, ville: 'Bordeaux', siren: '456789123', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c5', nom: 'EDF', type_compte: 'fournisseur', segment: 'Fournisseur historique', nb_sites: 0, ville: 'Paris', siren: '552081317', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null, fournit_electricite: true, fournit_gaz: false, statut_partenariat: 'ACTIF' },
  { id: 'c6', nom: 'ENGIE', type_compte: 'fournisseur', segment: 'Fournisseur', nb_sites: 0, ville: 'Courbevoie', siren: '542107651', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null, fournit_electricite: false, fournit_gaz: true, statut_partenariat: 'ACTIF' },
  { id: 'c7', nom: 'Partenaire Immo Conseil', type_compte: 'partenaire', segment: 'Apporteur d’affaires', nb_sites: 0, ville: 'Lyon', siren: '567891234', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null, type_partenariat: 'Apporteur d’affaires', modele_remuneration: 'Commission 5%', statut_partenariat: 'ACTIF', date_debut_partenariat: '2026-02-01' },
]

export const mockCompteurs: Compteur[] = [
  { id: 'cp1', site_id: 's1', site_nom: 'Résidence Les Tilleuls', type_energie: 'electricite', numero_pdl: 'PDL-30001245', utilisation: 'Parties communes', statut: 'actif', consommation_annuelle_mwh: 12.4, synchro_eneo: true, date_derniere_synchro_eneo: '2026-07-10T09:00:00', segment: 'C5', tension: 'BT', tarif_distribution: 'BTINFCU4' },
  { id: 'cp2', site_id: 's1', site_nom: 'Résidence Les Tilleuls', type_energie: 'gaz', numero_pdl: 'GRD-88213456', utilisation: 'Chaufferie', statut: 'actif', consommation_annuelle_mwh: 34.8, synchro_eneo: false, date_derniere_synchro_eneo: null, car_mwh: 34.8, profil_consommation: 'P011', zone_tarifaire: 'Zone B' },
  { id: 'cp3', site_id: 's2', site_nom: 'Siège social — Paris', type_energie: 'electricite', numero_pdl: 'PDL-30009981', utilisation: 'Bureaux', statut: 'actif', consommation_annuelle_mwh: 68.8, synchro_eneo: true, date_derniere_synchro_eneo: '2026-07-15T14:20:00', segment: 'C4', tension: 'BT', tarif_distribution: 'BTSUPCU4' },
  { id: 'cp4', site_id: 's3', site_nom: 'Entrepôt Nord', type_energie: 'electricite', numero_pdl: 'PDL-30012783', utilisation: 'Entrepôt principal', statut: 'actif', consommation_annuelle_mwh: null, synchro_eneo: false, date_derniere_synchro_eneo: null },
  { id: 'cp5', site_id: 's4', site_nom: 'Hôtel Belvédère', type_energie: 'gaz', numero_pdl: 'GRD-88245901', utilisation: 'Cuisine + chaufferie', statut: 'actif', consommation_annuelle_mwh: null, synchro_eneo: false, date_derniere_synchro_eneo: null },
  { id: 'cp6', site_id: 's5', site_nom: 'Résidence Le Parc', type_energie: 'electricite', numero_pdl: 'PDL-30015567', utilisation: 'Ascenseurs', statut: 'actif', consommation_annuelle_mwh: null, synchro_eneo: false, date_derniere_synchro_eneo: null },
]

export const mockConsommations: Consommation[] = [
  { id: 'cs1', compteur_id: 'cp1', date_debut_periode: '2026-05-01', date_fin_periode: '2026-05-31', quantite: 1.05, unite: 'MWh', poste_tarifaire: 'TOTAL', type_valeur: 'MESUREE', source: 'Enedis', commentaire: null },
  { id: 'cs2', compteur_id: 'cp1', date_debut_periode: '2026-06-01', date_fin_periode: '2026-06-30', quantite: 0.98, unite: 'MWh', poste_tarifaire: 'TOTAL', type_valeur: 'MESUREE', source: 'Enedis', commentaire: null },
  { id: 'cs3', compteur_id: 'cp1', date_debut_periode: '2026-07-01', date_fin_periode: '2026-07-31', quantite: 1.12, unite: 'MWh', poste_tarifaire: 'TOTAL', type_valeur: 'MESUREE', source: 'Enedis', commentaire: null },
  { id: 'cs4', compteur_id: 'cp2', date_debut_periode: '2026-06-01', date_fin_periode: '2026-06-30', quantite: 2.9, unite: 'MWh', poste_tarifaire: 'TOTAL', type_valeur: 'ESTIMEE', source: 'GRDF', commentaire: null },
]

export const mockDocuments: DocumentItem[] = [
  { id: 'd1', nom: 'Mandat signé — Cabinet Durand.pdf', nom_fichier: 'mandat-signe-cabinet-durand.pdf', url: 'https://example.com/documents/mandat-signe-cabinet-durand.pdf', type_document: 'Mandat', entite_type: 'compte', entite_id: 'c1', objet_lie: 'Cabinet Durand', auteur: 'Naoëlle Ghouma', date_creation: '2026-05-02' },
  { id: 'd2', nom: 'Recommandation v1 — Siège Meridia.pdf', nom_fichier: 'recommandation-v1-siege-meridia.pdf', url: 'https://example.com/documents/recommandation-v1-siege-meridia.pdf', type_document: 'Recommandation', entite_type: 'recommandation', entite_id: 'r1', objet_lie: 'Optimisation tarifaire — Siège Meridia', auteur: 'William Goupil', date_creation: '2026-07-05' },
  { id: 'd3', nom: 'Facture juin 2026 — Résidence Le Parc.pdf', nom_fichier: 'facture-juin-2026-residence-le-parc.pdf', url: 'https://example.com/documents/facture-juin-2026-residence-le-parc.pdf', type_document: 'Facture', entite_type: 'site', entite_id: 's5', objet_lie: 'Résidence Le Parc', auteur: 'Système', date_creation: '2026-07-01' },
  { id: 'd4', nom: 'Offre EDF — Hôtel Belvédère.pdf', nom_fichier: 'offre-edf-hotel-belvedere.pdf', url: 'https://example.com/documents/offre-edf-hotel-belvedere.pdf', type_document: 'Offre fournisseur', entite_type: 'site', entite_id: 's4', objet_lie: 'Hôtel Belvédère', auteur: 'William Goupil', date_creation: '2026-07-13' },
  { id: 'd5', nom: 'Contrat gaz — Résidence Les Tilleuls.pdf', nom_fichier: 'contrat-gaz-residence-les-tilleuls.pdf', url: 'https://example.com/documents/contrat-gaz-residence-les-tilleuls.pdf', type_document: 'Contrat', entite_type: 'site', entite_id: 's1', objet_lie: 'Résidence Les Tilleuls', auteur: 'Naoëlle Ghouma', date_creation: '2026-06-20' },
]

export const mockInteractions: Interaction[] = [
  { id: 'i1', type_interaction: 'Appel', date_interaction: '2026-07-15T10:30:00', sens: 'sortant', objet: 'Point sur le renouvellement', resume: "Le syndic confirme vouloir étudier le renouvellement, en attente de l'analyse.", resultat: 'Intérêt confirmé', auteur: 'Naoëlle Ghouma', compte_id: 'c1', compte_nom: 'Cabinet Durand', site_id: 's1', site_nom: 'Résidence Les Tilleuls', contact_id: null, contact_nom: '' },
  { id: 'i2', type_interaction: 'Email', date_interaction: '2026-07-13T14:00:00', sens: 'entrant', objet: 'Demande d\'audit énergétique', resume: "Le directeur de l'hôtel demande un audit énergétique complet de l'établissement.", resultat: null, auteur: 'William Goupil', compte_id: 'c3', compte_nom: 'Hôtellerie du Sud', site_id: 's4', site_nom: 'Hôtel Belvédère', contact_id: null, contact_nom: '' },
  { id: 'i3', type_interaction: 'Réunion', date_interaction: '2026-07-08T09:00:00', sens: null, objet: 'Présentation de la recommandation', resume: 'Présentation de la première version de la recommandation tarifaire au client.', resultat: 'À actualiser', auteur: 'William Goupil', compte_id: 'c2', compte_nom: 'Groupe Meridia', site_id: 's2', site_nom: 'Siège social — Paris', contact_id: null, contact_nom: '' },
]

export const mockContrats: Contrat[] = [
  { id: 'cn1', site_id: 's1', site_nom: 'Résidence Les Tilleuls', fournisseur_compte_id: 'c5', fournisseur_nom: 'EDF', type_energie: 'electricite', reference_fournisseur: 'EDF-778124', date_debut: '2024-09-01', date_fin: '2026-08-31', statut: 'ACTIF', compteurs: [{ id: 'cp1', numero_pdl: 'PDL-30001245', utilisation: 'Parties communes' }] },
  { id: 'cn2', site_id: 's1', site_nom: 'Résidence Les Tilleuls', fournisseur_compte_id: 'c6', fournisseur_nom: 'ENGIE', type_energie: 'gaz', reference_fournisseur: 'ENG-33291', date_debut: '2023-11-01', date_fin: '2026-10-31', statut: 'ACTIF', compteurs: [{ id: 'cp2', numero_pdl: 'GRD-88213456', utilisation: 'Chaufferie' }] },
  { id: 'cn3', site_id: 's2', site_nom: 'Siège social — Paris', fournisseur_compte_id: 'c5', fournisseur_nom: 'EDF', type_energie: 'electricite', reference_fournisseur: 'EDF-445982', date_debut: '2025-01-01', date_fin: '2026-12-31', statut: 'ACTIF', compteurs: [{ id: 'cp3', numero_pdl: 'PDL-30009981', utilisation: 'Bureaux' }] },
]
