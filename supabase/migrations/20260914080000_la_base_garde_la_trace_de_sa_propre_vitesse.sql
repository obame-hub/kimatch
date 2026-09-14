-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA BASE GARDE LA TRACE DE SA PROPRE VITESSE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ══ CE QUI A MOTIVÉ ÇA ════════════════════════════════════════════════════════════════════════
--
-- Le 10/09/2026, toute l'équipe à l'arrêt pendant quarante minutes : l'application ne répondait
-- plus, l'auth non plus, et la page d'état de Supabase était verte. J'ai cherché dans PostgREST,
-- dans les verrous, dans les connexions. La cause était ailleurs — l'instance n'avait plus de CPU,
-- épuisé par un import de 12 000 fichiers lancé à pleine vitesse.
--
-- CE QUI L'A MONTRÉ EN DIX SECONDES : faire compter la base jusqu'à trois millions et chronométrer.
-- 9 414 ms, contre 200 à 400 sur une machine saine. Le tableau de bord Supabase affichait « CPU
-- 17 % » au même moment — 17 % d'un quota déjà réduit, donc rassurant et faux.
--
-- ══ POURQUOI UNE TABLE, ET NON UN FICHIER ════════════════════════════════════════════════════
--
-- La sonde existait depuis le 10/09 (`npm run sonde`) et écrivait dans un CSV local. Elle a
-- enregistré DEUX mesures, toutes deux ce jour-là : une mesure qu'il faut penser à lancer n'est
-- pas une mesure, c'est une bonne intention. Et un journal qui vit sur un poste s'arrête quand le
-- poste dort.
--
-- Elle devient donc une tâche planifiée comme les cinq autres, et son journal une table que tout le
-- monde peut lire.
--
-- ══ CE QUE LA COURBE DOIT TRANCHER ════════════════════════════════════════════════════════════
--
-- Kimatch tourne sur `Small` (2 Go, CPU PARTAGÉ), passé en urgence depuis `Nano` le 10/09. Small et
-- Medium sont tous deux partagés : ils accumulent des crédits de calcul et se font brider quand ils
-- les épuisent. `Large` est le premier à CPU dédié — mais à 110 $/mois contre 15.
--
-- La question n'est donc pas « faut-il plus gros », c'est À QUELLE FRÉQUENCE ON FRÔLE LA LIMITE EN
-- USAGE NORMAL. Une semaine de mesures y répond ; une mauvaise journée, non.
--
-- ══ CE QU'ON MESURE, ET POURQUOI CELUI-LÀ ════════════════════════════════════════════════════
--
-- `generate_series` ne lit aucune table, ne touche pas au disque, ne dépend d'aucun index ni
-- d'aucune statistique. Le temps obtenu ne dépend QUE du processeur disponible. Une requête métier
-- mêlerait tout : on ne saurait pas si elle rame parce que la machine est bridée ou parce qu'il
-- manque un index — et c'est exactement la confusion qui m'a fait perdre une demi-heure le 10/09.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.mesures_base (
  id               uuid primary key default gen_random_uuid(),
  date_mesure      timestamptz not null default now(),
  sonde_ms         integer     not null,
  connexions       integer,
  max_connexions   integer,
  cache_pourcent   numeric(5,1),
  -- CE QUI A DÉCLENCHÉ LA MESURE : la tâche planifiée, ou quelqu'un en ligne de commande. Une
  -- mesure prise à la main pendant un incident ne se compare pas à celles de 4 h du matin.
  origine          text        not null default 'CRON'
    check (origine in ('CRON', 'MANUEL'))
);

comment on table public.mesures_base is
  'Une mesure de vitesse pure du processeur par jour, pour décider de la taille de l''instance sur '
  'une courbe et non sur une mauvaise journée. Voir api/sonde/mesurer.ts.';

-- La lecture se fait toujours par date décroissante — les dernières mesures d'abord.
create index if not exists idx_mesures_base_date on public.mesures_base (date_mesure desc);

-- ── RLS : LECTURE POUR TOUT LE MONDE, ÉCRITURE POUR PERSONNE ──────────────────────────────────
-- Toute table créée par migration naît avec RLS actif et AUCUNE politique — donc muette, y compris
-- pour la page Automatismes qui doit l'afficher. La tâche planifiée écrit avec la clé de service,
-- qui contourne RLS : aucune politique d'insertion n'est donc nécessaire, et ne pas en poser
-- garantit qu'aucun navigateur ne pourra fabriquer de fausses mesures.
alter table public.mesures_base enable row level security;

drop policy if exists mesures_base_lecture on public.mesures_base;
create policy mesures_base_lecture on public.mesures_base
  for select to authenticated using (true);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE GARDE-FOU : ON ÉCRIT UNE MESURE POUR DE VRAI, PUIS ON L'EFFACE
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Vérifier que la table existe ne dirait rien de la contrainte sur `origine`, et c'est elle qui
-- empêchera un jour d'écrire n'importe quoi dans ce journal. On insère donc une vraie ligne, on
-- vérifie qu'une valeur interdite est refusée, et on efface l'essai.
--
do $$
declare
  essai uuid;
  refuse boolean := false;
begin
  insert into public.mesures_base (sonde_ms, connexions, max_connexions, cache_pourcent, origine)
  values (1, 1, 90, 100.0, 'MANUEL')
  returning id into essai;

  begin
    insert into public.mesures_base (sonde_ms, origine) values (1, 'AUTRE');
  exception when check_violation then
    refuse := true;
  end;

  if not refuse then
    raise exception 'La contrainte sur `origine` n''est pas appliquée : une valeur inconnue passe.';
  end if;

  delete from public.mesures_base where id = essai;
  raise notice 'Garde-fou : une mesure s''écrit, une origine inconnue est refusée.';
end $$;

commit;
