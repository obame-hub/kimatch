-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN CONTRAT CLIENT EXPIRÉ REND LE COMPTEUR PROSPECT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 01/10/2026, juste après `un_compteur_est_client_ou_prospect` : « si le dernier contrat
-- est un contrat client mais que ce dernier est expiré, alors le compteur sera prospect ».
--
-- EXPIRÉ : sa fin est passée, ou il est résilié (statut RESILIE, ou résiliation datée d'aujourd'hui
-- ou avant). Le jour se lit à Paris, comme partout ailleurs dans la base.
--
-- ⚠️ La question du tacite (un contrat tacitement reconduit garde-t-il sa date de fin ?) reste posée
-- à Michel — voir `api/contrats/reevaluer-statuts.ts`. La règle de William s'applique à la date de
-- fin telle qu'elle est saisie.
--
-- ══ LE TEMPS PASSE SANS QUE RIEN NE S'ÉCRIVE ══
--
-- Un contrat expire sans qu'aucune ligne ne change : aucun déclencheur ne le voit. La base n'a pas
-- de planificateur (ni pg_cron ni pg_net). `fn_reevaluer_statuts_contractuels()` recalcule donc les
-- compteurs dont le statut a changé, et la tâche de nuit `api/contrats/reevaluer-statuts` l'appelle.

create or replace function public.fn_statut_contractuel_compteur(p_compteur uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui),
  candidats as (
    select 'CLIENT'::text as nature, c.date_debut as debut, c.date_fin as fin, c.date_creation as cree,
           (s.code = 'RESILIE' or (c.date_resiliation is not null and c.date_resiliation <= j.aujourdhui)
            or (c.date_fin is not null and c.date_fin < j.aujourdhui)) as expire
    from public.contrats_compteurs cc
    join public.contrats c on c.id = cc.contrat_id
    join public.statuts_contrats s on s.id = c.statut_id
    cross join jour j
    where cc.compteur_id = p_compteur
      and c.actif
      and s.code in ('SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE', 'RESILIE')
    union all
    select 'PROSPECT', p.date_debut, p.date_fin, p.date_creation, false
    from public.contrats_prospects p
    where p.compteur_id = p_compteur
  ), classes as (
    select k.*,
      (k.fin is null and not exists (
        select 1 from candidats o
        where o.fin is not null and o.debut is not null and k.debut is not null and o.debut >= k.debut
      )) as ouvert
    from candidats k
  )
  select case when nature = 'CLIENT' and expire then 'PROSPECT' else nature end
  from classes
  where ouvert or fin is not null
  order by ouvert desc, fin desc nulls last, cree desc
  limit 1
$$;

revoke all on function public.fn_statut_contractuel_compteur(uuid) from public, anon, authenticated;

-- La date de résiliation compte aussi, désormais.
drop trigger if exists trg_statut_contractuel on public.contrats;
create trigger trg_statut_contractuel
  after insert or delete or update of statut_id, date_debut, date_fin, date_resiliation, actif on public.contrats
  for each row execute function public.fn_trg_statut_contractuel();

/* Le rattrapage quotidien : ne réécrit que les compteurs dont le statut a changé, et rend leur
   nombre pour le rapport de la tâche de nuit. */
create or replace function public.fn_reevaluer_statuts_contractuels()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with calcul as (
    select m.id, public.fn_statut_contractuel_compteur(m.id) as statut
    from public.compteurs m
  )
  update public.compteurs m
     set statut_contractuel = calcul.statut
    from calcul
   where calcul.id = m.id
     and m.statut_contractuel is distinct from calcul.statut;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.fn_reevaluer_statuts_contractuels() from public, anon, authenticated;
grant execute on function public.fn_reevaluer_statuts_contractuels() to service_role;

-- La reprise : la nouvelle règle sur l'existant, sans marquer 1 400 compteurs « modifiés aujourd'hui ».
alter table public.compteurs disable trigger trg_audit_trace;
select public.fn_reevaluer_statuts_contractuels();
alter table public.compteurs enable trigger trg_audit_trace;
