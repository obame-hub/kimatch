-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES TÂCHES ET LES OPPORTUNITÉS PARLENT EN TEMPS RÉEL
--
-- William, 10/09/2026, en refondant le tableau de bord : « dès que la tâche est fermée, le nombre
-- diminue de 1 avec une animation lente et dynamique, en temps réel sans besoin de rafraîchir la
-- page ».
--
-- ── CE QUI MANQUAIT ──
--
-- `supabase_realtime` ne publiait que `appels_en_cours` et `mandats`. Une page ouverte n'apprenait
-- donc jamais qu'une tâche venait d'être cochée ailleurs — ni par un collègue, ni par soi-même dans
-- un autre onglet. Les compteurs du haut de page seraient restés figés jusqu'au rechargement.
--
-- ── POURQUOI LES DEUX TABLES, ET PAS SEULEMENT `actions` ──
--
-- Trois des métriques comptent des OPPORTUNITÉS qui portent une tâche ouverte. Elles doivent donc
-- réagir à deux événements distincts : la tâche qu'on termine, et l'opportunité qui change de
-- statut — « diminue de 1 quand la tâche est faite OU quand l'opportunité change de statut ».
-- Publier `actions` seule laisserait la moitié des cas invisibles.
--
-- ── L'IDENTITÉ DE RÉPLICATION RESTE PAR DÉFAUT ──
--
-- `REPLICA IDENTITY DEFAULT` n'envoie que la clé primaire sur un UPDATE ou un DELETE. C'est
-- suffisant ici : l'écran ne lit pas la charge utile de l'événement, il RECOMPTE. Passer en FULL
-- ferait transiter chaque ligne entière dans le WAL et par le socket, pour une information dont
-- personne ne se sert — et `actions` est une table qui bouge toute la journée.
--
-- LA SÉCURITÉ NE CHANGE PAS. La publication alimente le flux ; c'est la RLS qui décide de ce que
-- chaque abonné reçoit, exactement comme pour une lecture ordinaire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'actions'
  ) then
    alter publication supabase_realtime add table actions;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'opportunites'
  ) then
    alter publication supabase_realtime add table opportunites;
  end if;
end $$;

do $$
declare n int;
begin
  select count(*) into n
  from pg_publication_rel pr
  join pg_publication p on p.oid = pr.prpubid
  join pg_class c on c.oid = pr.prrelid
  where p.pubname = 'supabase_realtime' and c.relname in ('actions', 'opportunites');

  if n <> 2 then
    raise exception 'Attendu 2 tables publiées, trouvé %.', n;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select c.relname, c.relreplident from pg_publication p
--   join pg_publication_rel pr on pr.prpubid = p.oid
--   join pg_class c on c.oid = pr.prrelid
--   where p.pubname = 'supabase_realtime' order by 1;
--   -- attendu : actions, appels_en_cours, mandats, opportunites — toutes en 'd' (default)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
