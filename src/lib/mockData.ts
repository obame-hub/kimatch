import type { ActionItem, Compte, Compteur, DocumentItem, Mandat, Recommandation, Signal, Site } from '@/types/domain'

export const mockSites: Site[] = [
  { id: 's1', nom: 'Résidence Les Tilleuls', compte_nom: 'Cabinet Durand', type_site: 'Copropriété', ville: 'Lyon', code_postal: '69003', nb_compteurs: 4, nb_signaux_ouverts: 2, statut: 'actif' },
  { id: 's2', nom: 'Siège social — Paris', compte_nom: 'Groupe Meridia', type_site: 'Immeuble tertiaire', ville: 'Paris', code_postal: '75008', nb_compteurs: 2, nb_signaux_ouverts: 1, statut: 'actif' },
  { id: 's3', nom: 'Entrepôt Nord', compte_nom: 'Groupe Meridia', type_site: 'Entrepôt', ville: 'Lille', code_postal: '59000', nb_compteurs: 3, nb_signaux_ouverts: 0, statut: 'actif' },
  { id: 's4', nom: 'Hôtel Belvédère', compte_nom: 'Hôtellerie du Sud', type_site: 'Hôtel', ville: 'Marseille', code_postal: '13001', nb_compteurs: 5, nb_signaux_ouverts: 1, statut: 'actif' },
  { id: 's5', nom: 'Résidence Le Parc', compte_nom: 'Cabinet Durand', type_site: 'Copropriété', ville: 'Lyon', code_postal: '69006', nb_compteurs: 2, nb_signaux_ouverts: 3, statut: 'actif' },
  { id: 's6', nom: 'Magasin Centre-ville', compte_nom: 'Retail Plus', type_site: 'Commerce', ville: 'Bordeaux', code_postal: '33000', nb_compteurs: 1, nb_signaux_ouverts: 0, statut: 'actif' },
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
    compte_nom: 'Groupe Meridia',
    sites: ['Siège social — Paris'],
    etape: 'PRESENTEE',
    conseiller: 'William Goupil',
    objectif: 'Optimisation tarifaire',
    date_creation: '2026-06-28',
    versions: [
      { id: 'v1', numero: 1, statut: 'PRESENTEE', motif_creation: 'Analyse initiale', date_creation: '2026-07-05', gains_estimes: 18400, resume: 'Renégociation puissance souscrite + mise en concurrence.' },
    ],
  },
  {
    id: 'r2',
    titre: 'Renouvellement contrat — Résidence Les Tilleuls',
    compte_nom: 'Cabinet Durand',
    sites: ['Résidence Les Tilleuls'],
    etape: 'EN_ANALYSE',
    conseiller: 'Naoëlle Ghouma',
    objectif: 'Renouvellement de contrat',
    date_creation: '2026-07-11',
    versions: [
      { id: 'v2', numero: 1, statut: 'A_VALIDER', motif_creation: 'Signal échéance de contrat', date_creation: '2026-07-11', gains_estimes: null, resume: "Étude en cours sur l'échéance des parties communes." },
    ],
  },
  {
    id: 'r3',
    titre: 'Étude énergétique — Hôtel Belvédère',
    compte_nom: 'Hôtellerie du Sud',
    sites: ['Hôtel Belvédère'],
    etape: 'A_PREPARER',
    conseiller: 'William Goupil',
    objectif: 'Étude énergétique',
    date_creation: '2026-07-13',
    versions: [],
  },
]

// Codes alignés sur statuts_actions (A_FAIRE, EN_COURS, EN_ATTENTE, TERMINEE, ANNULEE).
export const mockActions: ActionItem[] = [
  { id: 'a1', type_action: 'Contacter le client', statut: 'A_FAIRE', responsable: 'Naoëlle Ghouma', echeance: '2026-07-17', cible_label: 'Résidence Les Tilleuls' },
  { id: 'a2', type_action: 'Préparer le mandat', statut: 'A_FAIRE', responsable: 'William Goupil', echeance: '2026-07-18', cible_label: 'Hôtel Belvédère' },
  { id: 'a3', type_action: 'Présenter la recommandation', statut: 'EN_COURS', responsable: 'William Goupil', echeance: '2026-07-16', cible_label: 'Siège social — Paris' },
  { id: 'a4', type_action: 'Relancer le client', statut: 'A_FAIRE', responsable: 'Naoëlle Ghouma', echeance: '2026-07-20', cible_label: 'Résidence Le Parc' },
]

// Codes alignés sur statuts_mandats (A_PREPARER, ENVOYE, EN_SIGNATURE, SIGNE, ACTIF, EXPIRE, REVOQUE).
export const mockMandats: Mandat[] = [
  { id: 'm1', compte_nom: 'Cabinet Durand', statut: 'ACTIF', date_signature: '2026-05-02', nb_sites_couverts: 2 },
  { id: 'm2', compte_nom: 'Groupe Meridia', statut: 'ACTIF', date_signature: '2026-03-14', nb_sites_couverts: 2 },
  { id: 'm3', compte_nom: 'Hôtellerie du Sud', statut: 'EN_SIGNATURE', date_signature: null, nb_sites_couverts: 1 },
]

// Les SIREN ci-dessous sont fictifs sauf celui d'EDF (réel, pour pouvoir démontrer
// un vrai appel Ellisphere) — à remplacer par les vrais SIREN une fois les comptes réels importés.
export const mockComptes: Compte[] = [
  { id: 'c1', nom: 'Cabinet Durand', type_compte: 'client', segment: 'Syndic', nb_sites: 2, ville: 'Lyon', siren: '123456789', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c2', nom: 'Groupe Meridia', type_compte: 'client', segment: 'Entreprise', nb_sites: 2, ville: 'Paris', siren: '234567891', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c3', nom: 'Hôtellerie du Sud', type_compte: 'client', segment: 'Hôtellerie', nb_sites: 1, ville: 'Marseille', siren: '345678912', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c4', nom: 'Retail Plus', type_compte: 'client', segment: 'Commerce', nb_sites: 1, ville: 'Bordeaux', siren: '456789123', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c5', nom: 'EDF', type_compte: 'fournisseur', segment: 'Fournisseur historique', nb_sites: 0, ville: 'Paris', siren: '552081317', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c6', nom: 'ENGIE', type_compte: 'fournisseur', segment: 'Fournisseur', nb_sites: 0, ville: 'Courbevoie', siren: '542107651', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
  { id: 'c7', nom: 'Partenaire Immo Conseil', type_compte: 'partenaire', segment: 'Apporteur d’affaires', nb_sites: 0, ville: 'Lyon', siren: '567891234', score_ellipro: null, score_ellipro_scale: null, score_ellipro_maj: null },
]

export const mockCompteurs: Compteur[] = [
  { id: 'cp1', site_id: 's1', site_nom: 'Résidence Les Tilleuls', type_energie: 'electricite', numero_pdl: 'PDL-30001245', utilisation: 'Parties communes', statut: 'actif' },
  { id: 'cp2', site_id: 's1', site_nom: 'Résidence Les Tilleuls', type_energie: 'gaz', numero_pdl: 'GRD-88213456', utilisation: 'Chaufferie', statut: 'actif' },
  { id: 'cp3', site_id: 's2', site_nom: 'Siège social — Paris', type_energie: 'electricite', numero_pdl: 'PDL-30009981', utilisation: 'Bureaux', statut: 'actif' },
  { id: 'cp4', site_id: 's3', site_nom: 'Entrepôt Nord', type_energie: 'electricite', numero_pdl: 'PDL-30012783', utilisation: 'Entrepôt principal', statut: 'actif' },
  { id: 'cp5', site_id: 's4', site_nom: 'Hôtel Belvédère', type_energie: 'gaz', numero_pdl: 'GRD-88245901', utilisation: 'Cuisine + chaufferie', statut: 'actif' },
  { id: 'cp6', site_id: 's5', site_nom: 'Résidence Le Parc', type_energie: 'electricite', numero_pdl: 'PDL-30015567', utilisation: 'Ascenseurs', statut: 'actif' },
]

export const mockDocuments: DocumentItem[] = [
  { id: 'd1', nom: 'Mandat signé — Cabinet Durand.pdf', type_document: 'Mandat', objet_lie: 'Cabinet Durand', auteur: 'Naoëlle Ghouma', date_creation: '2026-05-02' },
  { id: 'd2', nom: 'Recommandation v1 — Siège Meridia.pdf', type_document: 'Recommandation', objet_lie: 'Optimisation tarifaire — Siège Meridia', auteur: 'William Goupil', date_creation: '2026-07-05' },
  { id: 'd3', nom: 'Facture juin 2026 — Résidence Le Parc.pdf', type_document: 'Facture', objet_lie: 'Résidence Le Parc', auteur: 'Système', date_creation: '2026-07-01' },
  { id: 'd4', nom: 'Offre EDF — Hôtel Belvédère.pdf', type_document: 'Offre fournisseur', objet_lie: 'Hôtel Belvédère', auteur: 'William Goupil', date_creation: '2026-07-13' },
  { id: 'd5', nom: 'Contrat gaz — Résidence Les Tilleuls.pdf', type_document: 'Contrat', objet_lie: 'Résidence Les Tilleuls', auteur: 'Naoëlle Ghouma', date_creation: '2026-06-20' },
]
