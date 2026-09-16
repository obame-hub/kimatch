-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GESTIONNAIRE D'OBJETS — KIMATCH SAIT DIRE COMMENT IL EST FAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Naoëlle, 16/09/2026 : « on va créer un gestionnaire d'objets comme ce qui existe déjà dans
-- Salesforce, du côté administration. Un endroit où on peut créer, modifier, supprimer des champs
-- d'un objet, mettre leurs liens de colonne Supabase, toutes les tables, toutes les colonnes, tout
-- ce qui est utile, les ID. »
--
-- ══ CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ═══════════════════════════════════
--
-- Elle apporte LA LECTURE : une fonction qui rend l'intégralité du schéma sous une forme
-- exploitable par l'écran — tables, colonnes, types, obligatoires, valeurs par défaut, clés
-- primaires, clés étrangères dans les deux sens, index, unicité, commentaires, RLS et nombre de
-- politiques. C'est la moitié de l'Object Manager de Salesforce, et c'est celle dont on se sert
-- tous les jours : savoir où vit une donnée et à quoi elle est reliée.
--
-- ELLE NE PERMET PAS DE MODIFIER LE SCHÉMA, et ce n'est pas un oubli.
--
-- Un `ALTER TABLE` lancé depuis une page web s'appliquerait à treize personnes en train de
-- travailler, sans relecture, sans migration, sans trace dans le dépôt. Une colonne supprimée
-- emporte ses données définitivement — aucune corbeille ne rattrape ça. Et le code de Kimatch
-- nomme ses colonnes en dur : renommer `societe` depuis un écran d'administration casserait la
-- page Pistes à la seconde suivante, sans que personne ne fasse le lien.
--
-- Les champs vraiment nouveaux viendront donc d'un magasin dédié (métadonnées + valeurs), qui
-- s'ajoute sans toucher aux tables existantes. C'est une migration à part, pour que celle-ci
-- reste ce qu'elle est : une lecture, incapable d'abîmer quoi que ce soit.
--
-- ══ POURQUOI UNE FONCTION ET NON DES VUES ═══════════════════════════════════════════════════
--
-- PostgREST n'expose ni `information_schema` ni `pg_catalog`, et c'est heureux : la structure
-- d'une base en dit long sur ce qu'elle contient. Une fonction `security definer` permet de la
-- lire SANS ouvrir ces catalogues à tout le monde — elle vérifie elle-même que l'appelant est
-- administrateur, et refuse sinon.
--
-- DEUX FONCTIONS, ET C'EST VOULU. `fn_catalogue_schema_brut` fait le travail et n'est accessible à
-- personne ; `fn_catalogue_schema` contrôle l'accès puis l'appelle. Sans cette séparation, le
-- garde-fou ci-dessous ne pourrait pas s'exécuter : dans une migration, `auth.uid()` est nul, donc
-- le contrôle d'accès refuserait — et on ne testerait jamais ce qu'on vient d'écrire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Le travail : tout le schéma public, en un seul JSON ───────────────────────────────────────
create or replace function public.fn_catalogue_schema_brut()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
with tables_publiques as (
  select c.oid, c.relname as nom, c.relrowsecurity as rls_active,
         -- `reltuples` est une ESTIMATION tenue par l'autovacuum, pas un compte. On l'assume :
         -- compter vraiment quarante tables à chaque ouverture de l'écran coûterait des secondes,
         -- pour une précision dont personne n'a besoin ici.
         greatest(c.reltuples, 0)::bigint as lignes_estimees,
         obj_description(c.oid, 'pg_class') as commentaire
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
),
politiques as (
  select c.oid, count(*)::int as nb
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   group by c.oid
),
cles_primaires as (
  select i.indrelid as oid, a.attname as colonne
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indisprimary
),
uniques as (
  select i.indrelid as oid, a.attname as colonne
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indisunique and not i.indisprimary
),
indexees as (
  select distinct i.indrelid as oid, a.attname as colonne
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
),
-- LES DEUX SENS D'UNE CLÉ ÉTRANGÈRE. « Vers quoi pointe cette colonne » répond à « où est le
-- compte de ce contact ». « Qui pointe vers moi » répond à « qu'est-ce que je casse en supprimant
-- ce compte » — c'est la question qu'on se pose devant une suppression, et elle n'a aujourd'hui
-- aucune réponse dans l'application.
etrangeres as (
  select con.conrelid as oid,
         att.attname   as colonne,
         cref.relname  as table_cible,
         attref.attname as colonne_cible,
         case con.confdeltype
           when 'a' then 'interdit'  when 'r' then 'interdit'
           when 'c' then 'cascade'   when 'n' then 'mise à null'
           when 'd' then 'valeur par défaut' else null end as a_la_suppression
    from pg_constraint con
    join pg_class cref on cref.oid = con.confrelid
    cross join lateral unnest(con.conkey, con.confkey) as u(ck, cfk)
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.ck
    join pg_attribute attref on attref.attrelid = con.confrelid and attref.attnum = u.cfk
   where con.contype = 'f'
),
colonnes as (
  select t.oid, t.nom as table_nom,
         jsonb_agg(
           jsonb_build_object(
             'nom', a.attname,
             'position', a.attnum,
             'type', format_type(a.atttypid, a.atttypmod),
             'obligatoire', a.attnotnull,
             'defaut', pg_get_expr(ad.adbin, ad.adrelid),
             'genere', a.attgenerated <> '',
             'commentaire', col_description(t.oid, a.attnum),
             'cle_primaire', exists (select 1 from cles_primaires k where k.oid = t.oid and k.colonne = a.attname),
             'unique', exists (select 1 from uniques u where u.oid = t.oid and u.colonne = a.attname),
             'indexee', exists (select 1 from indexees i where i.oid = t.oid and i.colonne = a.attname),
             'reference', (
               select jsonb_build_object('table', e.table_cible, 'colonne', e.colonne_cible,
                                         'a_la_suppression', e.a_la_suppression)
                 from etrangeres e where e.oid = t.oid and e.colonne = a.attname limit 1
             )
           )
           order by a.attnum
         ) as champs
    from tables_publiques t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef ad on ad.adrelid = t.oid and ad.adnum = a.attnum
   group by t.oid, t.nom
)
select jsonb_build_object(
  'genere_le', now(),
  'tables', coalesce(jsonb_agg(
    jsonb_build_object(
      'nom', t.nom,
      'commentaire', t.commentaire,
      'lignes_estimees', t.lignes_estimees,
      'rls_active', t.rls_active,
      'nb_politiques', coalesce(p.nb, 0),
      'colonnes', c.champs,
      'referencee_par', coalesce((
        select jsonb_agg(jsonb_build_object('table', src.relname, 'colonne', e.colonne) order by src.relname)
          from etrangeres e
          join pg_class src on src.oid = e.oid
         where e.table_cible = t.nom
      ), '[]'::jsonb)
    ) order by t.nom
  ), '[]'::jsonb)
)
from tables_publiques t
left join politiques p on p.oid = t.oid
left join colonnes c on c.oid = t.oid;
$$;

comment on function public.fn_catalogue_schema_brut() is
  'Tout le schéma public en un JSON : tables, colonnes, types, clés, index, RLS. Sans contrôle '
  'd''accès — N''EST ACCORDÉE À PERSONNE. Passer par fn_catalogue_schema.';

-- Ceinture et bretelles : `security definer` ne sert qu'à lire les catalogues, pas à les ouvrir.
revoke all on function public.fn_catalogue_schema_brut() from public, anon, authenticated;

-- ── L'entrée publique : réservée aux administrateurs ──────────────────────────────────────────
create or replace function public.fn_catalogue_schema()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- LE REFUS EST EXPLICITE ET NON UN RÉSULTAT VIDE : un catalogue vide se lirait comme « la base
  -- est vide », et on chercherait la panne du mauvais côté.
  if not public.fn_est_administrateur() then
    raise exception 'Le gestionnaire d''objets est réservé aux administrateurs.'
      using errcode = '42501';
  end if;
  return public.fn_catalogue_schema_brut();
end;
$$;

comment on function public.fn_catalogue_schema() is
  'Le schéma complet pour le gestionnaire d''objets, réservé aux ADMIN et SUPER_ADMIN. '
  'Lève 42501 pour les autres plutôt que de rendre un catalogue vide, qui se lirait comme une base vide.';

revoke all on function public.fn_catalogue_schema() from public, anon;
grant execute on function public.fn_catalogue_schema() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : LE CATALOGUE DIT LA VÉRITÉ SUR CE QUI EXISTE DÉJÀ
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- On ne vérifie pas que la fonction « répond » : on vérifie qu'elle décrit correctement des faits
-- connus du schéma. Une introspection qui rend un JSON bien formé mais faux est pire qu'une erreur,
-- parce qu'on la croit.
--
do $$
declare
  cat      jsonb;
  t_comptes jsonb;
  col_id   jsonb;
  ref      jsonb;
begin
  cat := public.fn_catalogue_schema_brut();

  if jsonb_array_length(cat -> 'tables') < 10 then
    raise exception 'Le catalogue ne voit que % table(s) — l''introspection est cassée.',
      jsonb_array_length(cat -> 'tables');
  end if;

  select t into t_comptes
    from jsonb_array_elements(cat -> 'tables') t
   where t ->> 'nom' = 'comptes';
  if t_comptes is null then
    raise exception 'La table comptes est absente du catalogue.';
  end if;

  -- Sa clé primaire doit être vue COMME TELLE, pas seulement listée.
  select c into col_id
    from jsonb_array_elements(t_comptes -> 'colonnes') c
   where c ->> 'nom' = 'id';
  if col_id is null or (col_id ->> 'cle_primaire') <> 'true' then
    raise exception 'comptes.id n''est pas reconnue comme clé primaire : %', col_id;
  end if;

  -- Et les liens doivent se lire dans le sens qui sert : qui pointe vers un compte ?
  select r into ref
    from jsonb_array_elements(t_comptes -> 'referencee_par') r
   where r ->> 'table' = 'contacts';
  if ref is null then
    raise exception 'Le catalogue ne voit pas que contacts pointe vers comptes.';
  end if;

  raise notice 'Garde-fou : le catalogue décrit % tables, comptes.id en clé primaire, et le lien contacts → comptes.',
    jsonb_array_length(cat -> 'tables');
end $$;

commit;
