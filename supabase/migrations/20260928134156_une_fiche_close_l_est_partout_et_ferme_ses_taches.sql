-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE FICHE CLOSE L'EST PARTOUT, ET FERME SES TÂCHES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 28/09/2026 :
--   « Les pistes disposant d'un statut Convertie ou Disqualifiée doivent forcément être exclues de
--     cockpit, même si une tâche est ouverte. Les opportunités au statut Convertie aussi. »
--   « La conversion d'une piste ou d'une opportunité, ou la disqualification, devrait au passage
--     compléter toutes les tâches encore en cours. »
--   « Les statuts devraient être des valeurs stockées pour qu'on puisse les réutiliser dans des
--     règles comme celle-ci. »
--
-- ══ QUATRE TROUS, BOUCHÉS ENSEMBLE ══
--
-- 1. LE STATUT D'UNE OPPORTUNITÉ N'ÉTAIT PAS ÉCRIT. Seules 2 opportunités sur 144 portaient en base
--    le palier que l'écran affichait ; 25 étaient « Convertie » à l'écran et « Nouvelle » en base,
--    donc vivantes pour le pipe. Désormais la base le recalcule à chaque changement de ce qui le
--    détermine (fn_statut_opportunite_calcule, vérifiée identique à l'écran sur les 144).
--
-- 2. « OUVERTE » AVAIT QUATRE DÉFINITIONS, recopiées à la main dans quatre fonctions. Elles
--    n'avaient qu'une seule définition en tête — date de clôture et qualification de fin — et
--    ignoraient le statut. Il n'y en a plus qu'une, `fn_opportunite_ligne_ouverte`, et tout le
--    reste l'appelle.
--
-- 3. UNE FICHE CLOSE GARDAIT SES TÂCHES OUVERTES — et une tâche ouverte suffit à la ramener au plan
--    du jour. La clôture les termine maintenant toutes, quel que soit l'écran qui a clôturé.
--
-- 4. UNE TÂCHE TERMINÉE N'AVAIT PAS DE DATE DE RÉALISATION quand c'est le sprint qui la fermait :
--    le code croyait qu'un déclencheur la posait, il n'existait pas. 20 tâches étaient ainsi
--    « terminées » pour le pipe et « ouvertes » pour les suivis, le service client et le reporting,
--    qui lisent la date. Statut et date se tiennent désormais l'un l'autre.
--
-- ══ POURQUOI UNE FERMETURE PIÈGEAIT LE PIPE ══
--
-- Le pipe fait entrer chaque matin les opportunités « dormantes » — sans aucune tâche ouverte. Fermer
-- les tâches d'une opportunité convertie sans lui reconnaître son statut l'aurait fait revenir le
-- lendemain comme dormante. C'est pourquoi le point 3 ne va pas sans les points 1 et 2.

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · UNE SEULE DÉFINITION DE « OUVERTE »
-- ══════════════════════════════════════════════════════════════════════════════════════════════

/* Sur les VALEURS d'une ligne, et non sur son identifiant : un déclencheur doit pouvoir juger
   l'ancienne version comme la nouvelle, et seule la nouvelle est dans la table. */
create or replace function public.fn_opportunite_ligne_ouverte(
  p_actif boolean, p_date_cloture timestamptz, p_qualification_fin text, p_statut_id uuid
) returns boolean
language sql stable
set search_path to 'public'
as $$
  select coalesce(p_actif, false)
     and p_date_cloture is null
     and p_qualification_fin is null
     and not coalesce((select s.est_cloture from statuts_opportunites s where s.id = p_statut_id), false)
$$;

create or replace function public.fn_opportunite_est_ouverte(p_id uuid)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select coalesce((
    select public.fn_opportunite_ligne_ouverte(o.actif, o.date_cloture, o.qualification_fin, o.statut_id)
      from opportunites o where o.id = p_id
  ), false)
$$;

create or replace function public.fn_piste_ligne_ouverte(p_actif boolean, p_statut_id uuid)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select coalesce(p_actif, false)
     and not coalesce((select s.est_cloture from statuts_pistes s where s.id = p_statut_id), false)
$$;

create or replace function public.fn_piste_est_ouverte(p_id uuid)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select coalesce((select public.fn_piste_ligne_ouverte(p.actif, p.statut_id) from pistes p where p.id = p_id), false)
$$;

comment on function public.fn_opportunite_ligne_ouverte(boolean, timestamptz, text, uuid) is
  'LA definition d''une opportunite ouverte. Toute regle qui en a besoin passe par ici ou par fn_opportunite_est_ouverte.';
comment on function public.fn_piste_ligne_ouverte(boolean, uuid) is
  'LA definition d''une piste ouverte. Toute regle qui en a besoin passe par ici ou par fn_piste_est_ouverte.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · STATUT ET DATE DE RÉALISATION D'UNE TÂCHE SE TIENNENT
--
-- Posé AVANT la fermeture des tâches ci-dessous, pour que celles-ci reçoivent leur date.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_tache_statut_et_realisation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_code_nouveau text;
  v_code_ancien  text;
  v_terminee     uuid;
begin
  select code into v_code_nouveau from statuts_actions where id = new.statut_id;
  if tg_op = 'UPDATE' then
    select code into v_code_ancien from statuts_actions where id = old.statut_id;
  end if;

  if v_code_nouveau = 'TERMINEE' then
    -- Terminée : elle a une date. On ne réécrit pas une date déjà posée.
    if new.date_realisation is null then new.date_realisation := now(); end if;

  elsif tg_op = 'UPDATE' and v_code_ancien = 'TERMINEE' and v_code_nouveau is distinct from 'ANNULEE' then
    -- ROUVERTE : la date de réalisation ne dit plus rien de vrai.
    new.date_realisation := null;

  elsif new.date_realisation is not null
        and (tg_op = 'INSERT' or old.date_realisation is null)
        and coalesce(v_code_nouveau, '') not in ('TERMINEE', 'ANNULEE') then
    -- Datée sans être terminée : c'est qu'on l'a faite. Le statut suit.
    select id into v_terminee from statuts_actions where code = 'TERMINEE' limit 1;
    if v_terminee is not null then new.statut_id := v_terminee; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tache_statut_et_realisation on public.actions;
create trigger trg_tache_statut_et_realisation
  before insert or update of statut_id, date_realisation on public.actions
  for each row execute function public.fn_tache_statut_et_realisation();

-- Les 20 fermées par le sprint sans date : leur dernière modification est le moment de la fermeture.
update actions a
   set date_realisation = a.date_modification
  from statuts_actions sa
 where sa.id = a.statut_id and sa.code = 'TERMINEE' and a.date_realisation is null;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · UNE CLÔTURE TERMINE TOUTES LES TÂCHES ENCORE OUVERTES
--
-- Quel que soit l'écran, et quel que soit le responsable de la tâche : une fiche close n'a plus
-- rien à faire faire à personne.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_terminer_taches_de(p_cible_type text, p_cible_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_terminee uuid;
  v_n integer;
begin
  select id into v_terminee from statuts_actions where code = 'TERMINEE' limit 1;
  if v_terminee is null or p_cible_id is null then return 0; end if;

  update actions a
     set statut_id = v_terminee
    from statuts_actions sa
   where sa.id = a.statut_id
     and sa.code not in ('TERMINEE', 'ANNULEE')
     and a.actif
     and ((p_cible_type = 'PISTE'       and a.piste_id       = p_cible_id)
       or (p_cible_type = 'OPPORTUNITE' and a.opportunite_id = p_cible_id));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.fn_cloture_termine_les_taches()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_table_name = 'pistes' then
    if public.fn_piste_ligne_ouverte(old.actif, old.statut_id)
       and not public.fn_piste_ligne_ouverte(new.actif, new.statut_id) then
      perform public.fn_terminer_taches_de('PISTE', new.id);
    end if;
  else
    if public.fn_opportunite_ligne_ouverte(old.actif, old.date_cloture, old.qualification_fin, old.statut_id)
       and not public.fn_opportunite_ligne_ouverte(new.actif, new.date_cloture, new.qualification_fin, new.statut_id) then
      perform public.fn_terminer_taches_de('OPPORTUNITE', new.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cloture_termine_les_taches on public.pistes;
create trigger trg_cloture_termine_les_taches
  after update of statut_id, actif on public.pistes
  for each row execute function public.fn_cloture_termine_les_taches();

drop trigger if exists trg_cloture_termine_les_taches on public.opportunites;
create trigger trg_cloture_termine_les_taches
  after update of statut_id, date_cloture, qualification_fin, actif on public.opportunites
  for each row execute function public.fn_cloture_termine_les_taches();

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · LE STATUT D'UNE OPPORTUNITÉ S'ÉCRIT, ET SE TIENT À JOUR
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.recalculer_statut_opportunite(p_opp uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text;
  v_id   uuid;
begin
  if p_opp is null then return; end if;
  v_code := public.fn_statut_opportunite_calcule(p_opp);
  if v_code is null then return; end if;
  select id into v_id from statuts_opportunites where code = v_code limit 1;
  if v_id is null then return; end if;
  -- On n'écrit que si ça change : chaque écriture réveille l'historique et les déclencheurs.
  update opportunites set statut_id = v_id where id = p_opp and statut_id is distinct from v_id;
end;
$$;

create or replace function public.recalculer_statut_opportunites_du_compte(p_compte uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if p_compte is null then return; end if;
  for r in select id from opportunites where compte_id = p_compte and actif loop
    perform public.recalculer_statut_opportunite(r.id);
  end loop;
end;
$$;

/* UN SEUL DÉCLENCHEUR POUR LES SEPT TABLES qui déterminent le palier. Il ne fait qu'une chose :
   retrouver quelle(s) opportunité(s) sont concernées, avant et après, et les recalculer. */
create or replace function public.fn_statut_opportunite_suit_ses_faits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ancien  record;
  v_nouveau record;
begin
  if tg_op <> 'INSERT' then v_ancien := old; end if;
  if tg_op <> 'DELETE' then v_nouveau := new; end if;

  case tg_table_name
    when 'opportunites' then
      perform public.recalculer_statut_opportunite(v_nouveau.id);

    when 'opportunites_compteurs', 'opportunites_sites' then
      if tg_op <> 'INSERT' then perform public.recalculer_statut_opportunite(v_ancien.opportunite_id); end if;
      if tg_op <> 'DELETE' and (tg_op = 'INSERT' or v_nouveau.opportunite_id is distinct from v_ancien.opportunite_id) then
        perform public.recalculer_statut_opportunite(v_nouveau.opportunite_id);
      end if;

    when 'recommandations' then
      if tg_op <> 'INSERT' then perform public.recalculer_statut_opportunite(v_ancien.opportunite_id); end if;
      if tg_op <> 'DELETE' and (tg_op = 'INSERT' or v_nouveau.opportunite_id is distinct from v_ancien.opportunite_id) then
        perform public.recalculer_statut_opportunite(v_nouveau.opportunite_id);
      end if;

    when 'recommandations_compteurs' then
      if tg_op <> 'INSERT' then
        perform public.recalculer_statut_opportunite(
          (select opportunite_id from recommandations where id = v_ancien.recommandation_id));
      end if;
      if tg_op <> 'DELETE' then
        perform public.recalculer_statut_opportunite(
          (select opportunite_id from recommandations where id = v_nouveau.recommandation_id));
      end if;

    when 'mandats' then
      if tg_op <> 'INSERT' then perform public.recalculer_statut_opportunites_du_compte(v_ancien.compte_id); end if;
      if tg_op <> 'DELETE' and (tg_op = 'INSERT' or v_nouveau.compte_id is distinct from v_ancien.compte_id) then
        perform public.recalculer_statut_opportunites_du_compte(v_nouveau.compte_id);
      end if;

    when 'mandats_compteurs' then
      if tg_op <> 'INSERT' then
        perform public.recalculer_statut_opportunites_du_compte(
          (select compte_id from mandats where id = v_ancien.mandat_id));
      end if;
      if tg_op <> 'DELETE' then
        perform public.recalculer_statut_opportunites_du_compte(
          (select compte_id from mandats where id = v_nouveau.mandat_id));
      end if;
  end case;

  return null;
end;
$$;

-- `statut_id` n'est PAS dans la liste des colonnes écoutées sur `opportunites` : c'est la colonne que
-- le recalcul écrit, et l'écouter ferait tourner le déclencheur sur lui-même.
drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.opportunites;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or update of compte_id, contact_id, signal_id, signal_libelle, qualification_fin, actif
  on public.opportunites
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.opportunites_compteurs;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or update or delete on public.opportunites_compteurs
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.opportunites_sites;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or update or delete on public.opportunites_sites
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.recommandations;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or delete or update of opportunite_id, actif on public.recommandations
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.recommandations_compteurs;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or update or delete on public.recommandations_compteurs
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.mandats;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or delete or update of statut_id, compte_id, actif on public.mandats
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

drop trigger if exists trg_statut_opportunite_suit_ses_faits on public.mandats_compteurs;
create trigger trg_statut_opportunite_suit_ses_faits
  after insert or delete or update of caduc_depuis, compteur_id, mandat_id on public.mandats_compteurs
  for each row execute function public.fn_statut_opportunite_suit_ses_faits();

/* LE STATUT FORCÉ À LA NAISSANCE D'UNE PISTE CONVERTIE S'EFFACE. Il posait « Couverture mandat » à
   l'insertion (22/09/2026), mais l'écran ne l'a jamais montré : il affichait le palier calculé. Le
   recalcul, qui suit maintenant chaque fait, le remplace à l'instant même de l'insertion — le
   garder n'écrirait qu'une valeur fausse pendant quelques microsecondes. */
drop trigger if exists trg_opportunite_nee_d_une_piste on public.opportunites;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · LES FONCTIONS QUI JUGEAIENT « OUVERTE » À LEUR FAÇON
-- ══════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.creer_tache_debut_prospection(
  p_cible_type text, p_cible_id uuid, p_responsable uuid,
  p_date_prevue timestamptz default null, p_titre text default null
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
  v_action  uuid;
begin
  if p_cible_id is null or p_responsable is null then return null; end if;
  if p_cible_type not in ('PISTE', 'OPPORTUNITE') then return null; end if;

  -- Une cible qui a déjà une tâche ouverte n'en reçoit pas une seconde.
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

  -- Une cible close n'en reçoit aucune : LA définition, et non une copie.
  if p_cible_type = 'PISTE' then
    if not public.fn_piste_est_ouverte(p_cible_id) then return null; end if;
    select p.contact_id, p.compte_id into v_contact, v_compte from pistes p where p.id = p_cible_id;
  else
    if not public.fn_opportunite_est_ouverte(p_cible_id) then return null; end if;
    select o.contact_id, o.compte_id into v_contact, v_compte from opportunites o where o.id = p_cible_id;
  end if;

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

create or replace function public.ajouter_au_pipe_depuis_vivier(p_contacts uuid[])
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_moi     uuid := auth.uid();
  v_jour    date := (now() at time zone 'Europe/Paris')::date;
  v_statut  uuid;
  v_pos     integer;
  v_creees  integer := 0;
  v_ligne   record;
  v_opp     uuid;
begin
  if v_moi is null or p_contacts is null or cardinality(p_contacts) = 0 then return 0; end if;

  select id into v_statut from statuts_opportunites where code = 'NOUVELLE' and coalesce(actif, true) limit 1;
  select coalesce(max(rang), 0) into v_pos from pipe_du_jour where profil_id = v_moi and jour = v_jour;

  for v_ligne in
    select v.contact_id, v.compte_id, v.critere
      from v_vivier_cockpit v
     where v.contact_id = any(p_contacts)
       and v.compte_proprietaire_id = v_moi
  loop
    -- La garde, relue dans la transaction qui écrit : pas deux opportunités ouvertes par contact.
    if exists (
      select 1 from opportunites o
       where o.contact_id = v_ligne.contact_id
         and public.fn_opportunite_ligne_ouverte(o.actif, o.date_cloture, o.qualification_fin, o.statut_id)
    ) then
      continue;
    end if;

    insert into opportunites (compte_id, contact_id, origine, statut_id, signal_libelle, proprietaire_id)
    values (
      v_ligne.compte_id, v_ligne.contact_id, 'PORTEFEUILLE', v_statut,
      case v_ligne.critere
        when 'SANS_PERIMETRE' then 'Sans périmètre connu — décisionnaire identifié'
        else 'Échéance à moins de 18 mois'
      end,
      v_moi
    )
    returning id into v_opp;

    insert into opportunites_compteurs (opportunite_id, compteur_id)
    select v_opp, e.compteur_id
      from v_echeances_a_traiter e
     where e.responsable_contact_id = v_ligne.contact_id
       and not e.a_opportunite_vivante
       and not e.a_recommandation_ouverte
       and (e.date_echeance is null
            or e.date_echeance <= (now() at time zone 'Europe/Paris')::date + interval '18 months');

    v_pos := v_pos + 1;
    insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
    values (v_moi, v_jour, 'OPPORTUNITE', v_opp, v_pos, 'VIVIER')
        on conflict (profil_id, jour, cible_type, cible_id) do nothing;

    v_creees := v_creees + 1;
  end loop;

  return v_creees;
end;
$function$;

create or replace function public.construire_pipe_du_jour()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_moi      uuid := auth.uid();
  v_jour     date := (now() at time zone 'Europe/Paris')::date;
  v_plafond  integer;
  v_deja     integer;
  v_rang     integer;
begin
  if v_moi is null then return 0; end if;

  select coalesce(plafond_pipe_du_jour, 60) into v_plafond from profils where id = v_moi;
  v_plafond := coalesce(v_plafond, 60);

  select count(*), coalesce(max(rang), 0) into v_deja, v_rang
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  if v_deja >= v_plafond then return v_deja; end if;

  with
  inbound as (
    select 1 as seau, 'PISTE'::text as cible_type, p.id as cible_id, 'INBOUND'::text as source,
           extract(epoch from p.date_creation)::double precision as tri
      from pistes p
     where p.proprietaire_id = v_moi
       and public.fn_piste_ligne_ouverte(p.actif, p.statut_id)
       and p.source in ('Google Ads avec facture (Inbound)', 'Google Ads sans facture (Inbound)')
       and p.date_premier_appel is null
  ),
  taches as (
    select
      a.date_prevue,
      (a.date_prevue at time zone 'Europe/Paris')::time  as heure,
      (a.date_prevue at time zone 'Europe/Paris')::date  as jour_du,
      case when a.opportunite_id is not null then 'OPPORTUNITE' else 'PISTE' end as cible_type,
      coalesce(a.opportunite_id, a.piste_id)             as cible_id
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    where a.actif
      and a.responsable_profil_id = v_moi
      and sa.code not in ('TERMINEE', 'ANNULEE')
      and a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
                            at time zone 'Europe/Paris'
      and (a.opportunite_id is not null or a.piste_id is not null)
      and (a.opportunite_id is null or public.fn_opportunite_est_ouverte(a.opportunite_id))
      and (a.piste_id is null or public.fn_piste_est_ouverte(a.piste_id))
  ),
  rappel_heure as (
    select 2 as seau, t.cible_type, t.cible_id, 'RAPPEL_HEURE'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du = v_jour and t.heure <> '00:00:00'
  ),
  rappel_jour as (
    select 3 as seau, t.cible_type, t.cible_id, 'RAPPEL_JOUR'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du < v_jour or t.heure = '00:00:00'
  ),
  dormantes as (
    select 4 as seau, 'OPPORTUNITE'::text as cible_type, o.id as cible_id,
           'OPPORTUNITE_DORMANTE'::text as source,
           extract(epoch from o.date_modification)::double precision as tri
      from opportunites o
     where o.proprietaire_id = v_moi
       -- C'EST ICI QUE LE PIÈGE SE FERMAIT : une convertie sans tâche n'est pas dormante, elle est finie.
       and public.fn_opportunite_ligne_ouverte(o.actif, o.date_cloture, o.qualification_fin, o.statut_id)
       and not exists (
         select 1 from actions a
           join statuts_actions sa on sa.id = a.statut_id
          where a.opportunite_id = o.id
            and a.actif
            and sa.code not in ('TERMINEE', 'ANNULEE')
       )
  ),
  froides as (
    select 6 as seau, 'PISTE'::text as cible_type, p.id as cible_id,
           'PISTE_FROIDE'::text as source,
           extract(epoch from coalesce(p.date_derniere_activite, p.date_creation))::double precision as tri
      from pistes p
     where p.proprietaire_id = v_moi
       and public.fn_piste_ligne_ouverte(p.actif, p.statut_id)
       and coalesce(p.telephone, p.telephone_mobile, p.email) is not null
       and not exists (
         select 1 from actions a
           join statuts_actions sa on sa.id = a.statut_id
          where a.piste_id = p.id
            and a.actif
            and sa.code not in ('TERMINEE', 'ANNULEE')
       )
  ),
  candidats as (
    select * from inbound
    union all select * from rappel_heure
    union all select * from rappel_jour
    union all select * from dormantes
    union all select * from froides
  ),
  nouveaux as (
    select * from candidats c
     where not exists (
       select 1 from pipe_du_jour l
        where l.profil_id = v_moi and l.jour = v_jour
          and l.cible_type = c.cible_type and l.cible_id = c.cible_id
     )
  ),
  dedoublonnes as (
    select distinct on (cible_type, cible_id) *
      from nouveaux
     order by cible_type, cible_id, seau, tri nulls last
  ),
  classes as (
    select *, row_number() over (order by seau, tri nulls last, cible_id) as pos
      from dedoublonnes
  )
  insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
  select v_moi, v_jour, c.cible_type, c.cible_id, (v_rang + c.pos)::integer, c.source
    from classes c
   where c.pos <= (v_plafond - v_deja)
      on conflict (profil_id, jour, cible_type, cible_id) do nothing;

  select count(*) into v_deja from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  return v_deja;
end;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 6 · LA REPRISE
-- ══════════════════════════════════════════════════════════════════════════════════════════════

-- Chaque opportunité reçoit son vrai palier. Celles qui deviennent closes ferment leurs tâches au
-- passage, par le déclencheur du § 3.
select public.recalculer_statut_opportunite(o.id) from opportunites o where o.actif;

-- Les pistes déjà closes n'ont pas « changé » de statut aujourd'hui : on ferme leurs tâches à la main.
select public.fn_terminer_taches_de('PISTE', p.id)
  from pistes p
 where not public.fn_piste_ligne_ouverte(p.actif, p.statut_id)
   and exists (select 1 from actions a join statuts_actions sa on sa.id = a.statut_id
                where a.piste_id = p.id and a.actif and sa.code not in ('TERMINEE', 'ANNULEE'));
