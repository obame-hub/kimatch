-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CE QUE LA PROPOSITION COMMERCIALE AFFICHE ET QUE LA BASE N'AVAIT PAS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Réunion du 30/09/2026 : William présente le modèle de proposition commerciale validé avec Michel et
-- les commerciaux — trois pages A4, gaz et électricité (« Offre B v3 », « Offre Electricite »). Sa
-- consigne : « tout ce qui est renseigné là, ça doit être en base quelque part ». Naoëlle récupère
-- les données ; William fait le document.
--
-- Vérifié champ par champ le 30/09 : tout existe — client, compteur, prix unitaires, taxes — SAUF
-- deux blocs, qui n'avaient aucune colonne.
--
-- ══ ① LES CLAUSES CONTRACTUELLES, SUR L'OFFRE (page 2) ══
--
-- William : « c'est des informations qui sont propres au fournisseur mais aussi propres à l'affaire
-- sur laquelle ils ont répondu ». Elles vivent donc sur `offres_fournisseurs`, pas sur la fiche du
-- fournisseur. Et « chacun sa règle » pour le défaut :
--
--   contrat sécurisé          NON STOCKÉ : « contrat sécurisé, ça veut dire est-ce que j'ai demandé
--                             un prix fixe ? […] ça peut être automatique ». Il se déduit de
--                             `type_prix`. Le stocker ferait deux vérités.
--   tacite reconduction       VRAI par défaut : « par défaut c'est renseigné, et exceptionnellement
--                             ça l'est pas ».
--   dépôt de garantie         FAUX par défaut : « à l'inverse d'un dépôt de garantie, où par défaut
--   engagement de conso.      ce n'est pas renseigné ». L'engagement de conso Picoty : « dans 90 %
--   renégociation anticipée   des cas il n'y en a pas ».
--   SWAP
--
-- Les défauts s'appliquent aux 244 offres existantes : c'est ce que dit la règle, et aucune offre n'a
-- jamais été renseignée autrement — il n'y avait pas où.
--
-- LA NOTE A→E N'EST PAS ICI. Elle se calcule à partir des clauses, et la règle (le poids de chaque
-- clause, les seuils) reste à fixer avec William. Une colonne de note figerait une règle que
-- personne n'a encore écrite.
--
-- ══ ② L'IDENTITÉ DU FOURNISSEUR, SUR SA FICHE (page 3) ══
--
-- « Il va falloir qu'on travaille aussi sur notre base à bien travailler les fournisseurs […]
-- origine, création, ancienneté, un petit texte qui le présente, où est le siège, quels sont ses
-- clients, et trois tags qui correspondent vraiment à l'activité. »
--
-- L'ANCIENNETÉ N'EST PAS STOCKÉE : elle se calcule depuis l'année de création, sinon elle vieillit
-- fausse d'un an chaque 1er janvier.
--
-- ELLES NAISSENT VIDES. Les données du modèle de William sont fictives (il le dit : « c'est des
-- fausses datas ») — GME y est donné français alors qu'il est espagnol. On ne reprend rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ══ ① Les clauses ══════════════════════════════════════════════════════════════════════════════

alter table offres_fournisseurs
  add column if not exists clause_tacite_reconduction boolean not null default true,
  add column if not exists clause_depot_garantie boolean not null default false,
  add column if not exists clause_engagement_consommation boolean not null default false,
  add column if not exists clause_renegociation_anticipee boolean not null default false,
  add column if not exists clause_swap boolean not null default false;

comment on column offres_fournisseurs.clause_tacite_reconduction is
  'Le contrat se reconduit tacitement. VRAI par défaut (règle de William, 30/09/2026) : décocher quand le fournisseur ne le prévoit pas. Contrainte pour le client : pénalise la note des clauses.';
comment on column offres_fournisseurs.clause_depot_garantie is
  'Le fournisseur exige un dépôt de garantie. FAUX par défaut : cocher quand il le demande (rare, souvent sur une note de solvabilité faible). Contrainte : pénalise la note.';
comment on column offres_fournisseurs.clause_engagement_consommation is
  'Le fournisseur impose un engagement de consommation (Picoty, par exemple, sur une minorité de dossiers). FAUX par défaut. Contrainte : pénalise la note.';
comment on column offres_fournisseurs.clause_renegociation_anticipee is
  'Le contrat permet une renégociation anticipée. FAUX par défaut. Protection pour le client : valorise la note.';
comment on column offres_fournisseurs.clause_swap is
  'Le contrat permet un SWAP (passage fixe / indexé en cours de contrat). FAUX par défaut. Protection pour le client : valorise la note.';

-- ══ ② L'identité du fournisseur ══════════════════════════════════════════════════════════════

alter table comptes_fournisseurs
  add column if not exists qualification text,
  add column if not exists pays_origine text,
  add column if not exists annee_creation integer,
  add column if not exists presentation text,
  add column if not exists siege text,
  add column if not exists clientele text,
  add column if not exists tags text[] not null default '{}';

alter table comptes_fournisseurs drop constraint if exists comptes_fournisseurs_annee_creation_check;
alter table comptes_fournisseurs add constraint comptes_fournisseurs_annee_creation_check
  check (annee_creation is null or annee_creation between 1800 and 2100);

-- TROIS TAGS AU PLUS : c'est le gabarit de la page 3, et au-delà l'encart déborde.
alter table comptes_fournisseurs drop constraint if exists comptes_fournisseurs_tags_check;
alter table comptes_fournisseurs add constraint comptes_fournisseurs_tags_check
  check (cardinality(tags) <= 3);

comment on column comptes_fournisseurs.qualification is
  'Ce qu''est le fournisseur, en quelques mots, sous son nom dans la proposition : « Fournisseur indépendant », « Groupe international coté », « Groupe familial indépendant ».';
comment on column comptes_fournisseurs.pays_origine is 'Pays d''origine du fournisseur (« France », « Espagne »…).';
comment on column comptes_fournisseurs.annee_creation is 'Année de création. L''ancienneté affichée s''en déduit — elle n''est pas stockée, pour ne pas vieillir fausse.';
comment on column comptes_fournisseurs.presentation is 'Deux ou trois lignes qui présentent le fournisseur au client, dans la proposition commerciale.';
comment on column comptes_fournisseurs.siege is 'Ville du siège, avec son département : « Lyon (69) ».';
comment on column comptes_fournisseurs.clientele is 'À qui il vend : « PME, copropriétés, collectivités ».';
comment on column comptes_fournisseurs.tags is 'Trois mots au plus qui disent son activité réelle : « Gaz naturel », « Chauffage collectif », « Grands comptes ».';

commit;
