-- ============================================================================================
-- Politique d'accès sur contacts_comptes
-- ============================================================================================
-- La table créée par 20260813120000 porte bien ses 3526 lignes, mais aucune ne remontait à
-- l'application : Supabase active RLS d'office sur toute table nouvellement créée, et une table
-- sous RLS sans aucune politique refuse toute lecture. Elle renvoyait donc zéro ligne, sans
-- erreur — le code retombait sur son repli et n'affichait que le compte principal.
--
-- La politique reproduit celle des tables voisines (contacts, contacts_sites, comptes) :
-- `authenticated_all`, en ALL, pour le rôle authenticated. Le filtrage par périmètre est fait
-- côté application (fetchComptesVisibles), pas ici — s'en écarter sur cette seule table créerait
-- une incohérence avec le reste du schéma.
-- ============================================================================================

begin;

create policy authenticated_all on public.contacts_comptes
  for all
  to authenticated
  using (true)
  with check (true);

commit;

-- Contrôle : doit renvoyer 1 politique, comme contacts et contacts_sites.
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'contacts_comptes';
--
-- Puis, en étant connecté à l'application, Romain HEBRARD doit afficher 10 comptes rattachés.
