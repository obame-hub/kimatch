-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE PISTE CONVERTIE N'EST PAS UNE OPPORTUNITÉ NEUVE : ELLE ATTEND SON MANDAT
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 22/09/2026 :
--
--   « Lorsqu'une piste est convertie, tous ces éléments sont créés et la prochaine étape est donc
--     l'envoi du mandat. Il serait judicieux de coupler dans cockpit la conversion avec l'envoi du
--     mandat. Ainsi l'opportunité nouvellement créée aura une tâche au lendemain avec "Relance
--     mandat" (donc elle entrera le lendemain dans le pool) et l'opportunité sera alors directement
--     à l'étape "Couverture mandat". »
--
-- ══ POURQUOI EN BASE ET NON DANS LE COCKPIT ══
--
-- C'est une règle sur la CONVERSION, pas sur l'écran d'où on la déclenche. Elle doit valoir depuis
-- le sprint comme depuis la fiche de la piste — sinon deux opportunités nées le même jour du même
-- geste n'auraient ni le même statut ni la même tâche selon le bouton utilisé, et le pipe
-- deviendrait illisible.
--
-- ══ CE QUI ÉTAIT FAUX AVANT ══
--
-- Toute opportunité recevait « Call - Début prospection » au jour de sa création. Sur une
-- conversion, c'est un contresens : on vient de raccrocher avec cette personne, on ne va pas la
-- rappeler dans l'heure pour « commencer la prospection ». Ce qu'on attend d'elle, c'est un mandat
-- signé — et on le relance le lendemain, pas le jour même.

-- ── 1 · La tâche automatique sait porter un autre titre et une autre date ──
create or replace function public.creer_tache_debut_prospection(
  p_cible_type text,
  p_cible_id uuid,
  p_responsable uuid,
  p_date_prevue timestamptz default null,
  p_titre text default null
)
returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_type    uuid;
  v_statut  uuid;
  v_contact uuid;
  v_compte  uuid;
  v_ouvert  boolean;
  v_action  uuid;
begin
  if p_cible_id is null or p_responsable is null then return null; end if;
  if p_cible_type not in ('PISTE', 'OPPORTUNITE') then return null; end if;

  -- Une cible qui a déjà une tâche ouverte n'en reçoit pas une seconde : le plan du jour
  -- l'affichera de toute façon, et deux tâches pour un seul geste se contredisent.
  if exists (
    select 1 from actions a
      join statuts_actions sa on sa.id = a.statut_id
     where a.actif
       and sa.code not in ('TERMINEE', 'ANNULEE')
       and (a.responsable_profil_id = p_responsable or a.responsable_profil_id is null)
       and ((p_cible_type = 'PISTE'       and a.piste_id       = p_cible_id)
         or (p_cible_type = 'OPPORTUNITE' and a.opportunite_id = p_cible_id))
  ) then
    return null;
  end if;

  if p_cible_type = 'PISTE' then
    select p.actif and not coalesce(s.est_cloture, false), p.contact_id, p.compte_id
      into v_ouvert, v_contact, v_compte
      from pistes p left join statuts_pistes s on s.id = p.statut_id
     where p.id = p_cible_id;
  else
    select o.actif and o.date_cloture is null and o.qualification_fin is null, o.contact_id, o.compte_id
      into v_ouvert, v_contact, v_compte
      from opportunites o
     where o.id = p_cible_id;
  end if;
  if not coalesce(v_ouvert, false) then return null; end if;

  select id into v_type   from types_actions   where code = 'APPELER' and coalesce(actif, true) limit 1;
  select id into v_statut from statuts_actions where code = 'A_FAIRE' and coalesce(actif, true) limit 1;
  if v_type is null or v_statut is null then return null; end if;

  insert into actions (
    type_action_id, statut_id, titre, date_prevue,
    responsable_profil_id, proprietaire_id, cree_par_id,
    piste_id, opportunite_id, contact_id, compte_id, commentaire
  ) values (
    v_type, v_statut,
    coalesce(p_titre, 'Call - Début prospection'),
    coalesce(p_date_prevue, aujourdhui_a_minuit_paris()),
    p_responsable, p_responsable, p_responsable,
    case when p_cible_type = 'PISTE'       then p_cible_id end,
    case when p_cible_type = 'OPPORTUNITE' then p_cible_id end,
    v_contact, v_compte,
    'Créée automatiquement par Kimatch : toute cible du plan du jour porte une tâche.'
  )
  returning id into v_action;

  return v_action;
end;
$function$;

-- ── 2 · Une opportunité née d'une piste entre directement en couverture de mandat ──
create or replace function public.fn_opportunite_nee_d_une_piste()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_statut uuid;
begin
  -- On ne force le statut QUE s'il n'a pas été choisi explicitement, ou s'il vaut « Nouvelle » :
  -- une conversion qui viendrait un jour poser un statut plus avancé ne doit pas reculer.
  if new.origine = 'PISTE' then
    select id into v_statut from statuts_opportunites where code = 'COUVERTURE_MANDAT' limit 1;
    if v_statut is not null and (
         new.statut_id is null
      or new.statut_id in (select id from statuts_opportunites where code = 'NOUVELLE')
    ) then
      new.statut_id := v_statut;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_opportunite_nee_d_une_piste on public.opportunites;
create trigger trg_opportunite_nee_d_une_piste
  before insert on public.opportunites
  for each row execute function public.fn_opportunite_nee_d_une_piste();

-- ── 3 · Et sa première tâche est la relance du mandat, au lendemain ──
create or replace function public.fn_opportunite_ouvre_sa_tache()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.proprietaire_id is null then return null; end if;

  if new.origine = 'PISTE' then
    -- « Elle entrera le lendemain dans le pool » : la date fait le reste, le plan du jour la
    -- ramènera d'elle-même. Rien à programmer ailleurs.
    perform creer_tache_debut_prospection(
      'OPPORTUNITE', new.id, new.proprietaire_id,
      aujourdhui_a_minuit_paris() + interval '1 day',
      'Relance mandat'
    );
  else
    perform creer_tache_debut_prospection('OPPORTUNITE', new.id, new.proprietaire_id);
  end if;

  return null;
end;
$function$;
