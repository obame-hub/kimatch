-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES PISTES PARLENT AUSSI EN TEMPS RÉEL
--
-- La cinquième carte du tableau de bord compte MES pistes qui portent une tâche ouverte. Elle doit
-- donc réagir à trois événements : la tâche qu'on termine, l'opportunité qui change de statut, et
-- la piste qui change de propriétaire ou qui est archivée. `actions` et `opportunites` étaient déjà
-- publiées (migration 20260910270000) ; `pistes` manquait.
--
-- IDENTITÉ DE RÉPLICATION PAR DÉFAUT, comme les deux autres : l'écran ne lit pas la charge utile de
-- l'événement, il RECOMPTE. Passer en FULL ferait transiter chaque ligne entière pour rien.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'pistes'
  ) then
    alter publication supabase_realtime add table pistes;
  end if;
end $$;

do $$
declare n int;
begin
  select count(*) into n
  from pg_publication_rel pr
  join pg_publication p on p.oid = pr.prpubid
  join pg_class c on c.oid = pr.prrelid
  where p.pubname = 'supabase_realtime' and c.relname in ('actions', 'opportunites', 'pistes');

  if n <> 3 then
    raise exception 'Attendu 3 tables publiées, trouvé %.', n;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select c.relname from pg_publication p
--   join pg_publication_rel pr on pr.prpubid = p.oid
--   join pg_class c on c.oid = pr.prrelid
--   where p.pubname = 'supabase_realtime' order by 1;
--   -- attendu : actions, appels_en_cours, mandats, opportunites, pistes
-- ════════════════════════════════════════════════════════════════════════════════════════════════
