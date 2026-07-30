# Contrat de données — Fiche Compte

Forme attendue par les composants. **Adapte tes endpoints à cette forme via un mapper**
plutôt que de modifier les composants.

Toutes les dates sont en **ISO 8601**. Le formatage d'affichage est `JJ/MM/AAAA`
(et `JJ/MM/AAAA HH:mm` pour les horodatages), en police mono.

```ts
type Uuid = string;
type IsoDate = string;

// ─── Métadonnées présentes sur TOUTES les fiches du CRM ────────────────────
interface RecordMeta {
  owner:      { id: Uuid; name: string; initials: string };  // modifiable en un clic
  createdAt:  IsoDate;
  updatedAt:  IsoDate;
}

// ─── Compte ────────────────────────────────────────────────────────────────
interface Account extends RecordMeta {
  id: Uuid;
  name: string;
  /** Typologie — pilote la distinction graphique du badge. */
  category: 'client' | 'partenaire' | 'fournisseur';
  /** Nature de l'activité. */
  kind: 'syndic' | 'entreprise' | 'agence' | 'promoteur' | 'bailleur_social' | 'autre';
  /** true dès qu'au moins un compteur du portefeuille est client. */
  isClient: boolean;
  siret: string;          // 14 chiffres. Le SIREN = siret.slice(0,9), dérivé côté front.
  nafCode: string | null; // ex. "68.32A"
  apeLabel: string | null;
  /** Note de solvabilité sur 10. < 3 très mauvais, > 7 très bien. */
  ellipro: number | null;
  address: { street: string; postalCode: string; city: string;
             lat: number | null; lng: number | null };
  department: { code: string; name: string };   // ex. { code: "69", name: "Rhône" }
  comment: string | null;                        // texte long éditable
  siteCount: number;
  /** Score commercial 0–100 + critères affichés dans le détail de l'anneau. */
  value: { score: number;
           drivers: { label: string; weight: number; tone: 'good' | 'warn' | 'bad' }[] };
}

// ─── Contacts ──────────────────────────────────────────────────────────────
interface Contact {
  id: Uuid;
  civility: 'M.' | 'Mme' | null;
  firstName: string; lastName: string;
  role: string;                          // affiché en ICÔNE, pas en texte long
  /** Distinction graphique cabinet vs conseil syndical. */
  group: 'cabinet' | 'conseil_syndical';
  isDecisionMaker: boolean;
  email: string | null;
  phoneFixed: string | null;
  phoneMobile: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;               // sinon initiales colorées
  siteIds: Uuid[];                       // sites où il intervient
}

// ─── Sites du portefeuille ─────────────────────────────────────────────────
interface SiteSummary {
  id: Uuid;
  label: string;
  status: 'client' | 'prospect';
  healthScore: number;                   // 0–100
  city: string; departmentCode: string;
  lat: number | null; lng: number | null; // pour les pins de la carte
  activeContracts: number;
  nextExpiry: IsoDate | null;
  openSignals: number;
  meterCount: { elec: number; gas: number };
}

// ─── Compteurs ─────────────────────────────────────────────────────────────
interface Meter {
  id: Uuid; siteId: Uuid;
  reference: string;                     // PDL (élec, 14 ch.) ou PCE (gaz)
  energy: 'elec' | 'gas';
  label: string;                         // ex. "Chaufferie collective"
  status: 'client' | 'prospect';
  hasActiveMandate: boolean;
  supplier: { id: Uuid; name: string; logoUrl: string | null } | null;
  contractEnd: IsoDate | null;
  annualConsumptionMwh: number | null;   // élec : conso annuelle · gaz : CAR
  // Électricité
  segment?: 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
  voltage?: 'BT' | 'HTA';
  usage?: 'CU' | 'MU' | 'LU';
  subscribedPowerKva?: number;
  powerByTimeSlot?: Record<'POINTE' | 'HPH' | 'HCH' | 'HPE' | 'HCE', number>;
  consumptionByTimeSlot?: Record<'POINTE' | 'HPH' | 'HCH' | 'HPE' | 'HCE', number>;
  // Gaz
  distributionTariff?: 'T1' | 'T2' | 'T3' | 'T4';
  consumptionProfile?: `P01${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;
}

// ─── Contrats ──────────────────────────────────────────────────────────────
interface Contract {
  id: Uuid;
  meterIds: Uuid[];                      // un contrat peut couvrir plusieurs compteurs
  /** client = signé par KiWee · prospect = contrat connu mais non géré par nous. */
  origin: 'client' | 'prospect';
  supplier: { id: Uuid; name: string; logoUrl: string | null };
  energy: 'elec' | 'gas';
  startDate: IsoDate; endDate: IsoDate;
  durationMonths: number;
  lifecycle: 'a_venir' | 'en_cours' | 'expire';
  signatoryContactId: Uuid | null;
}

// ─── Mandats ───────────────────────────────────────────────────────────────
interface Mandate {
  id: Uuid;
  reference: string;                     // référence interne courte
  /** Un mandat peut porter l'un des deux ACD, ou les deux. */
  types: ('ACD_KIWEE' | 'ACD_ENERGIX')[];
  signatoryContactId: Uuid;
  meterIds: Uuid[];                      // périmètre couvert, multi-sites possible
  docusign: { envelopeId: string;
              status: 'brouillon' | 'envoye' | 'livre' | 'vu' | 'signe' | 'refuse' | 'annule';
              timeline: { step: string; at: IsoDate }[] };
  startDate: IsoDate | null; endDate: IsoDate | null;
  lifecycle: 'actif' | 'expire';
}

// ─── Signaux ───────────────────────────────────────────────────────────────
interface Signal {
  id: Uuid;
  kind: 'echeance_sans_reco' | 'demande_client' | 'opportunite_marche' | 'optimisation_puissance';
  severity: 'info' | 'attention' | 'critique';
  siteId: Uuid | null; meterId: Uuid | null;
  title: string; detail: string;
  openedAt: IsoDate;
  status: 'ouvert' | 'traite' | 'clos';
}

// ─── Recommandations ───────────────────────────────────────────────────────
interface Recommendation {
  id: Uuid;
  siteIds: Uuid[]; meterIds: Uuid[];
  stage: 'diagnostique' | 'consultation' | 'decision' | 'cloture';
  outcome: 'acceptee' | 'refusee' | 'expiree' | null;
  activeVersion: number;
  versions: { number: number; status: string; estimatedSavings: number;
              createdAt: IsoDate; expired: boolean }[];
  /** Renseigné dès que la reco est gagnée : honoraires perçus par KiWee. */
  feeAmount: number | null;
  feeStatus: 'estime' | 'fixe';
}

// ─── Activité ──────────────────────────────────────────────────────────────
interface ActivityItem {
  id: Uuid;
  type: 'note' | 'appel' | 'email' | 'tache' | 'systeme';
  at: IsoDate;
  author: { id: Uuid; name: string; initials: string };
  title: string;
  /** Contenu du dépliement : résumé IA d'appel, corps du mail, commentaires de tâche. */
  body: string | null;
  siteId: Uuid | null;                   // pour le filtre « par site »
  contactId: Uuid | null;                // pour le filtre « par contact »
  /** Tâches uniquement — pilote l'état visuel à faire / accompli. */
  task?: { dueAt: IsoDate; done: boolean; doneAt: IsoDate | null };
}

// ─── Fichiers ──────────────────────────────────────────────────────────────
interface Attachment {
  id: Uuid;
  category: 'contrat' | 'facture' | 'avenant' | 'mail' | 'photo' | 'autre';
  filename: string; mimeType: string; sizeBytes: number;
  url: string;
  uploadedAt: IsoDate;
  uploadedBy: { id: Uuid; name: string };
}

// ─── Historique des modifications ──────────────────────────────────────────
interface FieldChange {
  id: Uuid;
  entity: 'compte' | 'site' | 'compteur' | 'contact' | 'contrat' | 'mandat';
  entityId: Uuid;
  field: string; fieldLabel: string;
  oldValue: string | null; newValue: string | null;
  at: IsoDate;
  by: { id: Uuid; name: string };
}

// ─── Ticker marché (persistant dans le header, partout) ────────────────────
interface MarketTicker {
  peg:  { price: number; changePct: number; at: IsoDate };  // gaz, €/MWh
  base: { price: number; changePct: number; at: IsoDate };  // élec, €/MWh
}
```

## Endpoints attendus

| Usage | Suggestion |
|---|---|
| Fiche complète | `GET /accounts/:id?include=contacts,sites,value` |
| Onglet Contrats | `GET /accounts/:id/contracts?groupBy=site,meter` |
| Onglet Compteurs | `GET /accounts/:id/meters?groupBy=site` |
| Onglet Mandats | `GET /accounts/:id/mandates` |
| Onglet Signaux | `GET /accounts/:id/signals?status=ouvert` |
| Onglet Recos | `GET /accounts/:id/recommendations` |
| Onglet Fichiers | `GET|POST /accounts/:id/attachments` |
| Onglet Historique | `GET /accounts/:id/field-changes?page=` |
| Activité | `GET /accounts/:id/activity?siteId=&contactId=&cursor=` |
| Édition inline | `PATCH /accounts/:id` (un seul champ par requête) |
| Changement de propriétaire | `PATCH /accounts/:id { ownerId }` |
| Ticker marché | `GET /market/ticker` (poll ou SSE) |

**Mutations optimistes obligatoires** sur `PATCH` : mise à jour immédiate de l'UI,
rollback + toast d'erreur si l'appel échoue.
