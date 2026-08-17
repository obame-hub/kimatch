-- Fiche Recommandation : les trois tables de la migration du 16/08 sont inaccessibles à l'application.
--
-- CONSTAT DU 17/08/2026, en branchant l'écran sur ces tables. Les trois tables créées par
-- 20260816180000 ont Row Level Security ACTIF et ZÉRO politique :
--
--   types_objectifs_client       rls=true  politiques=0
--   recommandations_objectifs    rls=true  politiques=0
--   partages_etude_client        rls=true  politiques=0
--
-- RLS actif sans politique ne renvoie pas d'erreur : il renvoie ZÉRO LIGNE, et refuse les
-- écritures. Concrètement, sans cette migration :
--
--   · l'onglet « Commande du client » n'affiche AUCUN des huit objectifs (la liste de référence
--     elle-même est filtrée), et cocher un objectif échoue ;
--   · le bloc « Étude client » ne voit jamais le lien de partage, et « Créer le lien » échoue.
--
-- Et cela silencieusement, ce qui est le pire cas : l'écran a l'air fonctionnel mais vide. C'est
-- exactement le piège déjà rencontré sur ce schéma (44 tables sans politique, constaté le
-- 17/07/2026). Le CREATE TABLE ne pose pas de politique, il faut l'écrire.
--
-- La politique reprise est celle des 40 autres tables du schéma, à l'identique — même nom, même
-- portée : `authenticated_all`, FOR ALL TO authenticated, USING (true) WITH CHECK (true). On ne
-- profite PAS de cette migration pour introduire un modèle de permissions plus fin sur trois tables
-- au milieu de quarante : la visibilité par périmètre est appliquée côté application
-- (`lib/data/visibility.ts`), et trois tables qui se comporteraient autrement que les autres
-- seraient une source d'erreurs, pas de sécurité. Resserrer les politiques est un chantier à mener
-- sur tout le schéma d'un coup, pas par morceaux.
--
-- `docusign_sessions` est aussi RLS-actif-sans-politique et n'est PAS touchée ici : elle n'est lue
-- que côté serveur avec la clé de service, et lui ouvrir l'accès aux utilisateurs authentifiés
-- exposerait des jetons OAuth. Son cas est délibéré.

begin;

-- `drop policy if exists` avant chaque création : la migration doit pouvoir être rejouée sans
-- échouer sur « policy already exists », et deux politiques homonymes ne veulent rien dire.

drop policy if exists authenticated_all on public.types_objectifs_client;
create policy authenticated_all on public.types_objectifs_client
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.recommandations_objectifs;
create policy authenticated_all on public.recommandations_objectifs
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.partages_etude_client;
create policy authenticated_all on public.partages_etude_client
  for all to authenticated using (true) with check (true);

commit;

-- Vérification après application (à coller tel quel) :
--
--   select c.relname, c.relrowsecurity as rls_actif,
--          (select count(*) from pg_policies p
--            where p.schemaname='public' and p.tablename=c.relname) as nb_politiques
--     from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public'
--      and c.relname in ('types_objectifs_client','recommandations_objectifs','partages_etude_client')
--    order by 1;
--   -- attendu : 3 lignes, rls_actif = true, nb_politiques = 1 pour chacune
--
--   select count(*) from public.types_objectifs_client;
--   -- attendu : 8, inchangé (aucune donnée touchée par cette migration)
--
--   -- Et, dans Kimatch, sur n'importe quelle recommandation : l'onglet « Commande du client »
--   -- doit afficher les huit objectifs, et en cocher un doit tenir après rechargement.
