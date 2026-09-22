-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UNE SEULE SIGNATURE POUR LA TÂCHE AUTOMATIQUE
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- La migration précédente a ajouté un cinquième paramètre `p_titre` à
-- `creer_tache_debut_prospection`. `create or replace` ne remplace PAS une fonction dont la liste
-- de paramètres change : Postgres en a créé une SECONDE, et les deux ont cohabité.
--
-- CE N'EST PAS UN DÉTAIL DE RANGEMENT. Les trois déclencheurs posés le 21/09 l'appellent avec
-- TROIS arguments. Face à deux candidates qui acceptent toutes les deux trois arguments grâce à
-- leurs valeurs par défaut, Postgres ne choisit pas : il refuse avec « function is not unique ».
-- Autrement dit, toute création de piste ou d'opportunité aurait échoué jusqu'à ce que l'ancienne
-- disparaisse. Vérifié en interrogeant `pg_proc` juste après l'application — d'où cette migration.

drop function if exists public.creer_tache_debut_prospection(text, uuid, uuid, timestamptz);
