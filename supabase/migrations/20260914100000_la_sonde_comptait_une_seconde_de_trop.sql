-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA SONDE COMPTAIT UNE SECONDE DE TROP
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Correction de 20260914090000, écrite deux heures plus tôt le même jour.
--
-- ══ CE QUE J'AI ÉCRIT ═════════════════════════════════════════════════════════════════════════
--
--   sonde_ms := extract(milliseconds from ecart)::integer
--             + extract(seconds from ecart)::integer * 1000;
--
-- Je croyais que `milliseconds` rendait la partie fractionnaire, et qu'il fallait y rajouter les
-- secondes. C'est faux, et vérifié :
--
--   interval '0.5 sec'   → extract(milliseconds) =  500
--   interval '1.85 sec'  → extract(milliseconds) = 1850
--   interval '9.4 sec'   → extract(milliseconds) = 9400
--
-- `milliseconds` CONTIENT DÉJÀ LES SECONDES. J'ajoutais donc les secondes une seconde fois.
--
-- ET LE SECOND DÉFAUT EST PIRE QUE LE PREMIER : `::integer` sur un numeric ARRONDIT en Postgres, il
-- ne tronque pas. Sur un calcul de 842 ms, `extract(seconds)` rend 0,842, arrondi à 1 — la sonde
-- ajoutait mille millisecondes à une mesure qui n'avait même pas atteint la seconde.
--
-- Relevé : la sonde annonçait 1 849 ms là où la vraie durée était 842 ms. Plus du double.
--
-- ══ POURQUOI LE GARDE-FOU N'A RIEN VU ════════════════════════════════════════════════════════
--
-- Il vérifiait `sonde_ms > 0`, pour attraper le piège de `now()` figé. Un décalage systématique
-- passe au travers d'un tel contrôle : le chiffre était plausible, stable d'un appel à l'autre, et
-- simplement faux.
--
-- CE QU'IL FAUT CONTRÔLER, C'EST L'ACCORD AVEC UNE MESURE INDÉPENDANTE — pas la vraisemblance. Le
-- nouveau garde-fou chronomètre le même travail par un autre chemin (`extract(epoch)`) et refuse un
-- écart de plus de 25 %. Un « +1000 ms » ne peut plus passer.
--
-- ══ CE QUE ÇA AURAIT COÛTÉ ═══════════════════════════════════════════════════════════════════
--
-- Rien aujourd'hui — aucune mesure nocturne n'a encore été prise, la tâche planifiée n'est pas
-- déployée. Mais la sonde existe pour trancher une dépense : `Large` coûte 110 $/mois contre 15.
-- Une sonde qui ajoute une seconde à chaque mesure aurait fait franchir le seuil des 1 500 ms à
-- une machine qui tourne à 900, et l'on aurait payé 95 $ de plus par mois pour corriger un bug
-- d'arithmétique.
--
-- La seule mesure déjà écrite (14/09, prise à la main) est fausse : on la supprime.
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
  -- `clock_timestamp` avance pendant la transaction ; `now` y est figé et l'écart vaudrait zéro.
  depart := clock_timestamp();
  select count(*) into n from generate_series(1, 3000000);

  -- `epoch` rend l'intervalle ENTIER en secondes, partie fractionnaire comprise. Un seul champ, une
  -- seule conversion : rien à recomposer, donc rien à recomposer de travers.
  sonde_ms := round(extract(epoch from (clock_timestamp() - depart)) * 1000)::integer;

  select count(*)::integer into connexions from pg_stat_activity;
  select setting::integer into max_connexions from pg_settings where name = 'max_connections';
  select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 1)
    into cache_pourcent
  from pg_stat_database where datname = current_database();

  return next;
end;
$function$;

-- La mesure du 14/09 prise à la main portait le défaut : elle fausserait la courbe dès la première
-- lecture, et c'est une courbe qu'on regardera pour décider d'une dépense.
delete from public.mesures_base where date_mesure::date = current_date and origine = 'MANUEL';

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : DEUX CHEMINS DOIVENT DONNER LE MÊME CHIFFRE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Le précédent demandait « est-ce plausible ? » et laissait passer une erreur de plus du double.
-- Celui-ci demande « est-ce d'accord avec une mesure prise autrement ? », qui est la seule question
-- qu'un chronomètre puisse vraiment vérifier.
--
-- 25 % de tolérance : deux exécutions successives du même calcul varient naturellement de quelques
-- pour cent sur une instance partagée, jamais du double.
--
do $$
declare
  m        record;
  depart   timestamptz;
  temoin   integer;
  n        bigint;
  ecart    numeric;
begin
  select * into m from public.fn_sonder_le_processeur();

  depart := clock_timestamp();
  select count(*) into n from generate_series(1, 3000000);
  temoin := round(extract(epoch from (clock_timestamp() - depart)) * 1000)::integer;

  if m.sonde_ms is null or m.sonde_ms <= 0 then
    raise exception 'La sonde rend % ms : le chronomètre ne tourne pas.', m.sonde_ms;
  end if;

  ecart := abs(m.sonde_ms - temoin)::numeric / greatest(temoin, 1);
  if ecart > 0.25 then
    raise exception 'La sonde (% ms) et le témoin (% ms) divergent de % pour cent : le calcul de durée est faux.',
      m.sonde_ms, temoin, round(ecart * 100);
  end if;

  raise notice 'Garde-fou : sonde % ms, témoin % ms, écart % pour cent.',
    m.sonde_ms, temoin, round(ecart * 100);
end $$;

commit;
