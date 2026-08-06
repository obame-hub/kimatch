-- ============================================================
-- Criteres d'eligibilite des 19 fournisseurs, portes depuis l'export Tools du 04/08/2026
-- (suppliers.csv fourni par Naoelle).
--
-- Pourquoi cette migration alors que 20260804240000_eligibility_engine.sql fait deja ce travail :
-- elle n'a jamais ete appliquee en production. Constat du 06/08 dans le wizard Cotation : les 52
-- fournisseurs sont grises avec « Partenariat non reconnu », donc aucune cotation n'est possible
-- et le circuit s'arrete a l'opportunite.
--
-- Et la rejouer telle quelle aurait laisse un trou : elle matche les comptes par nom exact, or
-- « ALTERNA ENERGIE » cote Tools s'appelle « ALTERNA » cote Kimatch. Le SELECT ne renvoyant rien,
-- l'INSERT est saute SANS ERREUR. Cette version corrige l'alias et compte les lignes traitees.
--
-- Idempotent : ON CONFLICT (compte_id) DO UPDATE. Les 33 autres comptes fournisseurs restent
-- sans partenariat, ce qui est conforme a Tools (ils ne sont pas consultables).
-- ============================================================

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

-- ALTERNA ENERGIE  (nomme « ALTERNA » dans Kimatch)
insert into public.comptes_fournisseurs (
  compte_id, fournit_electricite, fournit_gaz, statut_partenariat,
  partnership, intermediary, targets, energy_types, segments, tariffs, profiles,
  min_consumption, max_consumption, min_ellipro_score, max_ddf, max_dff,
  response_delay_days, update_delay_days, notice_days, partner_category, is_active)
select id, false, false, 'ACTIF',
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


-- Controle : doit renvoyer 19. Toute valeur inferieure signale un fournisseur non retrouve par nom.
--   select count(*) from public.comptes_fournisseurs where partnership is not null and partnership <> 'aucun';
--   select c.nom, cf.partnership, cf.intermediary
--   from public.comptes_fournisseurs cf join public.comptes c on c.id = cf.compte_id
--   where cf.partnership is not null order by c.nom;
