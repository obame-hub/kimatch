-- ══ UN CONTRAT CLIENT NE COMPTE QUE SIGNÉ ET VALIDÉ — 02/10/2026 ══
-- William : « un contrat client ne doit être pris en compte pour les échéances, frises etc. uniquement
-- quand ce dernier a été signé ET validé. Dans l'exemple, un contrat est créé avec une échéance au
-- 01/04/2030 mais n'étant pas signé et validé, il ne doit pas être pris en compte (et l'échéance reste
-- pour le moment le 31/03/2028). »
--
-- UNE SEULE RÈGLE, écrite une fois (`fn_contrat_compte`), lue par l'échéance du compteur (et donc le
-- Pricer), la liste des compteurs (et tout ce qui s'y branche : échéances à traiter, cockpit, vivier,
-- charge des échéances, patrimoine) et le statut client / prospect du compteur. Le front applique la
-- même (`contratCompte`, src/lib/echeance.ts). Le jour de la migration : 1 589 contrats actifs signés
-- et validés ne bougent pas ; 25 (à signer, nouveaux, en préparation, 2 à venir non validés) sortent.
create or replace function public.fn_contrat_compte(p public.contrats)
returns boolean language sql stable set search_path = public as $$
  select p.actif
     and p.date_validation is not null
     and (p.date_signature is not null
          or exists (select 1 from public.statuts_contrats_avancement a where a.id = p.statut_avancement_id and a.code = 'SIGNE'))
$$;
comment on function public.fn_contrat_compte(public.contrats) is
  'Un contrat client ne compte (échéance, frise, statut client) que signé ET validé — William, 02/10/2026.';
grant execute on function public.fn_contrat_compte(public.contrats) to authenticated;

create or replace function public.fn_echeance_compteur(p_compteur uuid)
returns date language sql stable set search_path to 'public' as $function$
  with tous as (
    select c.date_debut, c.date_fin
    from public.contrats_compteurs cc join public.contrats c on c.id = cc.contrat_id
    where cc.compteur_id = p_compteur and cc.actif and public.fn_contrat_compte(c) and (c.date_fin is null or c.date_fin >= current_date)
    union all
    select p.date_debut, p.date_fin from public.contrats_prospects p where p.compteur_id = p_compteur
  )
  select case
    when not exists (select 1 from tous) then (select date_echeance from public.compteurs where id = p_compteur)
    when exists (
      select 1 from tous o where o.date_fin is null
        and not exists (select 1 from tous t where t.date_fin is not null and t.date_debut is not null and o.date_debut is not null and t.date_debut >= o.date_debut)
    ) then null
    else (select max(date_fin) from tous)
  end
$function$;

create or replace view public.v_compteurs_liste with (security_invoker = true) as
 SELECT c.id,
    c.numero_point,
    c.site_id,
    c.actif,
    c.consommation_annuelle_mwh,
    c.localisation_site,
    c.date_echeance AS date_declaree,
    te.code AS type_energie_code,
    c.libelle_site AS site_nom,
    c.compte_id,
    p.date_preuve,
    COALESCE(p.date_preuve, c.date_echeance) AS date_echeance,
        CASE
            WHEN p.date_preuve IS NOT NULL THEN 'PROUVEE'::text
            WHEN c.date_echeance IS NOT NULL THEN 'ESTIMEE'::text
            ELSE 'ABSENTE'::text
        END AS nature_echeance,
    p.date_preuve IS NOT NULL AND c.date_echeance IS NOT NULL AND abs(p.date_preuve - c.date_echeance) > 31 AS contredit,
    c.responsable_contact_id,
    c.contact_conseil_syndical_id,
    c.adresse_site
   FROM compteurs c
     LEFT JOIN types_energies te ON te.id = c.type_energie_id
     LEFT JOIN LATERAL ( SELECT max(ct.date_fin) AS date_preuve
           FROM contrats_compteurs cc
             JOIN contrats ct ON ct.id = cc.contrat_id
          WHERE cc.compteur_id = c.id AND public.fn_contrat_compte(ct) AND ct.date_fin >= CURRENT_DATE) p ON true;

create or replace function public.fn_statut_contractuel_compteur(p_compteur uuid)
returns text language sql stable security definer set search_path to 'public' as $function$
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
      and public.fn_contrat_compte(c)
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
$function$;

-- Le statut du compteur suit aussi la signature et la validation, pas seulement les dates.
drop trigger if exists trg_statut_contractuel on public.contrats;
create trigger trg_statut_contractuel
  after insert or delete or update of statut_id, date_debut, date_fin, date_resiliation, actif, date_signature, date_validation, statut_avancement_id
  on public.contrats for each row execute function public.fn_trg_statut_contractuel();

-- L'EXISTANT : le statut des compteurs couverts par un contrat qui ne compte plus.
do $$
declare r record;
begin
  for r in
    select distinct cc.compteur_id from public.contrats_compteurs cc join public.contrats c on c.id = cc.contrat_id
    where c.actif and not public.fn_contrat_compte(c)
  loop
    perform public.fn_recalculer_statut_contractuel(r.compteur_id);
  end loop;
end $$;
