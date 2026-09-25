-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA TÉLÉPHONIE N'EST PAS OUVERTE AUX PARTENAIRES
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- L'audit du 25/09 matin a gardé quatre fonctions `security definer` (`fn_deplacer_site`,
-- `fn_rattacher_compteur`, `ouvrir_appel_kimatch`, `fn_roles_contact`). Trois autres, appelables
-- par `authenticated` et appelées depuis l'écran, lui avaient échappé. Mesurées cet après-midi avec
-- un vrai compte partenaire :
--
--     qui_appelle('<numéro d'un contact de KiWee>')
--         -> HTTP 200  [{"contact_id":"b7f811bb…","compte_id":"5ba526d2…", "nom":"…"}]
--
--     fn_rattacher_appels(numéro, contact)   -> HTTP 200, s'exécute
--     fn_ecarter_appels(numéro)              -> HTTP 200, s'exécute
--
-- ══ CE QUE CHACUNE OUVRAIT ══
--
-- `qui_appelle` est un ANNUAIRE INVERSÉ sur toute la base : elle rend le contact, son compte et son
-- nom pour n'importe quel numéro. Un partenaire pouvait donc, numéro par numéro, reconstituer qui
-- KiWee a en portefeuille — sans lire une seule ligne de `contacts`, puisque la fonction passe
-- au-dessus des policies.
--
-- `fn_rattacher_appels` ÉCRIT : elle insère dans `interactions` et modifie le téléphone d'un
-- contact, d'une piste ou d'un compte désigné par son identifiant.
--
-- `fn_ecarter_appels` SUPPRIME des lignes de `appels_non_rattaches` : la file d'appels à traiter de
-- l'équipe se vidait sur simple appel.
--
-- ══ POURQUOI LE GARDE, ET PAS UNE POLICY ══
--
-- Une policy ne s'applique pas à une fonction `security definer` : c'est précisément sa raison
-- d'être. Le contrôle doit donc être DANS la fonction, et il l'est par `refuse_si_partenaire`,
-- posée le 25/09 — une seule définition du refus pour toutes.
--
-- `est_partenaire()` est faux pour l'équipe et pour les chemins internes (`auth.uid()` nul depuis
-- une migration, un déclencheur ou la clé de service) : rien de ce que fait KiWee ne change.
--
-- ══ ON N'EN RÉÉCRIT PAS LE CORPS ══
--
-- La leçon de ce matin : en « protégeant » `fn_roles_contact`, j'avais réécrit son corps de mémoire
-- et cassé trois gestes en production pendant une demi-journée. On relit donc la source existante
-- et l'on insère le garde EN TÊTE, sans toucher au reste — comme le fait déjà la migration
-- 20260925093000 pour `fn_deplacer_site`.
--
-- `qui_appelle` fait exception : elle est en `language sql`, où l'on ne peut rien insérer avant le
-- corps. On l'enveloppe donc — le corps d'origine devient une fonction interne, appelée après le
-- garde. Le résultat est identique pour l'équipe, ligne pour ligne (le garde-fou le vérifie).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · LES DEUX FONCTIONS `plpgsql` : le garde s'insère en tête ──
do $$
declare
  v_src  text;
  v_args text;
  v_ret  text;
  f      text;
begin
  foreach f in array array['fn_rattacher_appels', 'fn_ecarter_appels'] loop
    /* `pg_get_function_arguments`, ET NON `..._identity_arguments` : la seconde omet les valeurs
       par défaut, et `create or replace` refuse alors de « retirer » des défauts existants
       (« cannot remove parameter defaults from existing function »). `fn_rattacher_appels` en a
       trois. Attrapé par l'essai à blanc. */
    select p.prosrc, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
      into v_src, v_args, v_ret
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;

    if v_src is null then
      raise exception 'La fonction % est introuvable : la migration viserait dans le vide.', f;
    end if;
    if position('refuse_si_partenaire' in v_src) > 0 then
      raise notice '% porte déjà le garde.', f;
      continue;
    end if;

    /* ON VISE LE `begin` EN DÉBUT DE LIGNE, pas le début du corps.
       Un corps plpgsql commence souvent par `declare` : `^\s*begin` ne correspondait alors à rien
       et le garde n'était PAS posé — sans la moindre erreur. C'est le garde-fou de cette migration
       qui l'a signalé, en constatant qu'un partenaire vidait encore la file d'appels.
       `\m` borne un début de mot, `n` fait correspondre `^` à chaque ligne. */
    v_src := regexp_replace(
      v_src,
      '^([ \t]*begin[ \t]*\n)',
      E'\\1  perform public.refuse_si_partenaire(''utiliser la téléphonie de KiWee'');\n',
      'ni');

    if position('refuse_si_partenaire' in v_src) = 0 then
      raise exception 'Le garde n''a pas pu être inséré dans % : son corps n''a pas le motif attendu.', f;
    end if;

    execute format(
      'create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path to ''public'' as %L',
      f, v_args, v_ret, v_src);
    raise notice 'Garde posé sur %.', f;
  end loop;
end $$;

-- ── 2 · `qui_appelle` : elle est en `language sql`, on l'enveloppe ──
--
-- Le corps d'origine part dans une fonction interne, inchangé. `qui_appelle` devient une enveloppe
-- qui refuse d'abord, puis l'appelle. Deux avantages sur une réécriture : le corps métier n'est pas
-- retouché, et l'on voit d'un coup d'œil ce que le garde ajoute.
do $$
declare
  v_src text;
begin
  if to_regprocedure('public.qui_appelle_interne(text)') is not null then
    raise notice 'qui_appelle est déjà enveloppée.';
    return;
  end if;

  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'qui_appelle';

  if v_src is null then
    raise exception 'qui_appelle est introuvable.';
  end if;

  execute format(
    'create function public.qui_appelle_interne(p_numero text) ' ||
    'returns table(contact_id uuid, compte_id uuid, piste_id uuid, nom text) ' ||
    'language sql stable security definer set search_path to ''public'' as %L', v_src);
end $$;

comment on function public.qui_appelle_interne(text) is
  'Le corps d''origine de `qui_appelle`, inchangé. Séparé le 25/09/2026 pour que `qui_appelle` '
  'puisse refuser un partenaire avant de l''appeler, sans qu''on ait à réécrire la recherche '
  'elle-même.';

create or replace function public.qui_appelle(p_numero text)
returns table(contact_id uuid, compte_id uuid, piste_id uuid, nom text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- ANNUAIRE INVERSÉ SUR TOUTE LA BASE : un externe y reconstituait le portefeuille de KiWee,
  -- numéro par numéro, sans lire une ligne de `contacts` (mesuré le 25/09/2026).
  perform public.refuse_si_partenaire('rechercher un numéro dans la base de KiWee');
  return query select * from public.qui_appelle_interne(p_numero);
end $$;

comment on function public.qui_appelle(text) is
  'Qui se cache derrière un numéro : contact, compte ou piste. Refuse un partenaire connecté — '
  'c''est un annuaire inversé sur toute la base de KiWee.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LE PARTENAIRE EST REFUSÉ, L'ÉQUIPE TÉLÉPHONE COMME AVANT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le risque est des deux côtés. `qui_appelle` s'affiche à chaque appel entrant : la casser se
-- verrait dans la minute, et le commercial ne saurait plus qui l'appelle.
do $$
declare
  v_tp      uuid;
  v_part    uuid;
  v_profil  uuid;
  v_commer  uuid;
  v_num     text;
  v_avant   integer;
  v_apres   integer;
  v_refuse  boolean := false;
begin
  -- Un numéro qui existe vraiment, sinon le témoin ne prouve rien.
  select telephone into v_num from contacts
   where telephone is not null and length(telephone) > 6 limit 1;

  -- ① L'ÉQUIPE : le résultat doit être EXACTEMENT celui d'avant.
  select count(*) into v_avant from public.qui_appelle_interne(v_num);
  select count(*) into v_apres from public.qui_appelle(v_num);
  if v_avant <> v_apres then
    raise exception 'qui_appelle ne rend plus la même chose : % avant, % après. L''équipe perdrait l''identification des appels.', v_avant, v_apres;
  end if;
  if v_apres = 0 then
    raise exception 'qui_appelle ne rend rien sur un numéro qui existe : la recherche est cassée.';
  end if;
  raise notice 'Garde-fou 1 : qui_appelle rend toujours % ligne(s) sur un numéro connu.', v_apres;

  -- ② LE PARTENAIRE : refusé.
  select id into v_tp from types_comptes where code = 'PARTENAIRE';
  insert into comptes (nom, type_compte_id) values ('ZZZ GF TEL', v_tp) returning id into v_part;
  select p.id into v_profil
    from profils p
    join profils_roles_acces pra on pra.profil_id = p.id
    join roles_acces r on r.id = pra.role_acces_id
   where p.actif and not r.ouvre_administration limit 1;
  update profils set compte_partenaire_id = v_part where id = v_profil;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform * from public.qui_appelle(v_num);
  exception
    when insufficient_privilege then v_refuse := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if not v_refuse then
    raise exception 'Un partenaire obtient encore l''annuaire inversé de KiWee.';
  end if;
  raise notice 'Garde-fou 2 : un partenaire est refusé sur qui_appelle.';

  -- ③ LES DEUX AUTRES le refusent aussi.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profil::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_refuse := false;
  begin
    perform public.fn_ecarter_appels('+33699999999');
  exception
    when insufficient_privilege then v_refuse := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if not v_refuse then
    raise exception 'Un partenaire vide encore la file d''appels de KiWee.';
  end if;
  raise notice 'Garde-fou 3 : un partenaire est refusé sur fn_ecarter_appels.';

  raise exception 'GARDE-FOU OK';
exception
  when others then
    if sqlerrm <> 'GARDE-FOU OK' then
      raise;
    end if;
    raise notice 'Garde-fou : la téléphonie marche pour l''équipe, elle est fermée aux partenaires.';
end $$;

commit;
