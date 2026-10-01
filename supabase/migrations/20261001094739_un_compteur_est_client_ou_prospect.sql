-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN COMPTEUR EST CLIENT OU PROSPECT — selon son dernier contrat connu
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 01/10/2026 : « si le dernier contrat renseigné est un contrat client, alors le compteur
-- doit être "Client". Si c'est en revanche un contrat prospect, il doit être "Prospect".
-- Mentionne-le en base et dans le header. »
--
-- ══ LE DERNIER CONTRAT, LA MÊME RÈGLE QUE L'ÉCHÉANCE ══
--
-- Celle de `dernierContrat` (src/lib/echeance.ts) : le contrat qui finit le plus tard ; une fin
-- Indéterminée passe devant tout, sauf devant un contrat qui commence avec elle ou après elle ; à
-- égalité, le plus récemment saisi. Le statut dit donc qui porte l'échéance affichée.
--
-- ══ UN CONTRAT CLIENT EST UN CONTRAT SIGNÉ ══
--
-- Actif, et au statut SIGNE, A_VENIR, ACTIF, TERMINE ou RESILIE : un contrat en préparation ou en
-- attente de signature ne fait pas encore de quelqu'un un client. Un contrat terminé, si : tant que
-- rien de plus récent n'est connu, le dernier contrat de ce compteur reste le nôtre.
--
-- Sans aucun contrat, le statut reste vide (NULL) : rien ne permet de le dire.
--
-- ══ STOCKÉ, ET TENU À JOUR PAR LA BASE ══
--
-- Une colonne plutôt qu'un calcul à la lecture : les listes et les filtres doivent pouvoir s'en
-- servir. Trois déclencheurs la recalculent — sur `contrats`, `contrats_compteurs` et
-- `contrats_prospects` — et n'écrivent que si la valeur change.

alter table public.compteurs
  add column if not exists statut_contractuel text
  check (statut_contractuel in ('CLIENT', 'PROSPECT'));

comment on column public.compteurs.statut_contractuel is
  'CLIENT ou PROSPECT selon le dernier contrat connu du compteur (contrat KiWee signe ou contrat prospect). NULL sans contrat. Tenu a jour par declencheurs.';

create or replace function public.fn_statut_contractuel_compteur(p_compteur uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with candidats as (
    select 'CLIENT'::text as nature, c.date_debut as debut, c.date_fin as fin, c.date_creation as cree
    from public.contrats_compteurs cc
    join public.contrats c on c.id = cc.contrat_id
    join public.statuts_contrats s on s.id = c.statut_id
    where cc.compteur_id = p_compteur
      and c.actif
      and s.code in ('SIGNE', 'A_VENIR', 'ACTIF', 'TERMINE', 'RESILIE')
    union all
    select 'PROSPECT', p.date_debut, p.date_fin, p.date_creation
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
  select nature from classes
  where ouvert or fin is not null
  order by ouvert desc, fin desc nulls last, cree desc
  limit 1
$$;

create or replace function public.fn_recalculer_statut_contractuel(p_compteur uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v text := public.fn_statut_contractuel_compteur(p_compteur);
begin
  update public.compteurs
     set statut_contractuel = v
   where id = p_compteur
     and statut_contractuel is distinct from v;
end;
$$;

-- Rouages internes : personne ne les appelle de dehors (même règle que le 28/09/2026).
revoke all on function public.fn_statut_contractuel_compteur(uuid) from public, anon, authenticated;
revoke all on function public.fn_recalculer_statut_contractuel(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_statut_contractuel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_table_name = 'contrats' then
    for r in select cc.compteur_id from public.contrats_compteurs cc where cc.contrat_id = coalesce(new.id, old.id) loop
      perform public.fn_recalculer_statut_contractuel(r.compteur_id);
    end loop;
  else
    if tg_op in ('UPDATE', 'DELETE') then perform public.fn_recalculer_statut_contractuel(old.compteur_id); end if;
    if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.compteur_id is distinct from old.compteur_id) then
      perform public.fn_recalculer_statut_contractuel(new.compteur_id);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.fn_trg_statut_contractuel() from public, anon, authenticated;

drop trigger if exists trg_statut_contractuel on public.contrats;
create trigger trg_statut_contractuel
  after insert or delete or update of statut_id, date_debut, date_fin, actif on public.contrats
  for each row execute function public.fn_trg_statut_contractuel();

drop trigger if exists trg_statut_contractuel on public.contrats_compteurs;
create trigger trg_statut_contractuel
  after insert or delete or update of compteur_id, contrat_id on public.contrats_compteurs
  for each row execute function public.fn_trg_statut_contractuel();

drop trigger if exists trg_statut_contractuel on public.contrats_prospects;
create trigger trg_statut_contractuel
  after insert or delete or update of compteur_id, date_debut, date_fin on public.contrats_prospects
  for each row execute function public.fn_trg_statut_contractuel();

-- ══ LA REPRISE DE L'EXISTANT ══
-- Le déclencheur d'audit est suspendu le temps du remplissage : sans cela, les 7 900 compteurs
-- porteraient « modifié aujourd'hui, par personne », et l'historique de chacun une ligne de plus
-- pour une colonne qui vient de naître.
alter table public.compteurs disable trigger trg_audit_trace;
update public.compteurs m
   set statut_contractuel = public.fn_statut_contractuel_compteur(m.id)
 where statut_contractuel is distinct from public.fn_statut_contractuel_compteur(m.id);
alter table public.compteurs enable trigger trg_audit_trace;
