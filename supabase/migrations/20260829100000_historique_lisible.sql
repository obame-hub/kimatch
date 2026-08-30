-- L'historique disait QUI, pas QUOI.
--
-- Naoelle, 29/08/2026, en lisant la ligne de Michel : « on sait qui, on ne comprend pas quoi ».
-- La ligne disait exactement ceci :
--
--   Michel OBAME a modifie statut_id : 57db1d85-ba63-4043-a08... -> 0f04d925-648a-4dd6-bd2...
--
-- Deux identifiants techniques. Il fallait aller chercher a la main dans quelle table ils vivent,
-- puis les y lire un par un, pour comprendre qu'un signal etait passe de « Nouveau » a « Converti ».
-- Personne ne fait ca. La trace existait donc sans etre utilisable.
--
-- Ce n'est pas marginal : sur les colonnes de type identifiant, l'historique en compte des dizaines
-- de milliers — 7 884 changements de proprietaire sur les compteurs, 5 139 changements d'etape sur
-- les recommandations, 1 598 changements de statut d'avancement sur les contrats.
--
-- COMMENT ON RESOUT, ET POURQUOI PAS AUTREMENT. On aurait pu ecrire a la main la liste
-- « statut_id -> statuts_signaux, etape_id -> etapes_recommandation, ... ». Cette liste aurait
-- vieilli au premier ajout de colonne, en silence, et personne ne s'en serait apercu — c'est
-- exactement le genre de dictionnaire fige que l'audit reproche ailleurs a l'application.
--
-- La base connait deja ces liens : ce sont ses cles etrangeres. On les lui demande. Une colonne
-- ajoutee demain sera resolue sans qu'on touche a quoi que ce soit.

begin;

-- ── Le libelle d'une ligne, quelle que soit sa table ──────────────────────────────────────────
-- Chaque table nomme sa colonne d'affichage a sa facon : `libelle` pour les referentiels, `nom`
-- pour les comptes et les sites, `numero_point` pour un compteur, `titre` pour une tache. Et les
-- personnes s'ecrivent en deux colonnes. On essaie dans l'ordre, on prend la premiere qui existe.
create or replace function public.libelle_de_ligne(p_table text, p_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_colonnes text[];
  v_sql      text;
  v_libelle  text;
  v_candidat text;
begin
  if p_id is null then return null; end if;

  select array_agg(column_name::text) into v_colonnes
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table;

  if v_colonnes is null then return null; end if;

  -- Les personnes d'abord : leur nom vit en deux morceaux.
  if 'prenom' = any(v_colonnes) and 'nom' = any(v_colonnes) then
    v_sql := format('select trim(coalesce(prenom,'''') || '' '' || coalesce(nom,'''')) from public.%I where id = $1', p_table);
    execute v_sql into v_libelle using p_id;
    return nullif(v_libelle, '');
  end if;

  foreach v_candidat in array array['libelle', 'nom', 'numero_point', 'titre', 'objet', 'reference'] loop
    if v_candidat = any(v_colonnes) then
      v_sql := format('select %I::text from public.%I where id = $1', v_candidat, p_table);
      execute v_sql into v_libelle using p_id;
      return nullif(v_libelle, '');
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.libelle_de_ligne(text, uuid) is
  'Le libelle affichable d''une ligne, en essayant les colonnes d''affichage usuelles dans l''ordre. '
  'Renvoie NULL si la table n''existe pas, si la ligne a disparu, ou si aucune colonne ne convient.';

-- ── La table vers laquelle pointe une colonne ─────────────────────────────────────────────────
-- Lue dans les cles etrangeres, pas dans une liste ecrite a la main : c'est ce qui fait qu'une
-- colonne ajoutee demain sera resolue toute seule.
create or replace function public.table_visee_par(p_table text, p_colonne text)
returns text
language sql
stable
as $$
  select cl.relname::text
    from pg_constraint c
    join pg_class      t  on t.oid = c.conrelid
    join pg_attribute  a  on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_class      cl on cl.oid = c.confrelid
   where c.contype = 'f'
     and c.connamespace = 'public'::regnamespace
     and array_length(c.conkey, 1) = 1
     and t.relname = p_table
     and a.attname = p_colonne
   limit 1;
$$;

-- ── Ce que l'ecran lit ────────────────────────────────────────────────────────────────────────
-- Un identifiant devient son libelle ; tout le reste passe tel quel. Quand la resolution echoue
-- (ligne supprimee depuis, table sans colonne d'affichage), on garde la valeur brute : un
-- identifiant illisible reste plus honnete qu'un vide qui ferait croire a une absence de valeur.
create or replace view public.v_historique_modifications
with (security_invoker = true) as
select
  h.id,
  h.table_nom,
  h.ligne_id,
  h.champ,
  h.ancienne_valeur,
  h.nouvelle_valeur,
  h.modifie_par_id,
  h.origine,
  h.date_modification,
  case
    when h.ancienne_valeur ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(
           public.libelle_de_ligne(public.table_visee_par(h.table_nom, h.champ), h.ancienne_valeur::uuid),
           h.ancienne_valeur)
    else h.ancienne_valeur
  end as ancienne_lisible,
  case
    when h.nouvelle_valeur ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then coalesce(
           public.libelle_de_ligne(public.table_visee_par(h.table_nom, h.champ), h.nouvelle_valeur::uuid),
           h.nouvelle_valeur)
    else h.nouvelle_valeur
  end as nouvelle_lisible
from public.historique_modifications h;

comment on view public.v_historique_modifications is
  'L''historique avec les identifiants resolus en libelles. « statut_id : 57db1d85... -> 0f04d925... » '
  'devient « statut : Nouveau -> Converti ».';

commit;
