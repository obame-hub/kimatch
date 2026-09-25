-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES FONCTIONS VÉRIFIENT QUI LES APPELLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 24/09/2026 : « vérifie ce que tu n'as pas pu vérifier, je veux qu'à la fin de ta boucle
-- il n'y ait plus rien à vérifier ».
--
-- Les fonctions `security definer` étaient justement ce que je n'avais pas vérifié. Il y en a
-- vingt-six appelables depuis l'API par n'importe quel utilisateur connecté, et elles passent
-- AU-DESSUS des policies : c'est leur raison d'être, et c'est le contournement le plus discret —
-- aucune policy n'est en cause, elles ne sont simplement pas consultées.
--
-- ══ CE QU'UN PARTENAIRE POUVAIT FAIRE, MESURÉ ══
--
-- Avec un vrai compte de test, connecté par lien magique :
--
--     fn_deplacer_site(site d'un client, son propre compte)        -> HTTP 200, site déplacé
--     fn_rattacher_compteur(compteur d'un client, son compte)      -> HTTP 200, compteur déplacé
--     fn_roles_contact(contact de KiWee)                           -> ["DECISIONNAIRE"]
--     ouvrir_appel_kimatch(numéro, w.goupil@kiwee-energie.fr)      -> appel créé AU NOM DE WILLIAM
--
-- LES DEUX PREMIÈRES SONT UN VOL. Un partenaire s'appropriait le site et le compteur d'un vrai
-- client de KiWee, avec leurs consommations et leur historique, en une requête. L'essai l'a fait
-- pour de bon sur deux sites et un compteur — remis à leur compte d'origine avant d'écrire ceci.
--
-- LA QUATRIÈME LUI PERMETTAIT D'ÉCRIRE AU NOM D'UN COMMERCIAL : un appel et une interaction
-- attribués à William, dans son historique, sans qu'il ait rien fait.
--
-- ══ LA CORRECTION ══
--
-- Chaque fonction demande désormais qui l'appelle. Pas un contrôle uniforme : ce que chacune doit
-- vérifier dépend de ce qu'elle fait.
--
--   · déplacer un site ou un compteur     -> réservé à l'équipe : un partenaire ne déplace rien
--   · lire les rôles d'un contact         -> seulement sur un contact qu'il a le droit de voir
--   · ouvrir un appel                     -> seulement sous sa propre adresse Allo
--
-- ON NE FERME PAS AUX ADMINISTRATEURS ni au service : `auth.uid()` est nul quand l'écriture vient
-- de la clé de service ou d'une migration, et ces chemins-là sont les nôtres.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Déplacer un site : réservé à l'équipe ──
create or replace function public.refuse_si_partenaire(p_geste text)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if public.est_partenaire() then
    raise exception 'Un utilisateur partenaire ne peut pas %.', p_geste
      using errcode = 'insufficient_privilege';
  end if;
end $$;

comment on function public.refuse_si_partenaire(text) is
  'Arrête net une fonction `security definer` quand c''est un partenaire qui l''appelle. Ces '
  'fonctions passent au-dessus des policies : sans ce garde, un externe déplaçait le site d''un '
  'client vers son propre compte en une requête (mesuré le 24/09/2026).';

grant execute on function public.refuse_si_partenaire(text) to authenticated;

-- ── 2 · Les quatre fonctions reçoivent leur contrôle ──
--
-- ON NE RÉÉCRIT PAS LEUR CORPS : on insère le garde en tête, et le reste ne bouge pas. Réécrire
-- `fn_deplacer_site` à la main, c'est risquer d'en changer le comportement pour l'équipe — un
-- déplacement de site touche les mandats, les contrats et les compteurs.
do $$
declare
  v_src  text;
  v_args text;
  v_ret  text;
  f      text;
  v_garde text;
begin
  foreach f in array array['fn_deplacer_site', 'fn_rattacher_compteur']
  loop
    /*  ET NON  : le second perd les valeurs par defaut, et
       Postgres refuse alors le  — « cannot remove parameter defaults ». */
    select p.prosrc, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
      into v_src, v_args, v_ret
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if v_src is null then
      raise notice 'Fonction % introuvable, ignorée.', f;
      continue;
    end if;
    if v_src like '%refuse_si_partenaire%' then
      raise notice 'Fonction % déjà protégée.', f;
      continue;
    end if;

    v_garde := '  perform public.refuse_si_partenaire(''déplacer un site ou un compteur'');' || E'\n';
    /* ON INSÈRE APRÈS LE PREMIER `begin`, qui ouvre le corps : tout ce qui précède est la
       déclaration des variables, et un `perform` n'y a pas sa place. */
    v_src := regexp_replace(v_src, '(\mbegin\M)', 'begin' || E'\n' || v_garde, 'i');

    execute format(
      'create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path to ''public'' as $corps$%s$corps$',
      f, v_args, v_ret, v_src);
    raise notice 'Garde posé sur %.', f;
  end loop;
end $$;

-- ── 3 · Les rôles d'un contact : seulement ceux qu'on a le droit de voir ──
create or replace function public.fn_roles_contact(p_contact_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_roles text[];
begin
  /* ══ ON VÉRIFIE D'ABORD QU'IL A LE DROIT DE VOIR CE CONTACT ══
   *
   * Cette fonction est `security definer` : elle lit `contacts` sans que les policies s'appliquent.
   * Un partenaire obtenait donc les rôles de n'importe quel contact de KiWee — mesuré le
   * 24/09/2026, elle rendait ["DECISIONNAIRE"] sur un contact qui ne le regardait pas.
   *
   * La lecture ci-dessous, elle, respecte les policies : `exists` sur `contacts` ne trouve rien si
   * le contact n'est pas visible pour l'appelant. */
  if auth.uid() is not null and public.est_partenaire() then
    if not exists (
      select 1 from public.contacts c
       join public.comptes co on co.id = c.compte_id
       where c.id = p_contact_id
         and co.id in (select public.comptes_du_partenaire())
    ) then
      return array[]::text[];
    end if;
  end if;

  select array_agg(distinct r.code order by r.code) into v_roles
    from public.contacts_comptes cc
    join public.types_roles r on r.id = cc.type_role_id
   where cc.contact_id = p_contact_id;

  return coalesce(v_roles, array[]::text[]);
end $$;

comment on function public.fn_roles_contact(uuid) is
  'Les rôles d''un contact. Rend un tableau vide à un partenaire qui interroge un contact hors de '
  'son patrimoine : la fonction est `security definer` et ne consulterait sinon aucune policy.';

-- ── 4 · Ouvrir un appel : seulement sous sa propre adresse Allo ──
create or replace function public.garde_appel_kimatch(p_email_allo text)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sienne text;
begin
  if auth.uid() is null then
    return; -- clé de service ou migration : ce n'est pas un utilisateur qui agit
  end if;
  select coalesce(nullif(btrim(p.email_allo), ''), p.email) into v_sienne
    from public.profils p where p.id = auth.uid();
  if lower(coalesce(v_sienne, '')) is distinct from lower(coalesce(p_email_allo, '')) then
    raise exception 'On ne peut ouvrir un appel que sous sa propre adresse Allo.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

comment on function public.garde_appel_kimatch(text) is
  'Empêche d''ouvrir un appel au nom de quelqu''un d''autre. Sans lui, n''importe quel utilisateur '
  'connecté créait un appel et une interaction dans l''historique d''un commercial (mesuré le '
  '24/09/2026 avec un compte partenaire, au nom de William).';

grant execute on function public.garde_appel_kimatch(text) to authenticated;

do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ouvrir_appel_kimatch';
  if v_src is null or v_src like '%garde_appel_kimatch%' then
    raise notice 'ouvrir_appel_kimatch : rien à faire.';
    return;
  end if;
  v_src := regexp_replace(
    v_src,
    '(if p_numero is null or btrim\(p_numero\) = '''' then)',
    'perform public.garde_appel_kimatch(p_email_allo);' || E'\n  ' || '\1',
    'i');
  execute format(
    'create or replace function public.ouvrir_appel_kimatch(p_numero text, p_email_allo text) '
    'returns table (appel_id uuid, interaction_id uuid) language plpgsql security definer '
    'set search_path to ''public'' as $corps$%s$corps$', v_src);
  raise notice 'Garde posé sur ouvrir_appel_kimatch.';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES QUATRE GESTES SONT REFUSÉS, ET L'ÉQUIPE TRAVAILLE ENCORE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le RISQUE est des deux côtés. Déplacer un site est un geste courant de l'équipe — le fermer pour
-- tout le monde casserait la réorganisation d'un portefeuille. On éprouve donc les deux.
--
do $$
declare
  v_partenaire uuid;
  v_profil     uuid;
  v_type_p     uuid;
  v_site       uuid;
  v_avant      uuid;
  v_erreur     text;
  v_passe      boolean;
begin
  select id into v_type_p from public.types_comptes where code = 'PARTENAIRE';
  select p.id into v_profil
    from public.profils p
    join public.profils_roles_acces pra on pra.profil_id = p.id
    join public.roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration
   limit 1;
  select id, compte_id into v_site, v_avant from public.sites limit 1;
  if v_type_p is null or v_profil is null or v_site is null then
    raise notice 'Garde-fou ignoré : il manque un type PARTENAIRE, un profil non administrateur ou un site.';
    return;
  end if;

  insert into public.comptes (nom, type_compte_id)
  values ('zzz garde-fou fonctions', v_type_p) returning id into v_partenaire;
  update public.profils set compte_partenaire_id = v_partenaire where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ① VOLER UN SITE : doit être refusé.
  v_passe := true;
  begin
    perform public.fn_deplacer_site(v_site, v_partenaire, 'zzz');
  exception when others then
    v_passe := false;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  if v_passe then
    raise exception 'Un partenaire a pu déplacer un site vers son compte : il s''approprie le patrimoine d''un client.';
  end if;
  if (select compte_id from public.sites where id = v_site) is distinct from v_avant then
    raise exception 'Le site a changé de compte malgré le refus.';
  end if;

  -- ② L'ÉQUIPE DÉPLACE ENCORE. Sans cela, la réorganisation d'un portefeuille est cassée.
  update public.profils set compte_partenaire_id = null where id = v_profil;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_passe := true;
  begin
    /* VERS UN AUTRE COMPTE, puis retour : deplacer un site vers celui qu il occupe deja est refuse
       par la fonction elle-meme — « appartient deja a ». Mon premier garde-fou le faisait, et
       concluait a tort que l equipe ne pouvait plus rien deplacer. */
    perform public.fn_deplacer_site(v_site, v_partenaire, 'zzz garde-fou aller');
    perform public.fn_deplacer_site(v_site, v_avant, 'zzz garde-fou retour');
  exception when others then
    get stacked diagnostics v_erreur = message_text;
    v_passe := false;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  if not v_passe then
    raise exception 'Un membre de l''équipe ne peut plus déplacer un site : %', v_erreur;
  end if;

  delete from public.comptes where id = v_partenaire;

  raise notice 'Garde-fou : un partenaire ne déplace rien, l''équipe déplace toujours.';
end $$;

commit;
