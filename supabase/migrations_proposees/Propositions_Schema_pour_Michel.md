# Propositions de migration schéma — suite au retour de William (16/07/2026)

Salut Michel,

Suite au message de William sur le schéma, voici 3 propositions concrètes de migration (points 1, 2 et 4 de son message — le point 3 sur les offres structurées peut attendre la stabilisation du MVP).

**Rien n'a été exécuté sur Supabase.** Ce sont des propositions à valider avant de lancer quoi que ce soit sur la base partagée.

---

## 1. Tables de référence pour les statuts

Aujourd'hui `contrats.statut`, `signaux.statut`, `mandats.statut` et `actions.statut` sont de simples champs texte libre, alors que `versions_recommandation` a déjà une vraie table de référence (`statuts_versions_recommandation`). Résultat : pas de Kanban propre possible, pas de couleur/icône cohérente sans hardcoder côté front, et risque de fautes de frappe qui cassent les filtres.

Ce script aligne les 4 autres domaines sur le même pattern (ordre, couleur, icône), de façon non destructive : il ajoute une colonne `statut_id` à côté de l'ancienne colonne texte et la remplit automatiquement — rien n'est supprimé.

```sql
-- =====================================================================
-- Migration proposée 1/3 — Tables de référence pour les statuts
-- =====================================================================
-- Contexte : contrats.statut, signaux.statut, mandats.statut et
-- actions.statut sont aujourd'hui des champs texte libre, contrairement
-- à versions_recommandation qui a déjà une vraie table de référence
-- (statuts_versions_recommandation). Ce script aligne les 4 autres
-- domaines sur ce même pattern, avec ordre + couleur + icône pour
-- pouvoir construire des vues Kanban / badges cohérents côté front
-- sans rien hardcoder.
--
-- Approche non destructive : on crée les tables de référence, on les
-- peuple, on ajoute une colonne <domaine>_statut_id nullable, on la
-- remplit à partir du texte existant. La colonne texte d'origine
-- n'est PAS supprimée par ce script — à faire manuellement une fois
-- que le front a basculé sur la nouvelle colonne (cf. section finale
-- commentée).
-- =====================================================================

create extension if not exists unaccent;

-- ---------------------------------------------------------------
-- 1. Statuts de contrat
-- ---------------------------------------------------------------
create table if not exists statuts_contrats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text not null,
  icone text
);

insert into statuts_contrats (code, libelle, ordre, couleur, icone) values
  ('a_preparer', 'À préparer', 1, '#8698ba', 'file-edit'),
  ('a_signer', 'À signer', 2, '#df9a3c', 'file-signature'),
  ('signe', 'Signé', 3, '#279574', 'check-circle'),
  ('a_venir', 'À venir', 4, '#5c749d', 'clock'),
  ('actif', 'Actif', 5, '#279574', 'zap'),
  ('termine', 'Terminé', 6, '#8698ba', 'check'),
  ('resilie', 'Résilié', 7, '#dc2626', 'x-circle'),
  ('annule', 'Annulé', 8, '#dc2626', 'ban')
on conflict (code) do nothing;

alter table contrats add column if not exists statut_id uuid references statuts_contrats(id);

update contrats c
set statut_id = sc.id
from statuts_contrats sc
where c.statut_id is null
  and lower(unaccent(c.statut)) = lower(unaccent(sc.libelle));

-- ---------------------------------------------------------------
-- 2. Statuts de signal
-- ---------------------------------------------------------------
create table if not exists statuts_signaux (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text not null,
  icone text
);

insert into statuts_signaux (code, libelle, ordre, couleur, icone) values
  ('detecte', 'Détecté', 1, '#8698ba', 'radar'),
  ('a_contacter', 'À contacter', 2, '#df9a3c', 'phone'),
  ('client_contacte', 'Client contacté', 3, '#5c749d', 'message-circle'),
  ('interet_confirme', 'Intérêt confirmé', 4, '#279574', 'thumbs-up'),
  ('pas_interesse', 'Pas intéressé', 5, '#dc2626', 'thumbs-down'),
  ('signal_cloture', 'Signal clôturé', 6, '#8698ba', 'archive')
on conflict (code) do nothing;

alter table signaux add column if not exists statut_id uuid references statuts_signaux(id);

update signaux s
set statut_id = ss.id
from statuts_signaux ss
where s.statut_id is null
  and lower(unaccent(s.statut)) = lower(unaccent(ss.libelle));

-- ---------------------------------------------------------------
-- 3. Statuts de mandat
-- ---------------------------------------------------------------
create table if not exists statuts_mandats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text not null,
  icone text
);

insert into statuts_mandats (code, libelle, ordre, couleur, icone) values
  ('a_preparer', 'À préparer', 1, '#8698ba', 'file-edit'),
  ('envoye', 'Envoyé', 2, '#5c749d', 'send'),
  ('en_attente_signature', 'En attente de signature', 3, '#df9a3c', 'clock'),
  ('signe', 'Signé', 4, '#279574', 'check-circle'),
  ('actif', 'Actif', 5, '#279574', 'zap'),
  ('expire', 'Expiré', 6, '#dc2626', 'alarm-clock'),
  ('revoque', 'Révoqué', 7, '#dc2626', 'ban')
on conflict (code) do nothing;

alter table mandats add column if not exists statut_id uuid references statuts_mandats(id);

update mandats m
set statut_id = sm.id
from statuts_mandats sm
where m.statut_id is null
  and lower(unaccent(m.statut)) = lower(unaccent(sm.libelle));

-- ---------------------------------------------------------------
-- 4. Statuts d'action
-- ---------------------------------------------------------------
create table if not exists statuts_actions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null,
  couleur text not null,
  icone text
);

insert into statuts_actions (code, libelle, ordre, couleur, icone) values
  ('a_faire', 'À faire', 1, '#df9a3c', 'circle'),
  ('en_cours', 'En cours', 2, '#5c749d', 'loader'),
  ('en_attente', 'En attente', 3, '#8698ba', 'pause'),
  ('terminee', 'Terminée', 4, '#279574', 'check-circle'),
  ('annulee', 'Annulée', 5, '#dc2626', 'x-circle')
on conflict (code) do nothing;

alter table actions add column if not exists statut_id uuid references statuts_actions(id);

update actions a
set statut_id = sa.id
from statuts_actions sa
where a.statut_id is null
  and lower(unaccent(a.statut)) = lower(unaccent(sa.libelle));

-- ---------------------------------------------------------------
-- Étape manuelle à faire APRÈS validation du front sur les nouvelles
-- colonnes statut_id (ne pas exécuter automatiquement) :
--
-- alter table contrats drop column statut;
-- alter table signaux drop column statut;
-- alter table mandats drop column statut;
-- alter table actions drop column statut;
-- alter table contrats alter column statut_id set not null;
-- alter table signaux alter column statut_id set not null;
-- alter table mandats alter column statut_id set not null;
-- alter table actions alter column statut_id set not null;
-- ---------------------------------------------------------------
```

---

## 2. Série temporelle des consommations

`compteurs_electricite` / `compteurs_gaz` ne stockent qu'un instantané agrégé par poste tarifaire. Toute la thèse produit KiWee (anticiper, détecter une dérive de consommation comme signal — chapitres 9 et 39 du doc officiel) suppose un historique mensuel structuré. Sans ça, KiMatch ne pourra jamais détecter une dérive, seulement lire un chiffre figé.

Cette table peut rester vide au MVP du 31/07 — l'important est de poser la fondation maintenant.

```sql
-- =====================================================================
-- Migration proposée 2/3 — Série temporelle des consommations
-- =====================================================================
-- Contexte : compteurs_electricite / compteurs_gaz ne stockent qu'un
-- instantané agrégé par poste tarifaire. Toute la thèse produit KiWee
-- (anticipation, détection d'anomalie de consommation comme signal —
-- cf. doc officiel chapitres 9 et 39) suppose un historique mensuel
-- structuré. Sans ça, KiMatch ne pourra jamais détecter une dérive,
-- seulement lire un chiffre figé.
--
-- Cette table peut rester vide au MVP (31/07) — l'important est de
-- poser la fondation maintenant, avant que des données réelles
-- commencent à arriver sans structure pour les accueillir.
-- =====================================================================

create table if not exists consommations (
  id uuid primary key default gen_random_uuid(),
  compteur_id uuid not null references compteurs(id) on delete cascade,
  periode date not null,                 -- premier jour du mois concerné (ex: 2026-07-01)
  poste_tarifaire text not null,         -- ex: 'HP', 'HC', 'Base', 'HPH', 'HCE'...
  valeur numeric not null,               -- consommation en kWh sur la période
  source text default 'facture',         -- 'facture' | 'releve' | 'estimation' | 'api_fournisseur'
  created_at timestamptz not null default now(),

  unique (compteur_id, periode, poste_tarifaire)
);

create index if not exists idx_consommations_compteur_periode
  on consommations (compteur_id, periode desc);

comment on table consommations is
  'Historique mensuel des consommations par compteur et poste tarifaire — fondation nécessaire à la détection de dérive/anomalie (signal technique) et à KiMatch.';
```

---

## 3. Domaine Interactions

Le document officiel KiWee OS décrit déjà "Interactions" comme un domaine fonctionnel à part entière (chapitres 31 et 44 — le fil d'activité : appels, emails, réunions, notes). Ce n'est pas une idée nouvelle de William, c'est dans la vision produit — mais la table n'existe pas encore dans les 35 tables actuelles. Sans elle, pas de mémoire de la relation client, seulement des objets de gestion.

```sql
-- =====================================================================
-- Migration proposée 3/3 — Domaine Interactions
-- =====================================================================
-- Contexte : le document officiel KiWee OS décrit "Interactions" comme
-- un domaine fonctionnel à part entière (chapitres 31 et 44 — le fil
-- d'activité : appels, emails, réunions, notes). Ce n'est pas une idée
-- nouvelle de William, c'est déjà dans la vision produit de Michel —
-- mais la table n'existe pas encore dans les 35 tables actuelles.
-- Sans elle, pas de mémoire de la relation client, seulement des
-- objets de gestion.
-- =====================================================================

create table if not exists types_interactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  icone text
);

insert into types_interactions (code, libelle, icone) values
  ('appel', 'Appel', 'phone'),
  ('email', 'Email', 'mail'),
  ('reunion', 'Réunion', 'users'),
  ('visioconference', 'Visioconférence', 'video'),
  ('visite', 'Visite', 'map-pin'),
  ('message', 'Message', 'message-square'),
  ('note_interne', 'Note interne', 'sticky-note')
on conflict (code) do nothing;

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  type_interaction_id uuid not null references types_interactions(id),
  auteur_id uuid references profils(id),
  date_interaction timestamptz not null default now(),

  -- Rattachements possibles (tous nullable — une interaction peut
  -- concerner un contact, un site, un signal, un mandat ou une
  -- recommandation, selon le contexte).
  compte_id uuid references comptes(id),
  contact_id uuid references contacts(id),
  site_id uuid references sites(id),
  signal_id uuid references signaux(id),
  mandat_id uuid references mandats(id),
  recommandation_id uuid references recommandations(id),
  version_id uuid references versions_recommandation(id),

  resume text,
  decisions_prises text,
  prochaine_etape text,

  created_at timestamptz not null default now()
);

create index if not exists idx_interactions_compte on interactions (compte_id, date_interaction desc);
create index if not exists idx_interactions_site on interactions (site_id, date_interaction desc);

comment on table interactions is
  'Fil d''activité de la relation client (appels, emails, réunions, notes) — domaine documenté au chapitre 44 du KiWee OS, absent des tables actuelles.';
```

---

**Priorité proposée vu la deadline du 31/07** : le point 1 (statuts) est rapide (~1h) et débloque tout de suite un Kanban propre sur Signaux et Recommandations. Le point 2 (consommations) est plus stratégique à long terme mais n'a pas besoin d'être peuplé pour le MVP. Le point 3 (interactions) peut suivre juste après. Le sujet des offres structurées (point 3 du message de William) peut attendre la stabilisation du MVP.

Dites-moi si vous validez, j'attends le feu vert avant d'exécuter quoi que ce soit.

Naoëlle
