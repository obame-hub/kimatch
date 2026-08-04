-- ============================================================
-- Flot Version/Cotation (Tools) : moteur d'éligibilité fournisseur
-- Données réelles portées depuis Tools (19 fournisseurs, 12 règles, 21 mappings)
-- ============================================================

create table if not exists public.eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  description text,
  level text not null,
  is_active boolean not null default true,
  condition_field text,
  condition_operator text not null default 'eq',
  condition_value text,
  value_operator text not null default 'OU',
  sort_order int not null default 0,
  date_creation timestamptz not null default now()
);
alter table public.eligibility_rules enable row level security;
create policy "authenticated_all" on public.eligibility_rules for all to authenticated using (true) with check (true);

create table if not exists public.mapping_rules (
  id uuid primary key default gen_random_uuid(),
  field_name text not null,
  salesforce_value text not null,
  supplier_value text not null,
  condition_field text,
  condition_value text,
  operator text not null default 'OU',
  date_creation timestamptz not null default now()
);
alter table public.mapping_rules enable row level security;
create policy "authenticated_all" on public.mapping_rules for all to authenticated using (true) with check (true);

-- Critères d'éligibilité fournisseur, en plus des colonnes déjà existantes sur
-- comptes_fournisseurs (fournit_electricite/fournit_gaz/statut_partenariat/...).
alter table public.comptes_fournisseurs
  add column if not exists partnership text,
  add column if not exists intermediary text,
  add column if not exists targets text[] not null default '{}',
  add column if not exists energy_types text[] not null default '{}',
  add column if not exists segments text[] not null default '{}',
  add column if not exists tariffs text[] not null default '{}',
  add column if not exists profiles text[] not null default '{}',
  add column if not exists min_consumption numeric,
  add column if not exists max_consumption numeric,
  add column if not exists min_ellipro_score numeric,
  add column if not exists max_ddf date,
  add column if not exists max_dff date,
  add column if not exists response_delay_days int,
  add column if not exists update_delay_days int,
  add column if not exists notice_days int,
  add column if not exists partner_category text,
  add column if not exists is_active boolean not null default true;

begin;

-- ---------- eligibility_rules (12 lignes réelles) ----------
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order) values
  ('partnership', 'Partenariat', 'Le fournisseur doit avoir un partenariat Kiwee ou Intermédiaire', 'account', true, null, 'eq', null, 'OU', 1),
  ('target', 'Cible (Type de compte)', 'Le type de compte Salesforce doit correspondre aux cibles du fournisseur', 'account', true, null, 'eq', null, 'OU', 2),
  ('score_ellipro', 'Score Ellipro', 'Le score Ellipro du compte doit être supérieur ou égal au minimum du fournisseur', 'account', true, null, 'eq', null, 'OU', 3),
  ('energy', 'Énergie', 'L''énergie de l''opportunité doit correspondre aux énergies du fournisseur', 'opportunity', true, null, 'eq', null, 'OU', 4),
  ('ddf', 'Date de début de fourniture (DDF)', 'La DDF (échéance + 1 jour) ne doit pas dépasser la DDF max du fournisseur', 'pdl', true, null, 'eq', null, 'OU', 5),
  ('tariff', 'Tarif de distribution', 'Le tarif de distribution du compteur doit être proposé par le fournisseur', 'pdl', true, 'energy', 'eq', 'Gaz', 'OU', 6),
  ('profile', 'Profil', 'Le profil du compteur doit être proposé par le fournisseur', 'pdl', true, 'energy', 'eq', 'Gaz', 'OU', 7),
  ('segment', 'Segment', 'Le segment du compteur doit être proposé par le fournisseur', 'pdl', true, 'energy', 'neq', 'Gaz', 'OU', 8),
  ('consumption', 'Consommation annuelle', 'La consommation annuelle doit être dans la fourchette du fournisseur', 'pdl', true, null, 'eq', null, 'OU', 9),
  ('dff', 'Date de fin de fourniture (DFF)', 'La DFF ne doit pas dépasser la DFF max du fournisseur', 'pdl', true, null, 'eq', null, 'OU', 10),
  ('response_delay', 'Délai de réponse', 'Le fournisseur doit pouvoir répondre dans le délai demandé (première demande)', 'characteristics', true, 'request_type', 'eq', 'premiere_demande', 'OU', 11),
  ('update_delay', 'Délai d''actualisation', 'Le fournisseur doit pouvoir actualiser dans le délai demandé', 'characteristics', true, 'request_type', 'neq', 'premiere_demande', 'OU', 12)
on conflict (rule_key) do nothing;

-- ---------- mapping_rules (21 lignes réelles) ----------
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator) values
  ('energy', 'Gaz', 'Gaz Naturel', null, null, 'OU'),
  ('energy', 'Électricité', 'Électricité', null, null, 'OU'),
  ('energy', 'Gaz Naturel', 'Gaz Naturel', null, null, 'OU'),
  ('energy', 'Électricité', 'Electricité', null, null, 'OU'),
  ('energy', 'Elec', 'Electricité', null, null, 'OU'),
  ('energy', 'Electricite', 'Electricité', null, null, 'OU'),
  ('target', 'Syndic', 'Syndic professionnel', null, null, 'OU'),
  ('tariff', 'T1', 'T1', null, null, 'OU'),
  ('tariff', 'T2', 'T2', null, null, 'OU'),
  ('tariff', 'T3', 'T3', null, null, 'OU'),
  ('tariff', 'T4', 'T4', null, null, 'OU'),
  ('profile', 'P011', 'P011', null, null, 'OU'),
  ('profile', 'P012', 'P012', null, null, 'OU'),
  ('profile', 'P013', 'P013', null, null, 'OU'),
  ('profile', 'P014', 'P014', null, null, 'OU'),
  ('profile', 'P019', 'P019', null, null, 'OU'),
  ('segment', 'C1', 'C1', null, null, 'OU'),
  ('segment', 'C2', 'C2', null, null, 'OU'),
  ('segment', 'C3', 'C3', null, null, 'OU'),
  ('segment', 'C4', 'C4', null, null, 'OU'),
  ('segment', 'C5', 'C5', null, null, 'OU')
;

-- ---------- Critères des 19 fournisseurs réels, matchés par nom de compte ----------
-- (les fournisseurs existent déjà comme comptes Kimatch, créés lors de la migration Salesforce)
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF', 'kiwee', null, '{"Syndic professionnel","Entreprise"}', '{"Gaz Naturel"}', '{}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}', null, null, null, null, '2030-12-31', 1, 1, 60, 'premium', true
from public.comptes where upper(nom) = upper('GAZ EUROPEEN') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, false, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité"}', '{"C5","C4"}', '{}', '{}', null, null, null, null, null, 2, 2, null, 'marginal', true
from public.comptes where upper(nom) = upper('LA BELLENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C1","C2","C3","C4"}', '{"T2","T3","T4"}', '{"P012","P013","P014","P015","P016","P017","P018","P019"}', null, null, 4, null, '2032-01-01', 2, 1, null, 'situationnel', true
from public.comptes where upper(nom) = upper('SELIA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel","Syndic non professionnel"}', '{"Gaz Naturel"}', '{}', '{"T1","T2","T3","T4"}', '{"P012","P013","P011","P014","P015","P016","P017","P018","P019"}', null, null, 4, null, '2032-04-01', 2, 1, 30, 'premium', true
from public.comptes where upper(nom) = upper('PICOTY') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C1","C2","C3","C4"}', '{"T1","T2","T3","T4"}', '{"P013","P011","P012","P014","P015","P016","P019","P017","P018"}', 50, null, 7, null, '2029-12-31', 2, 1, 30, 'premium', true
from public.comptes where upper(nom) = upper('GEDIA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel"}', '{"Gaz Naturel"}', '{}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}', 150, null, 4, null, '2030-12-31', 0, 0, 30, 'situationnel', true
from public.comptes where upper(nom) = upper('GME FRANCE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'aucun', 'OBD', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C2","C4","C3"}', '{"T1","T2","T3"}', '{"P011","P013","P012","P014","P015","P016","P017"}', null, null, 4, null, '2030-12-31', 2, 2, 30, 'marginal', true
from public.comptes where upper(nom) = upper('ENDESA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, false, 'ACTIF', 'intermediaire', 'OBD', '{}', '{}', '{}', '{}', '{}', null, null, null, null, null, null, null, null, 'situationnel', true
from public.comptes where upper(nom) = upper('ALTERNA ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF', 'intermediaire', 'Energix', '{"Syndic professionnel","Entreprise"}', '{"Gaz Naturel"}', '{}', '{"T3"}', '{"P016"}', null, null, 4, null, '2032-01-01', 0, 0, null, 'situationnel', true
from public.comptes where upper(nom) = upper('SAVE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, false, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité"}', '{}', '{}', '{}', null, null, null, null, null, null, null, null, 'marginal', true
from public.comptes where upper(nom) = upper('HELLIO') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF', 'intermediaire', 'Energix', '{"Syndic professionnel","Entreprise"}', '{"Gaz Naturel"}', '{}', '{"T1","T2","T3","T4"}', '{"P012","P011","P014","P013","P015","P016","P017","P018","P019"}', 300, null, 4, null, '2030-12-31', 2, 2, 30, 'situationnel', true
from public.comptes where upper(nom) = upper('GEG') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C5"}', '{"T1","T2"}', '{"P011","P012"}', null, null, 1, null, '2031-12-31', 0, 0, 30, 'situationnel', true
from public.comptes where upper(nom) = upper('ILEK') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité","Gaz Naturel"}', '{"C1","C2","C3","C4"}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}', null, null, 4, null, '2031-01-01', 2, 1, null, 'situationnel', true
from public.comptes where upper(nom) = upper('ENERGEM') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, false, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité"}', '{"C1","C2","C3","C4"}', '{}', '{}', null, null, 3, '2029-01-01', '2031-01-01', 2, 1, 30, 'situationnel', true
from public.comptes where upper(nom) = upper('PRIMEO ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C1","C2","C3","C4"}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}', null, null, 3, '2029-01-01', '2031-01-01', 2, 1, null, 'marginal', true
from public.comptes where upper(nom) = upper('GAZEL ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C1","C2","C3","C4","C5"}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P018","P019","P017"}', null, null, 4, null, '2030-12-31', 0, 0, 30, 'situationnel', true
from public.comptes where upper(nom) = upper('MET ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C1","C2","C4","C5","C3"}', '{"T4","T3","T2","T1"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}', null, null, 6, null, '2029-12-31', 0, 0, 30, 'situationnel', true
from public.comptes where upper(nom) = upper('OHM ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF', 'intermediaire', 'OBD', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}', '{"C5","C4"}', '{"T1","T2"}', '{"P011","P012"}', null, null, 3, null, '2029-12-31', 0, 0, 45, 'premium', true
from public.comptes where upper(nom) = upper('TOTAL ENERGIES') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
insert into public.comptes_fournisseurs (compte_id, fournit_electricite, fournit_gaz, statut_partenariat, partnership, intermediary, targets, energy_types, segments, tariffs, profiles, min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff, response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF', 'kiwee', null, '{"Entreprise"}', '{"Gaz Naturel"}', '{}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}', null, null, 3, null, '2031-01-01', 0, 0, 30, 'premium', true
from public.comptes where upper(nom) = upper('SEFE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  partnership = excluded.partnership, intermediary = excluded.intermediary, targets = excluded.targets,
  energy_types = excluded.energy_types, segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption, min_ellipro_score = excluded.min_ellipro_score,
  max_ddf = excluded.max_ddf, max_dff = excluded.max_dff, response_delay_days = excluded.response_delay_days,
  update_delay_days = excluded.update_delay_days, notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;

commit;