-- ============================================================
-- BACKFILL : remettre au statut ACTIF les mandats signés et encore valides
--
-- Constat du 06/08/2026, en production : sur les 1429 mandats migrés depuis Salesforce,
-- **AUCUN n'est au statut ACTIF** — tous sont restés sur « À préparer », y compris ceux qui
-- portent une date de signature et un périmètre de sites (ex. « Signé le 23/03/2026 », 1 site
-- couvert, statut « À préparer »). Le statut n'a donc pas été repris à la migration.
--
-- Conséquence bloquante : le wizard Opportunité ne propose que les PDL couverts par un mandat
-- ACTIF. Sans un seul mandat actif, **aucune opportunité ne peut être créée dans Kimatch**, donc
-- ni cotation ni demande de contrat. Tout le circuit est à l'arrêt sur les données réelles.
--
-- ⚠️ ÉCRITURE DE MASSE — à relire avant application. La règle retenue est volontairement
-- conservatrice : un mandat est ACTIF s'il est signé ET encore dans sa période de validité.
-- Les mandats signés mais expirés passent à EXPIRE, ce qui est la réalité métier.
-- Rien n'est touché pour les mandats sans date de signature (vraies préparations en cours).
-- ============================================================

-- Contrôle AVANT : à exécuter seul d'abord pour voir ce qui va changer.
--   select s.code, count(*)
--   from public.mandats m left join public.statuts_mandats s on s.id = m.statut_id
--   group by s.code order by 2 desc;
--
--   select count(*) filter (where date_signature is not null)                        as signes,
--          count(*) filter (where date_signature is not null
--                             and (date_fin_validite is null or date_fin_validite >= current_date)) as a_passer_actif,
--          count(*) filter (where date_signature is not null
--                             and date_fin_validite < current_date)                  as a_passer_expire
--   from public.mandats;

begin;

-- 1) Signé + encore valide (ou sans date de fin connue) → ACTIF
update public.mandats m
set statut_id = (select id from public.statuts_mandats where code = 'ACTIF')
where m.date_signature is not null
  and (m.date_fin_validite is null or m.date_fin_validite >= current_date)
  and exists (select 1 from public.statuts_mandats where code = 'ACTIF')
  and m.statut_id is distinct from (select id from public.statuts_mandats where code = 'ACTIF');

-- 2) Signé mais période écoulée → EXPIRE (ne pas les faire passer pour actifs)
update public.mandats m
set statut_id = (select id from public.statuts_mandats where code = 'EXPIRE')
where m.date_signature is not null
  and m.date_fin_validite is not null
  and m.date_fin_validite < current_date
  and exists (select 1 from public.statuts_mandats where code = 'EXPIRE')
  and m.statut_id is distinct from (select id from public.statuts_mandats where code = 'EXPIRE');

commit;

-- Contrôle APRÈS :
--   select s.code, count(*)
--   from public.mandats m left join public.statuts_mandats s on s.id = m.statut_id
--   group by s.code order by 2 desc;
