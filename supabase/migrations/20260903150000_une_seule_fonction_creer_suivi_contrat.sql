-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- « FUNCTION public.creer_suivi_contrat(uuid) IS NOT UNIQUE »
--
-- William, 03/09/2026 16 h 14, sur le contrat 40969bd0-5616-4f06-a0f9-601a807bc796 : « le contrat
-- est signé mais impossible de changer son statut ». Puis, 16 h 15 : « ce qui empêche ensuite de
-- clôturer la recommandation, puisque gagnée une recommandation demande forcément un contrat au
-- statut signé ».
--
-- ══ DEUX FONCTIONS PORTENT CE NOM ══
--
--     creer_suivi_contrat(p_contrat uuid)                                            oid 54455
--     creer_suivi_contrat(p_contrat uuid, p_avec_actions_de_depart boolean DEFAULT true)  oid 54475
--
-- Le déclencheur `propager_contrat_vers_suivi` appelle `creer_suivi_contrat(new.id)` — UN seul
-- argument. Cet appel correspond aux deux : à la première exactement, et à la seconde dont le
-- deuxième paramètre prendrait sa valeur par défaut. PostgreSQL refuse de choisir : 42725.
--
-- ══ COMMENT ON EN EST ARRIVÉ LÀ ══
--
--   20260831260000  crée la version à UN argument, et le déclencheur qui l'appelle.
--   20260831280000  écrit `create or replace function creer_suivi_contrat(p_contrat uuid,
--                   p_avec_actions_de_depart boolean default true)` pour que le rattrapage des
--                   245 suivis existants n'engendre pas 735 tâches douteuses.
--
-- `CREATE OR REPLACE FUNCTION` NE REMPLACE QUE SI LA SIGNATURE EST IDENTIQUE. En ajoutant un
-- paramètre, la seconde migration n'a rien remplacé : elle a créé une SURCHARGE à côté. C'est le
-- même piège que le `42P16` rencontré la veille sur les vues — ces commandes ne font pas ce qu'on
-- croit dès que la forme change.
--
-- ══ POURQUOI ÇA N'A PAS SAUTÉ AUX YEUX LE 31/08 ══
--
-- Le déclencheur ne s'arme qu'au passage d'un contrat à SIGNE, A_VENIR, ACTIF, TERMINE ou RESILIE.
-- Depuis le 31/08, TROIS contrats seulement ont changé de statut. Et le rattrapage, lui, appelait
-- la version à deux arguments explicitement : aucune ambiguïté, ses 1 578 suivis sont bien nés à
-- 18 h 45 ce jour-là.
--
-- ══ LA CORRECTION : IL N'EN RESTE QU'UNE ══
--
-- On supprime celle à un argument. Celle à deux la couvre entièrement — l'appel du déclencheur
-- retombe dessus avec `p_avec_actions_de_depart = true`, c'est-à-dire exactement le comportement
-- voulu pour un contrat qui vient d'être signé : ses trois premières tâches sont créées.
--
-- VÉRIFIÉ AVANT D'ÉCRIRE : le déclencheur est le SEUL appelant à un argument dans tout le dépôt.
-- Et aucun contrat n'est resté en incohérence — zéro contrat à un statut déclencheur sans suivi,
-- ce qui est logique : l'échec du déclencheur annulait l'UPDATE, donc le statut ne changeait pas
-- non plus.
--
-- ══ RETOUR ARRIÈRE ══
--
-- Réappliquer la migration 20260831260000, qui recrée la version à un argument. Mais on retrouverait
-- l'ambiguïté : il n'y a aucune raison de le faire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.creer_suivi_contrat(uuid);

-- ── Le garde-fou : une seule fonction, et c'est la bonne ──
do $$
declare
  v_nb integer;
  v_signature text;
begin
  select count(*) into v_nb
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creer_suivi_contrat';

  if v_nb <> 1 then
    raise exception 'Il reste % fonctions creer_suivi_contrat au lieu d''une seule', v_nb;
  end if;

  select pg_get_function_identity_arguments(p.oid) into v_signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creer_suivi_contrat';

  -- Si c'était celle à un argument qui avait survécu, le rattrapage ne pourrait plus se relancer
  -- sans recréer les 735 tâches que la migration 20260831280000 a précisément voulu éviter.
  if v_signature <> 'p_contrat uuid, p_avec_actions_de_depart boolean' then
    raise exception 'La fonction restante a la mauvaise signature : %', v_signature;
  end if;

  raise notice 'creer_suivi_contrat(%) — une seule fonction, l''appel du déclencheur est levé', v_signature;
end;
$$;

commit;

-- ── CONTRÔLE APRÈS APPLICATION ──────────────────────────────────────────────────────────────────
--
-- Reprendre le contrat de William et le passer à « Signé » depuis la fiche : l'erreur doit avoir
-- disparu, et un suivi de contrat doit apparaître. Pour le vérifier en SQL :
--
--   select id, contrat_id, date_creation from suivis_contrats
--    where contrat_id = '40969bd0-5616-4f06-a0f9-601a807bc796';
