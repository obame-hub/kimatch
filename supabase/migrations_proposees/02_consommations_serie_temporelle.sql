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
