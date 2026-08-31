-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE PEUT AUSSI SE RATTACHER À UNE OPPORTUNITÉ OU À UNE PISTE
--
-- La contrainte `actions_contexte_check` exige qu'une tâche porte au moins un rattachement — c'est la
-- bonne règle : une tâche qui n'appartient à rien n'apparaît sur aucune fiche et se perd.
--
-- Mais sa liste s'arrêtait à site / signal / mandat / recommandation / version. Les colonnes
-- `opportunite_id` et `piste_id` n'y figuraient pas. Conséquence, mesurée en transaction annulée le
-- 31/08/2026 : une tâche créée depuis une fiche opportunité ou depuis le panneau d'une piste était
-- REFUSÉE PAR LA BASE, avec le message « violates check constraint "actions_contexte_check" ».
--
-- La colonne `opportunite_id` existait depuis longtemps sans que rien ne l'écrive ; on ne l'avait donc
-- jamais heurtée. `piste_id` vient d'être ajoutée (migration 20260831200000). Michel, 31/08/2026 :
-- « permettre de créer et de suivre des actions dans les recommandations, les opportunités et les
-- pistes » — les deux tiers de sa demande butaient sur cette liste.
--
-- LA RÈGLE NE S'AFFAIBLIT PAS. On ajoute deux rattachements valides, on n'autorise pas la tâche
-- orpheline : il en faut toujours au moins un.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.actions drop constraint if exists actions_contexte_check;

alter table public.actions add constraint actions_contexte_check check (
  site_id is not null
  or signal_id is not null
  or mandat_id is not null
  or recommandation_id is not null
  or version_recommandation_id is not null
  or opportunite_id is not null
  or piste_id is not null
);

commit;
