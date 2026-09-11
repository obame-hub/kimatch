-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE SUIT SON OPPORTUNITÉ DANS LA CORBEILLE
--
-- William, 11/09/2026 : « impossible de supprimer une opportunité, j'ai le message new row for
-- relation "actions" violates check constraint "actions_contexte_check" ».
--
-- ── DEUX RÈGLES QUI SE CONTREDISENT ──
--
-- `actions.opportunite_id` était déclarée ON DELETE SET NULL : supprimer l'opportunité vidait la
-- colonne sur ses tâches, au lieu de les supprimer.
--
-- Mais la table porte aussi ce contrôle :
--
--     actions_contexte_check  CHECK (site_id IS NOT NULL OR signal_id IS NOT NULL
--                                 OR mandat_id IS NOT NULL OR recommandation_id IS NOT NULL
--                                 OR version_recommandation_id IS NOT NULL
--                                 OR opportunite_id IS NOT NULL OR piste_id IS NOT NULL
--                                 OR suivi_contrat_id IS NOT NULL OR requete_id IS NOT NULL)
--
-- Une tâche doit garder AU MOINS UN rattachement. Or une tâche d'opportunité n'en a jamais
-- d'autre — vérifié sur les 49 lignes concernées au 11/09/2026 : AUCUNE ne porte un second
-- contexte. Vider la colonne produisait donc systématiquement une ligne interdite, et PostgreSQL
-- annulait la suppression entière.
--
-- Les deux règles étaient justes prises séparément. Ensemble, elles rendaient l'opportunité
-- indestructible — et le message d'erreur, parfaitement exact, ne parlait que de la seconde.
--
-- ── POURQUOI CASCADE, ET PAS UN ASSOUPLISSEMENT DU CONTRÔLE ──
--
-- On aurait pu retirer `opportunite_id` de la liste des contextes acceptés, ou autoriser les
-- tâches orphelines. Ce serait la mauvaise correction : une tâche sans aucun rattachement
-- n'apparaît sur aucune fiche, ne remonte dans aucun filtre, et reste dans la base sans que
-- personne ne puisse plus la voir ni la fermer. Le contrôle existe précisément pour l'empêcher.
--
-- CE QUI DEVAIT CHANGER, C'EST LA CASCADE. « Relancer sur le mandat non signé » n'a aucun sens
-- une fois l'opportunité disparue : la tâche part avec elle, et se retrouve dans la corbeille
-- comme tout le reste.
--
-- ── CE QUE LA FENÊTRE DE SUPPRESSION ANNONÇAIT, ET QUI DEVIENT VRAI ──
--
-- `inventaireOpportunite` classait les tâches en « détachées ». C'était faux deux fois : la base
-- le refusait, et ce n'est pas ce qu'on veut. Elles passent en « détruites », avec la même
-- formulation que les interactions sans autre rattachement.
--
-- ── LE MÊME PIÈGE DORT AILLEURS ──
--
-- Trois autres contextes de `actions` sont en SET NULL avec le même contrôle au-dessus :
--
--     piste_id          154 tâches, dont   0 avec un second contexte  ← même panne garantie
--     requete_id          1 tâche,  dont   0                          ← même panne garantie
--     suivi_contrat_id  278 tâches, dont 275 avec un second contexte  ← 3 lignes bloqueraient
--     site_id           298 tâches, dont 296                          ← 2 lignes bloqueraient
--
-- Aucun de ces objets ne se supprime encore depuis l'interface : le défaut n'est pas atteignable
-- aujourd'hui. Il le deviendra le jour où l'un d'eux recevra son bouton, et la correction ne sera
-- pas la même pour tous — CASCADE convient à la piste et à la requête, PAS au suivi de contrat ni
-- au site, dont les tâches ont légitimement un autre point d'attache. À traiter à ce moment-là,
-- objet par objet.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── Le garde-fou : aucune tâche d'opportunité ne doit avoir un second rattachement ──
do $$
declare
  v_multi integer;
begin
  select count(*) into v_multi
    from actions
   where opportunite_id is not null
     and (site_id is not null or signal_id is not null or mandat_id is not null
       or recommandation_id is not null or version_recommandation_id is not null
       or piste_id is not null or suivi_contrat_id is not null or requete_id is not null);
  if v_multi > 0 then
    raise exception 'ARRÊT : % tâche(s) rattachées à une opportunité ET à autre chose. La cascade les détruirait alors qu''elles survivraient légitimement — traiter ces lignes avant.', v_multi;
  end if;
end;
$$;

alter table public.actions drop constraint actions_opportunite_id_fkey;

alter table public.actions
  add constraint actions_opportunite_id_fkey
  foreign key (opportunite_id) references public.opportunites(id) on delete cascade;

comment on constraint actions_opportunite_id_fkey on public.actions is
  'CASCADE et non SET NULL : le contrôle actions_contexte_check exige qu''une tâche garde au moins un rattachement, et une tâche d''opportunité n''en a jamais d''autre. Détacher revient donc à produire une ligne interdite.';

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select confdeltype from pg_constraint where conname = 'actions_opportunite_id_fkey';
--   -- doit rendre 'c' (cascade), et non 'n' (set null)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
