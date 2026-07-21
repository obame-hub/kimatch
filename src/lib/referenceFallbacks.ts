import type { ReferenceRow } from '@/lib/data/referenceTables'

// Utilisées uniquement en mode démo (Supabase non configuré) — reflètent les vraies
// valeurs des tables de référence pour que la démo et le réel se ressemblent.

export const FALLBACK_STATUTS_SIGNAUX: ReferenceRow[] = [
  { id: '1', code: 'NOUVEAU', libelle: 'Nouveau', ordre: 10, couleur: '#64748B', icone: null },
  { id: '2', code: 'A_CONTACTER', libelle: 'À contacter', ordre: 20, couleur: '#F59E0B', icone: null },
  { id: '3', code: 'CONTACTE', libelle: 'Contacté', ordre: 30, couleur: '#3B82F6', icone: null },
  { id: '4', code: 'REPORTE', libelle: 'Reporté', ordre: 40, couleur: '#8B5CF6', icone: null },
  { id: '5', code: 'INTERET_CONFIRME', libelle: 'Intérêt confirmé', ordre: 50, couleur: '#10B981', icone: null },
  { id: '6', code: 'REFUSE', libelle: 'Refusé', ordre: 60, couleur: '#EF4444', icone: null },
  { id: '7', code: 'TRANSFORME', libelle: 'Transformé en recommandation', ordre: 70, couleur: '#059669', icone: null },
  { id: '8', code: 'CLOTURE', libelle: 'Clôturé', ordre: 80, couleur: '#475569', icone: null },
]

export const FALLBACK_ETAPES_RECOMMANDATION: ReferenceRow[] = [
  { id: '1', code: 'A_PREPARER', libelle: 'À préparer', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'EN_ANALYSE', libelle: 'En analyse', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'EN_PREPARATION', libelle: 'En préparation', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'PRETE', libelle: 'Prête', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'PRESENTEE', libelle: 'Présentée au client', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'ACTUALISATION', libelle: 'À actualiser', ordre: 60, couleur: null, icone: null },
  { id: '7', code: 'ACCEPTEE', libelle: 'Acceptée', ordre: 70, couleur: null, icone: null },
  { id: '8', code: 'REFUSEE', libelle: 'Refusée', ordre: 80, couleur: null, icone: null },
  { id: '9', code: 'CLOTUREE', libelle: 'Clôturée', ordre: 90, couleur: null, icone: null },
]

export const FALLBACK_STATUTS_VERSIONS: ReferenceRow[] = [
  { id: '1', code: 'BROUILLON', libelle: 'Brouillon', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'A_VALIDER', libelle: 'À valider', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'VALIDEE', libelle: 'Validée en interne', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'PRESENTEE', libelle: 'Présentée au client', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'REMPLACEE', libelle: 'Remplacée par une nouvelle version', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'ACCEPTEE', libelle: 'Acceptée par le client', ordre: 60, couleur: null, icone: null },
  { id: '7', code: 'REFUSEE', libelle: 'Refusée par le client', ordre: 70, couleur: null, icone: null },
  { id: '8', code: 'EXPIREE', libelle: 'Expirée', ordre: 80, couleur: null, icone: null },
  { id: '9', code: 'ARCHIVEE', libelle: 'Archivée', ordre: 90, couleur: null, icone: null },
]

export const ETAPE_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue'> = {
  A_PREPARER: 'neutral',
  EN_ANALYSE: 'blue',
  EN_PREPARATION: 'blue',
  PRETE: 'kiwi',
  PRESENTEE: 'kiwi',
  ACTUALISATION: 'amber',
  ACCEPTEE: 'kiwi',
  REFUSEE: 'neutral',
  CLOTUREE: 'kiwi',
}

export const STATUT_VERSION_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue'> = {
  BROUILLON: 'neutral',
  A_VALIDER: 'amber',
  VALIDEE: 'kiwi',
  PRESENTEE: 'kiwi',
  REMPLACEE: 'neutral',
  ACCEPTEE: 'kiwi',
  REFUSEE: 'neutral',
  EXPIREE: 'neutral',
  ARCHIVEE: 'neutral',
}

export const FALLBACK_STATUTS_MANDATS: ReferenceRow[] = [
  { id: '1', code: 'A_PREPARER', libelle: 'À préparer', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'ENVOYE', libelle: 'Envoyé', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'EN_SIGNATURE', libelle: 'En signature', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'SIGNE', libelle: 'Signé', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'ACTIF', libelle: 'Actif', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'EXPIRE', libelle: 'Expiré', ordre: 60, couleur: null, icone: null },
  { id: '7', code: 'REVOQUE', libelle: 'Révoqué', ordre: 70, couleur: null, icone: null },
]

export const FALLBACK_STATUTS_ACTIONS: ReferenceRow[] = [
  { id: '1', code: 'A_FAIRE', libelle: 'À faire', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'EN_COURS', libelle: 'En cours', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'EN_ATTENTE', libelle: 'En attente', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'TERMINEE', libelle: 'Terminée', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'ANNULEE', libelle: 'Annulée', ordre: 50, couleur: null, icone: null },
]

export const FALLBACK_TYPES_ACTIONS: ReferenceRow[] = [
  { id: '1', code: 'APPEL', libelle: 'Appel', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'RELANCE', libelle: 'Relance', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'ADMINISTRATIF', libelle: 'Administratif', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'PRESENTATION', libelle: 'Présentation', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'AUTRE', libelle: 'Autre', ordre: 50, couleur: null, icone: null },
]

export const STATUT_MANDAT_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue' | 'red'> = {
  A_PREPARER: 'neutral',
  ENVOYE: 'blue',
  EN_SIGNATURE: 'amber',
  SIGNE: 'kiwi',
  ACTIF: 'kiwi',
  EXPIRE: 'red',
  REVOQUE: 'red',
}

export const STATUT_ACTION_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue'> = {
  A_FAIRE: 'amber',
  EN_COURS: 'blue',
  EN_ATTENTE: 'neutral',
  TERMINEE: 'kiwi',
  ANNULEE: 'neutral',
}

export const FALLBACK_STATUTS_CONTRATS: ReferenceRow[] = [
  { id: '1', code: 'ACTIF', libelle: 'Actif', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'A_RENOUVELER', libelle: 'À renouveler', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'EXPIRE', libelle: 'Expiré', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'RESILIE', libelle: 'Résilié', ordre: 40, couleur: null, icone: null },
]

export const STATUT_CONTRAT_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue' | 'red'> = {
  ACTIF: 'kiwi',
  A_RENOUVELER: 'amber',
  EXPIRE: 'red',
  RESILIE: 'red',
}

export const FALLBACK_TYPES_SITES: ReferenceRow[] = [
  { id: '1', code: 'COPROPRIETE', libelle: 'Copropriété', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'TERTIAIRE', libelle: 'Immeuble tertiaire', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'ENTREPOT', libelle: 'Entrepôt', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'HOTEL', libelle: 'Hôtel', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'COMMERCE', libelle: 'Commerce', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'AUTRE', libelle: 'Autre', ordre: 60, couleur: null, icone: null },
]

export const FALLBACK_TYPES_SIGNAUX: ReferenceRow[] = [
  { id: '1', code: 'ECHEANCE_CONTRAT', libelle: 'Échéance de contrat', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'PREAVIS', libelle: 'Préavis', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'OPPORTUNITE_FOURNISSEUR', libelle: 'Opportunité fournisseur', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'NOUVELLE_FACTURE', libelle: 'Nouvelle facture', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'DEMANDE_CLIENT', libelle: 'Demande du client', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'AUTRE', libelle: 'Autre', ordre: 60, couleur: null, icone: null },
]

export const FALLBACK_TYPES_ENERGIES: ReferenceRow[] = [
  { id: '1', code: 'ELECTRICITE', libelle: 'Électricité', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'GAZ', libelle: 'Gaz', ordre: 20, couleur: null, icone: null },
]

export const FALLBACK_TYPES_DOCUMENTS: ReferenceRow[] = [
  { id: '1', code: 'MANDAT', libelle: 'Mandat', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'FACTURE', libelle: 'Facture', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'CONTRAT', libelle: 'Contrat', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'RECOMMANDATION', libelle: 'Recommandation', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'AUTRE', libelle: 'Autre', ordre: 50, couleur: null, icone: null },
]

export const FALLBACK_TYPES_COMPTES: ReferenceRow[] = [
  { id: '1', code: 'KIWEE', libelle: 'KiWee', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'CLIENT', libelle: 'Client', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'PARTENAIRE', libelle: 'Partenaire', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'FOURNISSEUR', libelle: 'Fournisseur', ordre: 40, couleur: null, icone: null },
]

export const FALLBACK_TYPES_ORIGINES: ReferenceRow[] = [
  { id: '1', code: 'SIGNAL', libelle: 'Suite à un signal', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'DEMANDE_CLIENT', libelle: 'Demande spontanée du client', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'PROSPECTION', libelle: 'Prospection', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'AUTRE', libelle: 'Autre', ordre: 40, couleur: null, icone: null },
]

export const FALLBACK_TYPES_INTERACTIONS: ReferenceRow[] = [
  { id: '1', code: 'APPEL', libelle: 'Appel', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'EMAIL', libelle: 'Email', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'REUNION', libelle: 'Réunion', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'VISITE', libelle: 'Visite site', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'COURRIER', libelle: 'Courrier', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'AUTRE', libelle: 'Autre', ordre: 60, couleur: null, icone: null },
]

export const FALLBACK_ISSUES_INTERACTIONS: ReferenceRow[] = [
  { id: '1', code: 'INTERET_CONFIRME', libelle: 'Intérêt confirmé', ordre: 10, couleur: '#10B981', icone: null },
  { id: '2', code: 'OBJECTION_PRIX', libelle: 'Objection prix', ordre: 20, couleur: '#F59E0B', icone: null },
  { id: '3', code: 'OBJECTION_DELAI', libelle: 'Objection délai', ordre: 30, couleur: '#F59E0B', icone: null },
  { id: '4', code: 'ACCORD', libelle: 'Accord de principe', ordre: 40, couleur: '#10B981', icone: null },
  { id: '5', code: 'REFUS', libelle: 'Refus', ordre: 50, couleur: '#EF4444', icone: null },
  { id: '6', code: 'SANS_SUITE', libelle: 'Sans suite', ordre: 60, couleur: '#94A3B8', icone: null },
]
