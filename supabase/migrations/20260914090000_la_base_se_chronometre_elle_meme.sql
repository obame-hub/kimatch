-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA BASE SE CHRONOMÈTRE ELLE-MÊME
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Suite de 20260914080000, qui a créé le journal. Il manquait la mesure elle-même.
--
-- ══ POURQUOI LE CHRONOMÈTRE EST ICI, ET NON DANS LA TÂCHE PLANIFIÉE ══════════════════════════
--
-- La première version mesurait depuis Vercel : lancer la requête, attendre la réponse, faire la
-- différence. On aurait alors chronométré DEUX choses — le calcul, et le voyage réseau entre la
-- fonction et la base. Ce voyage varie de vingt à deux cents millisecondes selon la région et le
-- moment, soit exactement l'ordre de grandeur de ce qu'on cherche à observer.
--
-- Un indicateur qui mêle ce qu'il mesure à autre chose ne permet pas de comparer deux jours entre
-- eux — et c'est précisément ce qu'on lui demande : dire si la machine se dégrade.
--
-- `clock_timestamp()` et non `now()` : `now()` est figé pour toute la transaction, la différence
-- vaudrait zéro. C'est l'erreur classique, et elle est silencieuse.
--
-- ══ CE QU'ELLE RAPPORTE EN PLUS ══════════════════════════════════════════════════════════════
--
-- Les connexions et le taux de cache, relevés au même instant. Le 10/09, ce sont eux qui ont
-- écarté les fausses pistes : cache à 100 %, aucun verrou, 31 connexions sur 60 — la base ne
-- faisait rien, donc le problème n'était pas dedans.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.fn_sonder_le_processeur()
returns table (
  sonde_ms       integer,
  connexions     integer,
  max_connexions integer,
  cache_pourcent numeric
)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  depart timestamptz;
  n      bigint;
begin
  -- `clock_timestamp` avance pendant la transaction ; `now` non.
  depart := clock_timestamp();
  select count(*) into n from generate_series(1, 3000000);
  sonde_ms := extract(milliseconds from (clock_timestamp() - depart))::integer
            + extract(seconds from (clock_timestamp() - depart))::integer * 1000;

  select count(*)::integer into connexions from pg_stat_activity;
  select setting::integer into max_connexions from pg_settings where name = 'max_connections';
  select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 1)
    into cache_pourcent
  from pg_stat_database where datname = current_database();

  return next;
end;
$function$;

comment on function public.fn_sonder_le_processeur() is
  'Chronomètre un calcul pur DANS la base — trois millions d''entiers, aucune table lue. Le temps '
  'rendu ne dépend que du processeur disponible : c''est le seul chiffre qui distingue « la base '
  'est lente » de « la base est bridée ». Voir api/sonde/mesurer.ts.';

-- La tâche planifiée l'appelle avec la clé de service ; personne d'autre n'a à la déclencher.
revoke all on function public.fn_sonder_le_processeur() from public;
grant execute on function public.fn_sonder_le_processeur() to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON SONDE POUR DE VRAI
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que la fonction existe ne dirait rien du piège qu'elle contourne. On l'appelle donc, et
-- on refuse un chronomètre à zéro : c'est exactement ce que rendrait un `now()` figé, et ça
-- passerait inaperçu pendant des semaines — un journal rempli de zéros ressemble à une base très
-- rapide.
--
do $$
declare
  m record;
begin
  select * into m from public.fn_sonder_le_processeur();

  if m.sonde_ms is null or m.sonde_ms <= 0 then
    raise exception 'La sonde rend % ms : le chronomètre ne tourne pas (piège classique de now() figé).', m.sonde_ms;
  end if;
  if m.max_connexions is null or m.max_connexions <= 0 then
    raise exception 'La sonde ne lit pas max_connections.';
  end if;

  -- `%%` est un pourcentage LITTÉRAL en plpgsql : il ne consomme pas d'argument. Écrit avec quatre
  -- valeurs pour trois emplacements, le bloc ne compile même pas — ce qui est une chance.
  raise notice 'Garde-fou : la sonde rend % ms, % connexion(s) sur %, cache % pour cent.',
    m.sonde_ms, m.connexions, m.max_connexions, m.cache_pourcent;
end $$;

commit;
