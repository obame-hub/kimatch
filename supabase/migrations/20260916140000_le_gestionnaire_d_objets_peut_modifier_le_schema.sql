-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GESTIONNAIRE D'OBJETS MODIFIE LE SCHÉMA — SOUS CONDITIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 16/09/2026, après que j'aie posé la réserve : « je te laisse trouver un moyen que ce
-- soit un gestionnaire avec de la sécurité, lié à notre database, comme ça on ne fait pas
-- n'importe quoi, avec des garde-fous, des avertissements, etc. »
--
-- La décision est prise. Ce fichier est la moitié qui empêche de faire n'importe quoi.
--
-- ══ LE PRINCIPE : ON NE PASSE PAS UNE COMMANDE, ON DEMANDE UNE OPÉRATION ═════════════════════
--
-- Aucune de ces fonctions n'accepte du SQL. Elles prennent un nom de table, un nom de colonne, un
-- type — et construisent elles-mêmes l'ordre, après l'avoir refusé cent fois. Passer du SQL depuis
-- une page web reviendrait à donner les clés de la base à quiconque sait ouvrir les outils de
-- développement du navigateur.
--
-- ══ LES NEUF REFUS ══════════════════════════════════════════════════════════════════════════
--
--   1. L'appelant n'est pas administrateur                       → refus (42501)
--   2. La suppression demande SUPER_ADMIN                        → refus
--   3. La table n'existe pas, ou n'est pas une vraie table       → refus
--   4. La table est de la plomberie (journal, historique, …)     → refus
--   5. Le nom de colonne n'a pas la forme attendue               → refus
--   6. Le type n'est pas dans la liste blanche                   → refus
--   7. La colonne est protégée (id, date_creation, …)            → refus
--   8. La colonne est clé primaire, unique, ou porte un lien     → refus
--   9. Une autre table pointe vers cette colonne                 → refus
--
-- ══ CE QUI SE PASSE QUAND MÊME ══════════════════════════════════════════════════════════════
--
-- AVANT UNE SUPPRESSION, LES VALEURS SONT COPIÉES. Une colonne supprimée emporte ses données, et
-- aucune corbeille ne rattrape un `drop column`. On archive donc `(id, valeur)` ligne par ligne
-- dans `archives_colonnes_supprimees` : la suppression redevient une opération dont on revient.
--
-- TOUT EST JOURNALISÉ, y compris les refus. Le SQL exact est écrit dans le journal — c'est la
-- seule façon de comprendre après coup ce qui est arrivé à une colonne.
--
-- POSTGREST EST PRÉVENU. Il garde le schéma en mémoire : sans `notify pgrst`, une colonne ajoutée
-- reste invisible depuis l'application, et on croit que l'ajout a échoué.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Le journal : ce qui a été tenté, par qui, et avec quel SQL ────────────────────────────────
create table if not exists public.journal_schema (
  id            uuid primary key default gen_random_uuid(),
  operation     text not null check (operation in ('ajout', 'documentation', 'renommage', 'suppression')),
  table_cible   text not null,
  colonne       text not null,
  nouvelle_valeur text,
  sql_execute   text,
  accepte       boolean not null,
  refus_motif   text,
  auteur_id     uuid references public.profils(id) on delete set null,
  fait_le       timestamptz not null default now()
);

comment on table public.journal_schema is
  'Toute modification de schéma tentée depuis le gestionnaire d''objets, refus compris. Le SQL exact '
  'y figure : c''est la seule façon de comprendre après coup ce qui est arrivé à une colonne.';

create index if not exists journal_schema_date_idx on public.journal_schema (fait_le desc);

alter table public.journal_schema enable row level security;

drop policy if exists journal_schema_lecture_admin on public.journal_schema;
create policy journal_schema_lecture_admin on public.journal_schema
  for select to authenticated
  using (public.fn_est_administrateur());

-- ── L'archive : ce qu'une colonne contenait avant d'être supprimée ────────────────────────────
create table if not exists public.archives_colonnes_supprimees (
  id            uuid primary key default gen_random_uuid(),
  table_cible   text not null,
  colonne       text not null,
  type_colonne  text not null,
  valeurs       jsonb not null,
  nb_lignes     integer not null,
  auteur_id     uuid references public.profils(id) on delete set null,
  supprime_le   timestamptz not null default now()
);

comment on table public.archives_colonnes_supprimees is
  'Les valeurs d''une colonne, copiées juste avant sa suppression par le gestionnaire d''objets. '
  'Sans elles, un « drop column » serait définitif — aucune corbeille ne le rattrape.';

alter table public.archives_colonnes_supprimees enable row level security;

drop policy if exists archives_colonnes_lecture_admin on public.archives_colonnes_supprimees;
create policy archives_colonnes_lecture_admin on public.archives_colonnes_supprimees
  for select to authenticated
  using (public.fn_est_administrateur());

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES CONTRÔLES, ÉCRITS UNE FOIS
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- Les tables auxquelles on ne touche pas. Ce sont celles dont le contenu n'est pas du métier mais
-- de la mémoire : les abîmer ne casse pas un écran, ça efface une trace.
create or replace function public.fn_schema_table_interdite(p_table text)
returns boolean
language sql
immutable
as $$
  select p_table ~ '^(journal_|archives_|historique|webhooks_|schema_|supabase_|pg_)'
      or p_table in ('profils', 'roles_acces', 'permissions', 'roles_acces_permissions',
                     'profils_roles_acces', 'profils_gmail_tokens', 'historiques_entites',
                     'historique_modifications', 'appels_en_cours');
$$;

comment on function public.fn_schema_table_interdite(text) is
  'Les tables que le gestionnaire d''objets ne modifie jamais : mémoire, droits, jetons. Les abîmer '
  'n''casse pas un écran, ça efface une trace ou ouvre une porte.';

-- Les colonnes auxquelles on ne touche pas, quelle que soit la table. Elles sont nommées en dur
-- dans les déclencheurs d'audit, les politiques RLS et la moitié du code.
create or replace function public.fn_schema_colonne_protegee(p_colonne text)
returns boolean
language sql
immutable
as $$
  select p_colonne in ('id', 'reference', 'actif', 'date_creation', 'date_modification',
                       'cree_par_id', 'modifie_par_id', 'supprime_le', 'supprime_par_id',
                       'source_externe_id', 'id_salesforce');
$$;

comment on function public.fn_schema_colonne_protegee(text) is
  'Les colonnes nommées en dur dans les déclencheurs d''audit, les politiques RLS et le code. '
  'Elles ne se renomment ni ne se suppriment depuis le gestionnaire.';

-- Les types qu'on accepte de créer. Tout le reste — domaines, types composites, tableaux — sort du
-- cadre de ce que l'application sait afficher et modifier.
create or replace function public.fn_schema_type_admis(p_type text)
returns boolean
language sql
immutable
as $$
  select p_type in ('text', 'integer', 'bigint', 'numeric', 'boolean',
                    'date', 'timestamptz', 'uuid', 'jsonb');
$$;

/**
 * Le contrôle commun à toutes les opérations. Rend le motif de refus, ou `null` si c'est bon.
 *
 * UNE SEULE FONCTION POUR TOUS LES REFUS : trois copies du même contrôle finissent par diverger,
 * et c'est la copie oubliée qui laisse passer la suppression qu'on regrette.
 */
create or replace function public.fn_schema_refus(
  p_table text, p_colonne text, p_existante boolean
) returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  oid_table oid;
begin
  if not public.fn_est_administrateur() then
    return 'Réservé aux administrateurs.';
  end if;

  if p_table !~ '^[a-z][a-z0-9_]{0,58}$' then
    return format('Nom de table invalide : %L.', p_table);
  end if;
  if p_colonne !~ '^[a-z][a-z0-9_]{0,58}$' then
    return format('Nom de colonne invalide : %L. Minuscules, chiffres et tirets bas uniquement, '
                  'en commençant par une lettre.', p_colonne);
  end if;

  select c.oid into oid_table
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = p_table and c.relkind = 'r';
  if oid_table is null then
    return format('La table %I n''existe pas.', p_table);
  end if;

  if public.fn_schema_table_interdite(p_table) then
    return format('La table %I est protégée : elle porte de la mémoire ou des droits, pas du métier.', p_table);
  end if;

  if p_existante then
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = oid_table and a.attname = p_colonne and a.attnum > 0 and not a.attisdropped
    ) then
      return format('La colonne %I.%I n''existe pas.', p_table, p_colonne);
    end if;

    if public.fn_schema_colonne_protegee(p_colonne) then
      return format('La colonne %I est protégée : elle est nommée en dur dans les déclencheurs '
                    'd''audit, les politiques de sécurité et le code.', p_colonne);
    end if;

    -- Clé primaire ou unique : d'autres lignes et d'autres tables s'appuient dessus.
    if exists (
      select 1 from pg_index i join pg_attribute a
             on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = oid_table and a.attname = p_colonne and (i.indisprimary or i.indisunique)
    ) then
      return format('La colonne %I porte une clé primaire ou une contrainte d''unicité.', p_colonne);
    end if;

    -- Elle pointe vers une autre table…
    if exists (
      select 1 from pg_constraint con
      cross join lateral unnest(con.conkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       where con.conrelid = oid_table and con.contype = 'f' and a.attname = p_colonne
    ) then
      return format('La colonne %I est un lien vers une autre table.', p_colonne);
    end if;

    -- …ou une autre table pointe vers elle.
    if exists (
      select 1 from pg_constraint con
      cross join lateral unnest(con.confkey) as k(attnum)
      join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
       where con.confrelid = oid_table and con.contype = 'f' and a.attname = p_colonne
    ) then
      return format('Une autre table pointe vers %I.%I.', p_table, p_colonne);
    end if;
  else
    if exists (
      select 1 from pg_attribute a
       where a.attrelid = oid_table and a.attname = p_colonne and a.attnum > 0 and not a.attisdropped
    ) then
      return format('La colonne %I existe déjà dans %I.', p_colonne, p_table);
    end if;
  end if;

  return null;
end;
$$;

-- Le journal, écrit dans tous les cas — y compris quand on refuse.
create or replace function public.fn_schema_journaliser(
  p_operation text, p_table text, p_colonne text, p_valeur text,
  p_sql text, p_accepte boolean, p_motif text
) returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.journal_schema
    (operation, table_cible, colonne, nouvelle_valeur, sql_execute, accepte, refus_motif, auteur_id)
  values (p_operation, p_table, p_colonne, p_valeur, p_sql, p_accepte, p_motif, auth.uid());
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES QUATRE OPÉRATIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * AJOUTER UN CHAMP.
 *
 * TOUJOURS FACULTATIF, jamais `not null` : une colonne obligatoire ajoutée à une table qui contient
 * déjà des lignes échoue, ou force une valeur inventée dans des milliers d'enregistrements. Le
 * caractère obligatoire se pose plus tard, quand les données existent — et par une migration.
 */
create or replace function public.fn_champ_ajouter(
  p_table text, p_colonne text, p_type text,
  p_defaut text default null, p_commentaire text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  motif text;
  ordre text;
begin
  motif := public.fn_schema_refus(p_table, p_colonne, false);
  if motif is null and not public.fn_schema_type_admis(p_type) then
    motif := format('Type non admis : %L. Types possibles : text, integer, bigint, numeric, '
                    'boolean, date, timestamptz, uuid, jsonb.', p_type);
  end if;
  if motif is not null then
    perform public.fn_schema_journaliser('ajout', p_table, p_colonne, p_type, null, false, motif);
    raise exception '%', motif using errcode = '42501';
  end if;

  -- `%I` POUR LES IDENTIFIANTS, `%L` POUR LES VALEURS : c'est ce qui rend l'injection impossible.
  -- Le type ne passe pas par `%I` — il vient d'une liste blanche, et `%I` le mettrait entre
  -- guillemets, ce qui en ferait un type inexistant.
  ordre := format('alter table public.%I add column %I %s', p_table, p_colonne, p_type);
  if p_defaut is not null and btrim(p_defaut) <> '' then
    ordre := ordre || format(' default %L', p_defaut);
  end if;
  execute ordre;

  if p_commentaire is not null and btrim(p_commentaire) <> '' then
    execute format('comment on column public.%I.%I is %L', p_table, p_colonne, p_commentaire);
  end if;

  perform public.fn_schema_journaliser('ajout', p_table, p_colonne, p_type, ordre, true, null);
  -- SANS CECI, LA COLONNE RESTE INVISIBLE : PostgREST garde le schéma en mémoire.
  notify pgrst, 'reload schema';
  return jsonb_build_object('ok', true, 'sql', ordre);
end;
$$;

/** DOCUMENTER UN CHAMP. La seule opération qui ne peut rien casser : un commentaire ne s'exécute pas. */
create or replace function public.fn_champ_documenter(
  p_table text, p_colonne text, p_commentaire text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  motif text;
  ordre text;
begin
  -- On ne réutilise pas `fn_schema_refus` en entier : documenter une colonne protégée ou une clé
  -- est non seulement sans danger, c'est souhaitable. Seuls l'accès et l'existence comptent.
  if not public.fn_est_administrateur() then
    motif := 'Réservé aux administrateurs.';
  elsif p_table !~ '^[a-z][a-z0-9_]{0,58}$' or p_colonne !~ '^[a-z][a-z0-9_]{0,58}$' then
    motif := 'Nom de table ou de colonne invalide.';
  elsif not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = p_table and column_name = p_colonne
  ) then
    motif := format('La colonne %I.%I n''existe pas.', p_table, p_colonne);
  end if;

  if motif is not null then
    perform public.fn_schema_journaliser('documentation', p_table, p_colonne, p_commentaire, null, false, motif);
    raise exception '%', motif using errcode = '42501';
  end if;

  ordre := format('comment on column public.%I.%I is %L', p_table, p_colonne, p_commentaire);
  execute ordre;
  perform public.fn_schema_journaliser('documentation', p_table, p_colonne, p_commentaire, ordre, true, null);
  return jsonb_build_object('ok', true, 'sql', ordre);
end;
$$;

/**
 * RENOMMER UN CHAMP.
 *
 * C'EST L'OPÉRATION LA PLUS TRAÎTRE, et la base ne peut pas la rendre sûre à elle seule : elle
 * réussira toujours, et c'est l'application qui cassera une seconde plus tard, en silence. Le
 * contrôle qui compte — « cette colonne est-elle nommée dans le code ? » — ne peut se faire que
 * côté écran, qui connaît le code. Ici on refuse ce qui est structurellement lié ; l'avertissement
 * sur l'usage dans le code vient du gestionnaire, avant l'appel.
 */
create or replace function public.fn_champ_renommer(
  p_table text, p_colonne text, p_nouveau text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  motif text;
  ordre text;
begin
  motif := public.fn_schema_refus(p_table, p_colonne, true);
  if motif is null then
    if p_nouveau !~ '^[a-z][a-z0-9_]{0,58}$' then
      motif := format('Nouveau nom invalide : %L.', p_nouveau);
    elsif public.fn_schema_colonne_protegee(p_nouveau) then
      motif := format('%I est un nom réservé.', p_nouveau);
    elsif exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = p_table and column_name = p_nouveau
    ) then
      motif := format('La colonne %I existe déjà dans %I.', p_nouveau, p_table);
    end if;
  end if;
  if motif is not null then
    perform public.fn_schema_journaliser('renommage', p_table, p_colonne, p_nouveau, null, false, motif);
    raise exception '%', motif using errcode = '42501';
  end if;

  ordre := format('alter table public.%I rename column %I to %I', p_table, p_colonne, p_nouveau);
  execute ordre;
  perform public.fn_schema_journaliser('renommage', p_table, p_colonne, p_nouveau, ordre, true, null);
  notify pgrst, 'reload schema';
  return jsonb_build_object('ok', true, 'sql', ordre);
end;
$$;

/**
 * SUPPRIMER UN CHAMP.
 *
 * RÉSERVÉE AU SUPER_ADMIN, et précédée d'une copie. Un `drop column` est la seule opération de ce
 * fichier dont on ne revient pas : les valeurs partent avec la colonne, et aucune corbeille ne les
 * rattrape. On les recopie donc d'abord dans `archives_colonnes_supprimees`.
 */
create or replace function public.fn_champ_supprimer(
  p_table text, p_colonne text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  motif  text;
  ordre  text;
  typ    text;
  vals   jsonb;
  n      integer;
begin
  motif := public.fn_schema_refus(p_table, p_colonne, true);
  if motif is null and not public.has_role_acces(auth.uid(), array['SUPER_ADMIN']) then
    motif := 'La suppression d''un champ est réservée aux super-administrateurs.';
  end if;
  if motif is null and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = p_table and column_name = 'id'
  ) then
    -- SANS IDENTIFIANT, ON NE SAIT PAS À QUELLE LIGNE APPARTIENT UNE VALEUR : l'archive serait un
    -- sac de valeurs anonymes, donc inexploitable pour restaurer.
    motif := format('La table %I n''a pas de colonne id : la copie de sauvegarde serait inutilisable.', p_table);
  end if;
  if motif is not null then
    perform public.fn_schema_journaliser('suppression', p_table, p_colonne, null, null, false, motif);
    raise exception '%', motif using errcode = '42501';
  end if;

  select format_type(a.atttypid, a.atttypmod) into typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = p_table and a.attname = p_colonne;

  -- LA COPIE D'ABORD, LA SUPPRESSION ENSUITE. L'ordre inverse perdrait tout si la copie échouait.
  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''id'', t.id, ''valeur'', to_jsonb(t.%I))), ''[]''::jsonb), count(*)
       from public.%I t where t.%I is not null', p_colonne, p_table, p_colonne)
    into vals, n;

  insert into public.archives_colonnes_supprimees
    (table_cible, colonne, type_colonne, valeurs, nb_lignes, auteur_id)
  values (p_table, p_colonne, typ, vals, n, auth.uid());

  ordre := format('alter table public.%I drop column %I', p_table, p_colonne);
  execute ordre;
  perform public.fn_schema_journaliser('suppression', p_table, p_colonne, null, ordre, true, null);
  notify pgrst, 'reload schema';
  return jsonb_build_object('ok', true, 'sql', ordre, 'valeurs_archivees', n);
end;
$$;

revoke all on function public.fn_champ_ajouter(text, text, text, text, text) from public, anon;
revoke all on function public.fn_champ_documenter(text, text, text) from public, anon;
revoke all on function public.fn_champ_renommer(text, text, text) from public, anon;
revoke all on function public.fn_champ_supprimer(text, text) from public, anon;
grant execute on function public.fn_champ_ajouter(text, text, text, text, text) to authenticated;
grant execute on function public.fn_champ_documenter(text, text, text) to authenticated;
grant execute on function public.fn_champ_renommer(text, text, text) to authenticated;
grant execute on function public.fn_champ_supprimer(text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LES REFUS REFUSENT VRAIMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- On ne teste pas qu'une colonne s'ajoute — ça, on le verra. On teste CE QUI DOIT ÊTRE IMPOSSIBLE,
-- parce que c'est la seule moitié dont l'échec est silencieux : une protection qui ne protège pas
-- ne se remarque que le jour où quelqu'un supprime la mauvaise colonne.
--
-- `fn_schema_refus` contrôle l'accès en premier, et `auth.uid()` est nul dans une migration : on
-- teste donc les prédicats qui portent la logique, indépendamment de l'appelant.
--
do $$
begin
  if not public.fn_schema_table_interdite('journal_schema') then
    raise exception 'Le journal devrait être une table protégée.';
  end if;
  if not public.fn_schema_table_interdite('profils') then
    raise exception 'La table des profils devrait être protégée.';
  end if;
  if public.fn_schema_table_interdite('comptes') then
    raise exception 'La table comptes ne devrait PAS être protégée : on doit pouvoir y ajouter un champ.';
  end if;

  if not public.fn_schema_colonne_protegee('id') then
    raise exception 'La colonne id devrait être protégée.';
  end if;
  if not public.fn_schema_colonne_protegee('date_creation') then
    raise exception 'La colonne date_creation devrait être protégée.';
  end if;
  if public.fn_schema_colonne_protegee('telephone') then
    raise exception 'La colonne telephone ne devrait PAS être protégée.';
  end if;

  if public.fn_schema_type_admis('serial') or public.fn_schema_type_admis('text[]') then
    raise exception 'La liste blanche des types laisse passer un type qu''elle devrait refuser.';
  end if;
  if not public.fn_schema_type_admis('text') then
    raise exception 'Le type text devrait être admis.';
  end if;

  raise notice 'Garde-fou : tables et colonnes protégées reconnues, liste blanche des types étanche.';
end $$;

commit;
