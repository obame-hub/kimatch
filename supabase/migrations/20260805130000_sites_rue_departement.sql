-- Champs manquants signalés par le Claude de William en préparant la refonte de la Fiche Site :
-- rue (adresse déjà présente mais pas découpée en numéro+rue séparément du reste),
-- departement_code/departement_nom (existent déjà sur comptes, jamais ajoutés sur sites).
alter table public.sites
  add column if not exists rue text,
  add column if not exists departement_code text,
  add column if not exists departement_nom text;

comment on column public.sites.rue is 'Rue (numéro + voie), distincte de adresse -- ajoutée le 05/08/2026 pour la Fiche Site calquée sur le design.';
comment on column public.sites.departement_code is 'Code département (ex. "75"), même logique que comptes.departement_code.';
comment on column public.sites.departement_nom is 'Nom du département (ex. "Paris"), même logique que comptes.departement_nom.';
