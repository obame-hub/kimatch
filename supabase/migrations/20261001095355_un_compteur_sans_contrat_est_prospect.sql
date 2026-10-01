-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR SANS CONTRAT EST PROSPECT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 01/10/2026 : « s'il n'y a aucun contrat, alors le compteur est prospect ». Le statut n'est
-- donc plus jamais vide : CLIENT seulement avec un contrat KiWee signé et non expiré comme dernier
-- contrat connu, PROSPECT dans tous les autres cas. Un compteur qui naît, sans contrat, naît prospect.

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
  select coalesce((
    select case when nature = 'CLIENT' and expire then 'PROSPECT' else nature end
    from classes
    where ouvert or fin is not null
    order by ouvert desc, fin desc nulls last, cree desc
    limit 1
  ), 'PROSPECT')
$$;

revoke all on function public.fn_statut_contractuel_compteur(uuid) from public, anon, authenticated;

comment on column public.compteurs.statut_contractuel is
  'CLIENT si le dernier contrat connu est un contrat KiWee signe et non expire ; PROSPECT sinon, y compris sans aucun contrat. Tenu a jour par declencheurs et par le recalcul nocturne.';

-- La reprise, sans marquer 6 500 compteurs « modifiés aujourd'hui ».
alter table public.compteurs disable trigger trg_audit_trace;
select public.fn_reevaluer_statuts_contractuels();
alter table public.compteurs enable trigger trg_audit_trace;

alter table public.compteurs alter column statut_contractuel set default 'PROSPECT';
alter table public.compteurs alter column statut_contractuel set not null;
