-- « Il faut juste que dans l'historique on voie qui a fait quoi. »
--
-- C'est la contrepartie de la decision du 29/08/2026 : tout le monde peut modifier en ligne et
-- supprimer, donc la trace doit etre lisible. Elle ne l'etait pas.
--
-- CE QUE L'AUDIT A MESURE. `historique_modifications` compte 122 424 lignes, dont 122 030 SANS
-- AUCUN AUTEUR — 99,7 %. Le declencheur ecrit `auth.uid()`, qui vaut NULL des que l'ecriture vient
-- d'une migration, d'un script ou du webhook. Les reprises Salesforce ayant massivement ecrit,
-- presque tout l'historique est anonyme. A l'ecran cela donne « Auteur inconnu », « Quelqu'un »,
-- « Kimatch » — trois facons de ne rien dire, et qui se lisent comme un bug alors que c'est un
-- fait : ce n'etait personne, c'etait un script.
--
-- TROIS CHOSES, DANS CET ORDRE.
--
-- 1. LE DECLENCHEUR DEVIENT ROBUSTE. Il posait `new.cree_par_id`, `new.proprietaire_id`,
--    `new.modifie_par_id` et `new.date_modification` sans verifier que ces colonnes existent : le
--    poser sur une table qui n'en a pas la CASSE net. C'est precisement ce qui a empeche de le
--    mettre sur les objets de travail. Il ne touche desormais qu'aux colonnes presentes.
--
-- 2. IL DIT D'OU VIENT L'ECRITURE quand ce n'est personne. Nouvelle colonne `origine` : NULL quand
--    un utilisateur est identifie — son nom suffit —, sinon une etiquette posee par ce qui ecrit.
--    Cette etiquette est un reglage de session, `kimatch.origine`, que scripts/appliquer-migration.cjs
--    renseigne desormais avec le nom du fichier. Une ligne dira donc « migration 20260828190000 »
--    plutot que « Auteur inconnu ».
--
--    PAS `application_name`, ET C'EST UNE LECON DE LA REPETITION : le pooler de Supabase le
--    remplace par le sien. Tout l'historique se serait retrouve signe « Supavisor », ce qui aurait
--    ete pire que rien — une fausse precision. Un reglage a nous, personne ne l'ecrase.
--
-- 3. IL COUVRE ENFIN LES OBJETS SUR LESQUELS ON TRAVAILLE. Le declencheur vivait sur 16 tables,
--    mais PAS sur `versions_recommandation`, `offres_fournisseurs`, `optimisations` ni
--    `suivis_consultations_fournisseurs`. Autrement dit : un compte renomme laissait une trace, une
--    offre modifiee n'en laissait aucune. C'est l'inverse de ce qu'on veut.

begin;

-- ── 1. La colonne d'origine ───────────────────────────────────────────────────────────────────
alter table public.historique_modifications
  add column if not exists origine text;

comment on column public.historique_modifications.origine is
  'Ce qui a ecrit, quand ce n''est pas un utilisateur identifie : etiquette posee dans le reglage '
  'de session kimatch.origine (migration, script, webhook), « systeme » a defaut. NULL quand '
  'modifie_par_id est renseigne — le nom de la personne suffit alors.';

-- Les lignes deja presentes sans auteur : on ne peut pas deviner laquelle vient de quelle reprise,
-- mais on peut dire ce qu'elles ne sont pas — l'oeuvre de quelqu'un.
update public.historique_modifications
   set origine = 'systeme'
 where modifie_par_id is null
   and origine is null;

-- ── 2. Le declencheur, robuste et bavard sur son origine ──────────────────────────────────────
create or replace function public.fn_audit_trace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  col       text;
  old_val   text;
  new_val   text;
  colonnes  jsonb;
  qui       uuid := auth.uid();
  d_ou      text;
begin
  -- `to_jsonb(new)` donne les colonnes REELLES de la table qui declenche : c'est ce qui permet au
  -- meme declencheur de servir une table qui porte un proprietaire et une autre qui n'en a pas,
  -- au lieu d'echouer sur la seconde.
  colonnes := to_jsonb(new);

  -- Ce qui ecrit, quand ce n'est pas quelqu'un. Reglage a nous : le pooler Supabase remplace
  -- `application_name` par « Supavisor », ce qui aurait signe tout l'historique d'un nom faux.
  d_ou := case
            when qui is not null then null
            else nullif(current_setting('kimatch.origine', true), '')
          end;

  if TG_OP = 'INSERT' then
    if colonnes ? 'cree_par_id'      then new.cree_par_id      := coalesce(new.cree_par_id, qui); end if;
    if colonnes ? 'proprietaire_id'  then new.proprietaire_id  := coalesce(new.proprietaire_id, qui); end if;
    if colonnes ? 'modifie_par_id'   then new.modifie_par_id   := qui; end if;
    if colonnes ? 'date_modification' then new.date_modification := now(); end if;
    return new;

  elsif TG_OP = 'UPDATE' then
    if colonnes ? 'modifie_par_id'    then new.modifie_par_id    := qui; end if;
    if colonnes ? 'date_modification' then new.date_modification := now(); end if;

    for col in select key from jsonb_each_text(to_jsonb(old)) loop
      if col not in ('date_modification', 'modifie_par_id') then
        old_val := (to_jsonb(old) ->> col);
        new_val := (to_jsonb(new) ->> col);
        if old_val is distinct from new_val then
          insert into public.historique_modifications(
            table_nom, ligne_id, champ, ancienne_valeur, nouvelle_valeur, modifie_par_id, origine)
          values (TG_TABLE_NAME, new.id, col, old_val, new_val, qui, coalesce(d_ou, 'systeme'));
        end if;
      end if;
    end loop;
    return new;
  end if;

  return new;
end;
$function$;

-- ── 3. Les objets de travail entrent enfin dans l'historique ──────────────────────────────────
-- Quatre tables, choisies parce que ce sont celles qu'on modifie a la main tous les jours et dont
-- personne ne pouvait dire qui les avait changees : la version d'une etude, le prix d'une offre,
-- l'optimisation retenue, l'evenement de suivi d'une consultation.
drop trigger if exists trg_audit_trace on public.versions_recommandation;
create trigger trg_audit_trace before insert or update on public.versions_recommandation
  for each row execute function public.fn_audit_trace();

drop trigger if exists trg_audit_trace on public.offres_fournisseurs;
create trigger trg_audit_trace before insert or update on public.offres_fournisseurs
  for each row execute function public.fn_audit_trace();

drop trigger if exists trg_audit_trace on public.optimisations;
create trigger trg_audit_trace before insert or update on public.optimisations
  for each row execute function public.fn_audit_trace();

drop trigger if exists trg_audit_trace on public.suivis_consultations_fournisseurs;
create trigger trg_audit_trace before insert or update on public.suivis_consultations_fournisseurs
  for each row execute function public.fn_audit_trace();

commit;
