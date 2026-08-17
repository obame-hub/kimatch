-- Fiche Recommandation (maquette de William) — les trois blocs que la base ne sait pas stocker.
--
-- Audit du 16/08/2026 : le reste du design est déjà couvert (reference RC-2026-027, versions avec
-- date_expiration et version_actuelle, optimisations pour « Solutions incluses », cycle de vie via
-- etapes_recommandation, clôture faite le matin même). Manquent exactement trois choses.
--
--   1. « COMMANDE DU CLIENT (4 obj.) » — l'onglet affiche huit objectifs cochables et désigne
--      lequel est PRIORITAIRE, plus un texte libre « Contexte de la demande ». Aucune table.
--      Aujourd'hui cette information n'existe nulle part : le conseiller la garde en tête ou la
--      noie dans le commentaire interne, et personne d'autre ne sait ce que le client a demandé.
--
--   2. « COÛT DE PRESTATION — ESTIMÉ 492 € / RÉEL — » avec un bouton « fixer ». Deux montants
--      distincts, aucune colonne pour les porter.
--
--   3. « ÉTUDE CLIENT — ENVOYÉE le 22/07 à Claire Vasseur · consultée il y a 2 h · 4 visites ·
--      EXPIRATION 7 / 14 / 30 j ». Rien : ni lien de partage, ni date d'envoi, ni compteur de
--      visites, ni échéance.
--
-- Les huit objectifs et leurs libellés sont repris MOT POUR MOT de la maquette, pas reformulés.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Commande du client
-- ─────────────────────────────────────────────────────────────────────────────

-- Table de référence plutôt que huit colonnes booléennes : c'est la convention du schéma
-- (types_*, statuts_*), et une liste d'objectifs est faite pour évoluer sans migration.
create table if not exists public.types_objectifs_client (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  ordre integer not null default 0,
  actif boolean not null default true
);

comment on table public.types_objectifs_client is
  'Objectifs que le client peut exprimer sur une recommandation. Libellés repris de la maquette « Commande du client ».';

insert into public.types_objectifs_client (code, libelle, ordre) values
  ('ECONOMIES',        'Maximiser les économies',              1),
  ('SECURISER_PRIX',   'Sécuriser le prix sur le long terme',  2),
  ('RENEGOCIER',       'Renégocier mon contrat actuel',        3),
  ('CHANGER_FOURNISSEUR', 'Changer impérativement de fournisseur', 4),
  ('ENERGIE_VERTE',    'Souscrire à une énergie verte',        5),
  ('PUISSANCES',       'Optimiser les puissances souscrites',  6),
  ('FISCALITE',        'Optimiser la fiscalité énergétique',   7),
  ('ADMINISTRATIF',    'Simplifier la gestion administrative', 8)
on conflict (code) do nothing;

create table if not exists public.recommandations_objectifs (
  recommandation_id uuid not null references public.recommandations(id) on delete cascade,
  type_objectif_id uuid not null references public.types_objectifs_client(id) on delete restrict,
  -- La maquette n'en met en avant qu'UN. Contrainte posée plus bas : un seul prioritaire par
  -- recommandation, sinon « prioritaire » ne veut plus rien dire.
  prioritaire boolean not null default false,
  date_creation timestamptz not null default now(),
  primary key (recommandation_id, type_objectif_id)
);

-- Index partiel unique : au plus un objectif prioritaire par recommandation. La règle est tenue
-- par la base et non par l'écran — deux conseillers sur deux postes ne peuvent pas en désigner
-- deux en même temps.
create unique index if not exists idx_reco_objectif_prioritaire_unique
  on public.recommandations_objectifs (recommandation_id)
  where prioritaire;

create index if not exists idx_reco_objectifs_reco
  on public.recommandations_objectifs (recommandation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contexte de la demande et coût de prestation
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.recommandations
  -- « Contexte de la demande » : le texte libre de l'onglet Commande du client. Distinct de
  -- `commentaire_interne`, qui est une note de travail et n'a pas à sortir au client.
  add column if not exists contexte_demande text,
  add column if not exists cout_prestation_estime numeric,
  add column if not exists cout_prestation_reel numeric;

comment on column public.recommandations.contexte_demande is
  'Ce que le client a demandé, dans ses termes. Ne pas confondre avec commentaire_interne (note de travail).';
comment on column public.recommandations.cout_prestation_reel is
  'Coût facturé, une fois fixé. NULL tant que l''estimation n''a pas été arrêtée.';

alter table public.recommandations
  add constraint recommandations_cout_prestation_positif
  check (
    (cout_prestation_estime is null or cout_prestation_estime >= 0)
    and (cout_prestation_reel is null or cout_prestation_reel >= 0)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Partage de l'étude client
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.partages_etude_client (
  id uuid primary key default gen_random_uuid(),
  recommandation_id uuid not null references public.recommandations(id) on delete cascade,
  -- L'étude porte sur une version précise : c'est elle que le client a sous les yeux, et une
  -- nouvelle version ne doit pas changer sous lui ce qu'il a déjà consulté.
  version_recommandation_id uuid references public.versions_recommandation(id) on delete set null,
  -- Jeton du lien public. `gen_random_uuid()` et non une suite courte : le lien donne accès à une
  -- proposition commerciale nominative, il ne doit pas être devinable.
  jeton uuid not null default gen_random_uuid() unique,
  contact_id uuid references public.contacts(id) on delete set null,
  date_envoi timestamptz,
  date_expiration timestamptz,
  -- Compteur de consultations : « consultée il y a 2 h · 4 visites » dans la maquette.
  nb_visites integer not null default 0,
  date_derniere_visite timestamptz,
  revoque boolean not null default false,
  cree_par_id uuid references public.profils(id) on delete set null,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

comment on table public.partages_etude_client is
  'Lien public vers l''étude client, avec son échéance et son compteur de visites. Un partage par envoi ; l''historique est conservé plutôt qu''écrasé.';
comment on column public.partages_etude_client.revoque is
  'Coupe l''accès sans supprimer la ligne : on veut garder la trace qu''un lien a existé et combien de fois il a été ouvert.';

-- Le partage est lu par son jeton à chaque ouverture du lien : sans index, chaque visite
-- parcourt la table.
create unique index if not exists idx_partages_etude_jeton on public.partages_etude_client (jeton);
create index if not exists idx_partages_etude_reco on public.partages_etude_client (recommandation_id);

commit;

-- Vérification après application (à coller tel quel) :
--
--   select code, libelle, ordre from public.types_objectifs_client order by ordre;
--   -- attendu : 8 lignes, de « Maximiser les économies » à « Simplifier la gestion administrative »
--
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='recommandations'
--     and column_name in ('contexte_demande','cout_prestation_estime','cout_prestation_reel');
--   -- attendu : 3 lignes
--
--   select count(*) from information_schema.tables
--   where table_schema='public' and table_name in ('recommandations_objectifs','partages_etude_client');
--   -- attendu : 2
--
--   select count(*) from public.recommandations;
--   -- attendu : 1703, inchangé (aucune ligne réécrite)
