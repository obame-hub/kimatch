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
