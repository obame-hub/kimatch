-- ============================================================================================
-- Politiques manquantes sur les deux référentiels de statuts de contrat
-- ============================================================================================
-- Audit RLS du 13/08/2026 : sur 118 tables, deux étaient sous RLS sans aucune politique, donc
-- muettes. Ce sont les deux que la migration des cycles de vie (20260812090000) a créées —
-- statuts_contrats_avancement et statuts_contrats_vie. Supabase active RLS d'office à la création
-- d'une table, et une table sous RLS sans politique refuse toute lecture SANS lever d'erreur.
--
-- Conséquence si on ne corrige pas : les statuts des deux cycles de contrat ne remonteraient
-- jamais à l'application. Elle se replierait sur FALLBACK_STATUTS_CONTRATS, donc afficherait
-- l'ancienne liste plate en croyant afficher les nouveaux cycles — une erreur silencieuse, du même
-- genre que celle qui a masqué les 3526 lignes de contacts_comptes ce matin.
--
-- Les 116 autres tables ont leur politique. Aucune n'a RLS désactivé.
-- ============================================================================================

begin;

drop policy if exists authenticated_all on public.statuts_contrats_avancement;
create policy authenticated_all on public.statuts_contrats_avancement
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.statuts_contrats_vie;
create policy authenticated_all on public.statuts_contrats_vie
  for all to authenticated using (true) with check (true);

commit;

-- Contrôle : plus aucune table sous RLS sans politique.
--   select c.relname
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
--      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
