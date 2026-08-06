-- ============================================================
-- Moteur d'eligibilite fournisseur : schema + donnees reelles de Tools
-- (19 fournisseurs, 12 regles, 21 mappings, export du 04/08/2026)
--
-- Remplace 20260804240000_eligibility_engine.sql, qui n'a JAMAIS ete appliquee en production :
-- verifie le 06/08, la colonne comptes_fournisseurs.partnership n'existe meme pas
-- (ERROR 42703). Consequence : dans le wizard Cotation les 52 fournisseurs sont grises
-- « Partenariat non reconnu », aucune cotation n'est possible, le circuit s'arrete a l'opportunite.
--
-- Cette version est AUTO-SUFFISANTE (cree tables et colonnes avant d'inserer) et corrige un piege
-- de l'originale : elle matche les comptes par nom exact, or « ALTERNA ENERGIE » cote Tools
-- s'appelle « ALTERNA » cote Kimatch. Le select ne renvoyant rien, l'insert etait saute SANS
-- ERREUR. Verifie nom par nom contre les 52 fournisseurs reels : c'est le seul ecart.
--
-- Entierement idempotente : rejouable sans risque.
-- ============================================================

-- ---------- 1. Schema ----------
create table if not exists public.eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  name text not null,
  description text,
  level text not null default 'opportunity',
  is_active boolean not null default true,
  condition_field text,
  condition_operator text not null default 'eq',
  condition_value text,
  value_operator text not null default 'OU',
  sort_order int not null default 0,
  date_creation timestamptz not null default now()
);
alter table public.eligibility_rules enable row level security;
drop policy if exists "authenticated_all" on public.eligibility_rules;
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
drop policy if exists "authenticated_all" on public.mapping_rules;
create policy "authenticated_all" on public.mapping_rules for all to authenticated using (true) with check (true);

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

-- ---------- 2. Regles d'eligibilite (12) ----------
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('partnership', 'Partenariat', 'Le fournisseur doit avoir un partenariat Kiwee ou Intermédiaire', 'account', true, null, 'eq', null, 'OU', 1)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('target', 'Cible (Type de compte)', 'Le type de compte Salesforce doit correspondre aux cibles du fournisseur', 'account', true, null, 'eq', null, 'OU', 2)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('score_ellipro', 'Score Ellipro', 'Le score Ellipro du compte doit être supérieur ou égal au minimum du fournisseur', 'account', true, null, 'eq', null, 'OU', 3)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('energy', 'Énergie', 'L''énergie de l''opportunité doit correspondre aux énergies du fournisseur', 'opportunity', true, null, 'eq', null, 'OU', 4)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('ddf', 'Date de début de fourniture (DDF)', 'La DDF (échéance + 1 jour) ne doit pas dépasser la DDF max du fournisseur', 'pdl', true, null, 'eq', null, 'OU', 5)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('tariff', 'Tarif de distribution', 'Le tarif de distribution du compteur doit être proposé par le fournisseur', 'pdl', true, 'energy', 'eq', 'Gaz', 'OU', 6)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('profile', 'Profil', 'Le profil du compteur doit être proposé par le fournisseur', 'pdl', true, 'energy', 'eq', 'Gaz', 'OU', 7)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('segment', 'Segment', 'Le segment du compteur doit être proposé par le fournisseur', 'pdl', true, 'energy', 'neq', 'Gaz', 'OU', 8)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('consumption', 'Consommation annuelle', 'La consommation annuelle doit être dans la fourchette du fournisseur', 'pdl', true, null, 'eq', null, 'OU', 9)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('dff', 'Date de fin de fourniture (DFF)', 'La DFF ne doit pas dépasser la DFF max du fournisseur', 'pdl', true, null, 'eq', null, 'OU', 10)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('response_delay', 'Délai de réponse', 'Le fournisseur doit pouvoir répondre dans le délai demandé (première demande)', 'characteristics', true, 'request_type', 'eq', 'premiere_demande', 'OU', 11)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;
insert into public.eligibility_rules (rule_key, name, description, level, is_active, condition_field, condition_operator, condition_value, value_operator, sort_order)
values ('update_delay', 'Délai d''actualisation', 'Le fournisseur doit pouvoir actualiser dans le délai demandé', 'characteristics', true, 'request_type', 'neq', 'premiere_demande', 'OU', 12)
on conflict (rule_key) do update set
  name = excluded.name, description = excluded.description, level = excluded.level,
  is_active = excluded.is_active, condition_field = excluded.condition_field,
  condition_operator = excluded.condition_operator, condition_value = excluded.condition_value,
  value_operator = excluded.value_operator, sort_order = excluded.sort_order;

-- ---------- 3. Regles de mapping (21) ----------
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Gaz', 'Gaz Naturel', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'energy' and salesforce_value = 'Gaz'
    and supplier_value = 'Gaz Naturel'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Électricité', 'Électricité', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'energy' and salesforce_value = 'Électricité'
    and supplier_value = 'Électricité'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Gaz Naturel', 'Gaz Naturel', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'energy' and salesforce_value = 'Gaz Naturel'
    and supplier_value = 'Gaz Naturel'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Électricité', 'Electricité', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'energy' and salesforce_value = 'Électricité'
    and supplier_value = 'Electricité'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Elec', 'Electricité', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'energy' and salesforce_value = 'Elec'
    and supplier_value = 'Electricité'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'energy', 'Electricite', 'Electricité', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'energy' and salesforce_value = 'Electricite'
    and supplier_value = 'Electricité'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'target', 'Syndic', 'Syndic professionnel', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'target' and salesforce_value = 'Syndic'
    and supplier_value = 'Syndic professionnel'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'tariff', 'T1', 'T1', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'tariff' and salesforce_value = 'T1'
    and supplier_value = 'T1'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'tariff', 'T2', 'T2', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'tariff' and salesforce_value = 'T2'
    and supplier_value = 'T2'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'tariff', 'T3', 'T3', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'tariff' and salesforce_value = 'T3'
    and supplier_value = 'T3'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'tariff', 'T4', 'T4', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'tariff' and salesforce_value = 'T4'
    and supplier_value = 'T4'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'profile', 'P011', 'P011', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'profile' and salesforce_value = 'P011'
    and supplier_value = 'P011'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'profile', 'P012', 'P012', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'profile' and salesforce_value = 'P012'
    and supplier_value = 'P012'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'profile', 'P013', 'P013', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'profile' and salesforce_value = 'P013'
    and supplier_value = 'P013'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'profile', 'P014', 'P014', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'profile' and salesforce_value = 'P014'
    and supplier_value = 'P014'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'profile', 'P019', 'P019', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'profile' and salesforce_value = 'P019'
    and supplier_value = 'P019'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'segment', 'C1', 'C1', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'segment' and salesforce_value = 'C1'
    and supplier_value = 'C1'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'segment', 'C2', 'C2', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'segment' and salesforce_value = 'C2'
    and supplier_value = 'C2'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'segment', 'C3', 'C3', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'segment' and salesforce_value = 'C3'
    and supplier_value = 'C3'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'segment', 'C4', 'C4', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'segment' and salesforce_value = 'C4'
    and supplier_value = 'C4'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);
insert into public.mapping_rules (field_name, salesforce_value, supplier_value, condition_field, condition_value, operator)
select 'segment', 'C5', 'C5', null, null, 'OU'
where not exists (
  select 1 from public.mapping_rules
  where field_name = 'segment' and salesforce_value = 'C5'
    and supplier_value = 'C5'
    and condition_field is not distinct from null
    and condition_value is not distinct from null);

-- ---------- 4. Criteres des 19 fournisseurs ----------
-- GAZ EUROPEEN
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF',
  'kiwee', null, '{"Syndic professionnel","Entreprise"}', '{"Gaz Naturel"}',
  '{}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}',
  null, null, null,
  null::date, '2030-12-31'::date,
  1, 1, 60,
  'premium', true
from public.comptes where upper(nom) = upper('GAZ EUROPEEN') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- LA BELLENERGIE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, false, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité"}',
  '{"C5","C4"}', '{}', '{}',
  null, null, null,
  null::date, null::date,
  2, 2, null,
  'marginal', true
from public.comptes where upper(nom) = upper('LA BELLENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- SELIA
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C1","C2","C3","C4"}', '{"T2","T3","T4"}', '{"P012","P013","P014","P015","P016","P017","P018","P019"}',
  null, null, 4,
  null::date, '2032-01-01'::date,
  2, 1, null,
  'situationnel', true
from public.comptes where upper(nom) = upper('SELIA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- PICOTY
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel","Syndic non professionnel"}', '{"Gaz Naturel"}',
  '{}', '{"T1","T2","T3","T4"}', '{"P012","P013","P011","P014","P015","P016","P017","P018","P019"}',
  null, null, 4,
  null::date, '2032-04-01'::date,
  2, 1, 30,
  'premium', true
from public.comptes where upper(nom) = upper('PICOTY') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- GEDIA
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C1","C2","C3","C4"}', '{"T1","T2","T3","T4"}', '{"P013","P011","P012","P014","P015","P016","P019","P017","P018"}',
  50, null, 7,
  null::date, '2029-12-31'::date,
  2, 1, 30,
  'premium', true
from public.comptes where upper(nom) = upper('GEDIA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- GME FRANCE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel"}', '{"Gaz Naturel"}',
  '{}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}',
  150, null, 4,
  null::date, '2030-12-31'::date,
  0, 0, 30,
  'situationnel', true
from public.comptes where upper(nom) = upper('GME FRANCE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- ENDESA
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'aucun', 'OBD', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C2","C4","C3"}', '{"T1","T2","T3"}', '{"P011","P013","P012","P014","P015","P016","P017"}',
  null, null, 4,
  null::date, '2030-12-31'::date,
  2, 2, 30,
  'marginal', true
from public.comptes where upper(nom) = upper('ENDESA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- ALTERNA ENERGIE  (nomme « ALTERNA » dans Kimatch)  -- aucune energie declaree dans Tools : restera inelig. partout (energy_types vide)
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'intermediaire', 'OBD', '{}', '{}',
  '{}', '{}', '{}',
  null, null, null,
  null::date, null::date,
  null, null, null,
  'situationnel', true
from public.comptes where upper(nom) = upper('ALTERNA') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- SAVE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Syndic professionnel","Entreprise"}', '{"Gaz Naturel"}',
  '{}', '{"T3"}', '{"P016"}',
  null, null, 4,
  null::date, '2032-01-01'::date,
  0, 0, null,
  'situationnel', true
from public.comptes where upper(nom) = upper('SAVE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- HELLIO
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, false, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité"}',
  '{}', '{}', '{}',
  null, null, null,
  null::date, null::date,
  null, null, null,
  'marginal', true
from public.comptes where upper(nom) = upper('HELLIO') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- GEG
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Syndic professionnel","Entreprise"}', '{"Gaz Naturel"}',
  '{}', '{"T1","T2","T3","T4"}', '{"P012","P011","P014","P013","P015","P016","P017","P018","P019"}',
  300, null, 4,
  null::date, '2030-12-31'::date,
  2, 2, 30,
  'situationnel', true
from public.comptes where upper(nom) = upper('GEG') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- ILEK
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C5"}', '{"T1","T2"}', '{"P011","P012"}',
  null, null, 1,
  null::date, '2031-12-31'::date,
  0, 0, 30,
  'situationnel', true
from public.comptes where upper(nom) = upper('ILEK') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- ENERGEM
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité","Gaz Naturel"}',
  '{"C1","C2","C3","C4"}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}',
  null, null, 4,
  null::date, '2031-01-01'::date,
  2, 1, null,
  'situationnel', true
from public.comptes where upper(nom) = upper('ENERGEM') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- PRIMEO ENERGIE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, false, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise"}', '{"Électricité"}',
  '{"C1","C2","C3","C4"}', '{}', '{}',
  null, null, 3,
  '2029-01-01'::date, '2031-01-01'::date,
  2, 1, 30,
  'situationnel', true
from public.comptes where upper(nom) = upper('PRIMEO ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- GAZEL ENERGIE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'intermediaire', 'Energix', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C1","C2","C3","C4"}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}',
  null, null, 3,
  '2029-01-01'::date, '2031-01-01'::date,
  2, 1, null,
  'marginal', true
from public.comptes where upper(nom) = upper('GAZEL ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- MET ENERGIE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C1","C2","C3","C4","C5"}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P018","P019","P017"}',
  null, null, 4,
  null::date, '2030-12-31'::date,
  0, 0, 30,
  'situationnel', true
from public.comptes where upper(nom) = upper('MET ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- OHM ENERGIE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'kiwee', null, '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C1","C2","C4","C5","C3"}', '{"T4","T3","T2","T1"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}',
  null, null, 6,
  null::date, '2029-12-31'::date,
  0, 0, 30,
  'situationnel', true
from public.comptes where upper(nom) = upper('OHM ENERGIE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- TOTAL ENERGIES
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, true, true, 'ACTIF',
  'intermediaire', 'OBD', '{"Entreprise","Syndic professionnel"}', '{"Électricité","Gaz Naturel"}',
  '{"C5","C4"}', '{"T1","T2"}', '{"P011","P012"}',
  null, null, 3,
  null::date, '2029-12-31'::date,
  0, 0, 45,
  'premium', true
from public.comptes where upper(nom) = upper('TOTAL ENERGIES') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;
-- SEFE
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, true, 'ACTIF',
  'kiwee', null, '{"Entreprise"}', '{"Gaz Naturel"}',
  '{}', '{"T1","T2","T3","T4"}', '{"P011","P012","P013","P014","P015","P016","P017","P018","P019"}',
  null, null, 3,
  null::date, '2031-01-01'::date,
  0, 0, 30,
  'premium', true
from public.comptes where upper(nom) = upper('SEFE') and type_compte = 'fournisseur'
on conflict (compte_id) do update set
  fournit_electricite = excluded.fournit_electricite, fournit_gaz = excluded.fournit_gaz,
  statut_partenariat = excluded.statut_partenariat, partnership = excluded.partnership,
  intermediary = excluded.intermediary, targets = excluded.targets, energy_types = excluded.energy_types,
  segments = excluded.segments, tariffs = excluded.tariffs, profiles = excluded.profiles,
  min_consumption = excluded.min_consumption, max_consumption = excluded.max_consumption,
  min_ellipro_score = excluded.min_ellipro_score, max_ddf = excluded.max_ddf, max_dff = excluded.max_dff,
  response_delay_days = excluded.response_delay_days, update_delay_days = excluded.update_delay_days,
  notice_days = excluded.notice_days, partner_category = excluded.partner_category,
  is_active = excluded.is_active;

-- ---------- Controle ----------
-- Doit renvoyer 19. Moins = un fournisseur non retrouve par nom (ajouter un alias).
--   select count(*) from public.comptes_fournisseurs where partnership is not null;
--   select count(*) from public.eligibility_rules;   -- 12
--   select count(*) from public.mapping_rules;       -- 21
--   select c.nom, cf.partnership, cf.intermediary
--   from public.comptes_fournisseurs cf join public.comptes c on c.id = cf.compte_id
--   where cf.partnership is not null order by c.nom;
