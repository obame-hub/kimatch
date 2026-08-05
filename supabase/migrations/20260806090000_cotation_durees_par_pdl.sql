-- ============================================================
-- Flot Version/Cotation : rendre persistantes les réponses du wizard
--
-- Aujourd'hui les durées, le type de prix et la date souhaitée choisis dans le wizard de cotation
-- ne sont écrits NULLE PART : ils finissent uniquement dans le texte de `versions_recommandation.
-- resume` ("Durées 24/36 mois — Fixe — 3 fournisseurs consultés"). Impossible de filtrer, de
-- recalculer une commission, ou de comparer deux versions dessus.
--
-- Tools attache les durées à CHAQUE PDL (StepCharacteristics : `pdlDurations[pdlId] = number[]`,
-- 3 maximum par compteur) puis en aplatit l'union pour le fan-out fournisseur. On reprend ce
-- modèle : une ligne par (version, compteur, durée).
-- ============================================================

create table if not exists public.versions_recommandation_durees (
  version_recommandation_id uuid not null references public.versions_recommandation(id) on delete cascade,
  compteur_id uuid not null references public.compteurs(id) on delete cascade,
  duree_mois int not null,
  primary key (version_recommandation_id, compteur_id, duree_mois),
  -- Mêmes bornes que la saisie libre « Autre » de Tools (addCustomDuration : 1 à 60).
  constraint versions_recommandation_durees_bornes check (duree_mois between 1 and 60)
);

comment on table public.versions_recommandation_durees is
  'Durées de contrat demandées, PAR PDL, pour une version de recommandation (cotation) — Tools: StepCharacteristics.pdlDurations. Le maximum de 3 durées par compteur est une règle applicative, pas une contrainte SQL (Tools fait pareil).';
comment on column public.versions_recommandation_durees.duree_mois is
  'Durée en mois. Préréglages 12/24/36/48/60 + saisie libre 1-60.';

create index if not exists idx_versions_reco_durees_version
  on public.versions_recommandation_durees(version_recommandation_id);

alter table public.versions_recommandation_durees enable row level security;
create policy "authenticated_all" on public.versions_recommandation_durees for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Mêmes symptômes pour les deux autres réponses du wizard, qui vivent elles aussi uniquement
-- dans du texte libre aujourd'hui. Elles sont globales à la version (et non par PDL) dans Tools
-- comme dans Kimatch, donc de simples colonnes suffisent.
-- ------------------------------------------------------------
alter table public.versions_recommandation
  add column if not exists types_prix text[] not null default '{}',
  add column if not exists date_souhaitee date;

comment on column public.versions_recommandation.types_prix is
  'Types de prix demandés : Fixe et/ou Indexé — sélection MULTIPLE, pas exclusive (Tools: StepPriceType)';
comment on column public.versions_recommandation.date_souhaitee is
  'Date de réception souhaitée des offres (Tools: StepDate)';
