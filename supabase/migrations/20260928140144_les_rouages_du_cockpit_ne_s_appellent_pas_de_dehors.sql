-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES ROUAGES DU COCKPIT NE S'APPELLENT PAS DE DEHORS
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- L'audit de sécurité de Supabase, relu le 28/09/2026 juste après les trois migrations du jour :
-- les fonctions `SECURITY DEFINER` que j'y avais créées étaient exécutables par le rôle `anon`,
-- c'est-à-dire par n'importe qui tenant la clé publique — celle qui est dans le code du site.
--
-- La plus grave : `fn_terminer_taches_de(type, id)` aurait permis, sans être connecté, de fermer
-- toutes les tâches de n'importe quelle piste ou opportunité. Elle ne sert qu'aux déclencheurs.
--
-- ══ LA RÈGLE ══
--
-- Un ROUAGE — appelé par un déclencheur ou par une autre fonction — n'est exécutable par personne :
-- son propriétaire l'appelle, et c'est tout. Les déclencheurs n'ont pas besoin du droit EXECUTE de
-- celui qui écrit ; les fonctions `SECURITY DEFINER` appellent leurs rouages avec les droits de leur
-- propriétaire.
--
-- Une PORTE — appelée par l'écran — reste ouverte aux utilisateurs connectés, et fermée à `anon`.

-- ── Les rouages : fermés à tous ──
revoke execute on function public.fn_terminer_taches_de(text, uuid)               from public, anon, authenticated;
revoke execute on function public.recalculer_statut_opportunite(uuid)             from public, anon, authenticated;
revoke execute on function public.recalculer_statut_opportunites_du_compte(uuid)  from public, anon, authenticated;
revoke execute on function public.fn_statut_opportunite_suit_ses_faits()          from public, anon, authenticated;
revoke execute on function public.fn_cloture_termine_les_taches()                 from public, anon, authenticated;
revoke execute on function public.fn_tache_statut_et_realisation()                from public, anon, authenticated;

-- ── Les portes : réservées aux utilisateurs connectés ──
revoke execute on function public.sprint_terminer_taches_du_jour(uuid, boolean)   from public, anon;
grant  execute on function public.sprint_terminer_taches_du_jour(uuid, boolean)   to authenticated;
revoke execute on function public.fiche_a_une_suite(text, uuid)                   from public, anon;
grant  execute on function public.fiche_a_une_suite(text, uuid)                   to authenticated;
revoke execute on function public.lister_pipe_du_jour()                           from public, anon;
grant  execute on function public.lister_pipe_du_jour()                           to authenticated;

-- ── Les définitions partagées : lues par les fonctions du pipe, qui tournent sous l'utilisateur ──
revoke execute on function public.fn_opportunite_ligne_ouverte(boolean, timestamptz, text, uuid) from public, anon;
grant  execute on function public.fn_opportunite_ligne_ouverte(boolean, timestamptz, text, uuid) to authenticated;
revoke execute on function public.fn_opportunite_est_ouverte(uuid)                from public, anon;
grant  execute on function public.fn_opportunite_est_ouverte(uuid)                to authenticated;
revoke execute on function public.fn_piste_ligne_ouverte(boolean, uuid)           from public, anon;
grant  execute on function public.fn_piste_ligne_ouverte(boolean, uuid)           to authenticated;
revoke execute on function public.fn_piste_est_ouverte(uuid)                      from public, anon;
grant  execute on function public.fn_piste_est_ouverte(uuid)                      to authenticated;
revoke execute on function public.fn_statut_opportunite_calcule(uuid)             from public, anon;
grant  execute on function public.fn_statut_opportunite_calcule(uuid)             to authenticated;
