import type { ReferenceRow } from '@/lib/data/referenceTables'

/**
 * UN IDENTIFIANT DE REPLI N'EST PAS UN IDENTIFIANT DE BASE, et c'est un piège découvert en auditant
 * le parcours manuel le 25/08/2026.
 *
 * Les listes de repli ci-dessous portent des identifiants inventés — '1', '2', 'd1' — parce qu'elles
 * n'existent que pour garder les libellés affichables si une table de référence répond vide. Mais les
 * formulaires les utilisent aussi pour ÉCRIRE : `statut_id: statutNouveau?.id`. Envoyé à Postgres,
 * '1' n'est pas un uuid, l'insertion échoue, et l'application annonce alors « ajouté localement, non
 * synchronisé » — un faux succès, qui est bien pire qu'une erreur.
 *
 * Cette fonction sert donc de garde : avant d'écrire, on vérifie que l'identifiant vient vraiment de
 * la base. S'il ne l'est pas, on refuse la création EN LE DISANT, plutôt que de fabriquer une ligne
 * que la base rejettera.
 */
export function estIdReel(id: string | null | undefined): boolean {
  if (!id) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

// Filet de sécurité si la table de référence en base répond vide (erreur transitoire, etc.) --
// reflètent les vraies valeurs pour que l'app reste utilisable le temps que ça se rétablisse.

// Les quatre statuts de signal de Michel (24/08/2026) : Nouveau → À qualifier → Converti → Écarté.
// Les huit anciens codes ont été renommés ou fusionnés par la migration 20260824150000.
export const FALLBACK_STATUTS_SIGNAUX: ReferenceRow[] = [
  { id: '1', code: 'NOUVEAU', libelle: 'Nouveau', ordre: 10, couleur: '#64748B', icone: null },
  { id: '2', code: 'A_QUALIFIER', libelle: 'À qualifier', ordre: 20, couleur: '#F59E0B', icone: null },
  { id: '3', code: 'CONVERTI', libelle: 'Converti', ordre: 30, couleur: '#059669', icone: null },
  { id: '4', code: 'ECARTE', libelle: 'Écarté', ordre: 40, couleur: '#475569', icone: null },
]

// Les huit paliers de recommandation de Michel (diapositive 13 du 24/08/2026) : Brouillon →
// Consultation → Offres reçues → À présenter → Présentée → Acceptée / Refusée / Abandonnée. Sa
// règle : « le statut évolue, il ne régresse jamais », d'où des ordres strictement croissants.
export const FALLBACK_ETAPES_RECOMMANDATION: ReferenceRow[] = [
  { id: 'd1', code: 'BROUILLON', libelle: 'Brouillon', ordre: 10, couleur: null, icone: null },
  { id: 'd2', code: 'CONSULTATION', libelle: 'Consultation', ordre: 20, couleur: null, icone: null },
  { id: 'd3', code: 'OFFRES_RECUES', libelle: 'Offres reçues', ordre: 30, couleur: null, icone: null },
  { id: 'd4', code: 'A_PRESENTER', libelle: 'À présenter', ordre: 40, couleur: null, icone: null },
  { id: 'd5', code: 'PRESENTEE', libelle: 'Présentée', ordre: 50, couleur: null, icone: null },
  { id: 'd6', code: 'ACCEPTEE', libelle: 'Acceptée', ordre: 70, couleur: null, icone: null },
  { id: 'd7', code: 'REFUSEE', libelle: 'Refusée', ordre: 80, couleur: null, icone: null },
  { id: 'd8', code: 'ABANDONNEE', libelle: 'Abandonnée', ordre: 90, couleur: null, icone: null },
]

// « En construction, c'est quand quelqu'un bosse dessus. Disponible, ça veut dire prête à être
// envoyée. En décision, ça veut dire qu'on l'a envoyée, qu'elle est présentée au client. »
export const FALLBACK_STATUTS_VERSIONS: ReferenceRow[] = [
  { id: 'v1', code: 'EN_CONSTRUCTION', libelle: 'En construction', ordre: 10, couleur: null, icone: null },
  { id: 'v2', code: 'DISPONIBLE', libelle: 'Disponible', ordre: 20, couleur: null, icone: null },
  { id: 'v3', code: 'EN_DECISION', libelle: 'En décision', ordre: 30, couleur: null, icone: null },
  { id: '1', code: 'BROUILLON', libelle: 'Brouillon', ordre: 110, couleur: null, icone: null },
  { id: '2', code: 'A_VALIDER', libelle: 'À valider', ordre: 20, couleur: null, icone: null },
  { id: '3', code: 'VALIDEE', libelle: 'Validée en interne', ordre: 30, couleur: null, icone: null },
  { id: '4', code: 'PRESENTEE', libelle: 'Présentée au client', ordre: 40, couleur: null, icone: null },
  { id: '5', code: 'REMPLACEE', libelle: 'Remplacée par une nouvelle version', ordre: 50, couleur: null, icone: null },
  { id: '6', code: 'ACCEPTEE', libelle: 'Acceptée par le client', ordre: 60, couleur: null, icone: null },
  { id: '7', code: 'REFUSEE', libelle: 'Refusée par le client', ordre: 70, couleur: null, icone: null },
  { id: '8', code: 'EXPIREE', libelle: 'Expirée', ordre: 80, couleur: null, icone: null },
  { id: '9', code: 'ARCHIVEE', libelle: 'Archivée', ordre: 90, couleur: null, icone: null },
]

// Les huit paliers de Michel, plus les statuts de version qui partagent cette table de tons.
export const ETAPE_TONE: Record<string, 'neutral' | 'amber' | 'kiwi' | 'blue'> = {
  BROUILLON: 'neutral',
  CONSULTATION: 'blue',
  OFFRES_RECUES: 'blue',
  A_PRESENTER: 'amber',
  PRESENTEE: 'amber',
  ACCEPTEE: 'kiwi',
  REFUSEE: 'neutral',
  ABANDONNEE: 'neutral',
  EN_CONSTRUCTION: 'neutral',
  DISPONIBLE: 'kiwi',
  EN_DECISION: 'amber',
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
  { id: '7', code: 'ANNULE', libelle: 'Annulé', ordre: 70, couleur: null, icone: null },
  { id: '8', code: 'REFUSE', libelle: 'Refusé', ordre: 65, couleur: null, icone: null },
]

export const FALLBACK_TYPES_COURTIERS_MANDAT: ReferenceRow[] = [
  { id: '1', code: 'KIWI', libelle: 'KiWee', ordre: 10, couleur: null, icone: null },
  { id: '2', code: 'ENERGIX', libelle: 'Energix', ordre: 20, couleur: null, icone: null },
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
