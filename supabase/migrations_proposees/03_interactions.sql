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
