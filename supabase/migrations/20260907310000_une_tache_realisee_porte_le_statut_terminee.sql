-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UNE TÂCHE RÉALISÉE PORTE LE STATUT « TERMINÉE »
--
-- William, 07/09/2026, après avoir créé une tâche d'essai : « une fois que j'ai fait la tâche, je
-- dois cocher cette case à cocher et ainsi elle passe au statut Terminé ».
--
-- ══ CE QUI SE PASSAIT VRAIMENT ══
--
-- `useCompleteAction` (src/lib/data/actions.ts) n'écrit QUE `date_realisation`. Le statut, lui, n'est
-- jamais touché en base : la fonction se contente de le corriger dans le cache de React Query, ce
-- qui donne l'illusion que tout va bien jusqu'au rechargement de la page.
--
-- MESURÉ LE 07/09/2026, AVANT ÉCRITURE :
--
--     159  tâches au total
--      12  portent une date de réalisation
--      12  d'entre elles portent encore le statut « À faire »   ← toutes, sans exception
--       0  portent le statut « Terminée »
--
-- ══ POURQUOI C'EST PIRE QU'UN CHAMP OUBLIÉ ══
--
-- Les deux écrans ne lisent pas la même colonne, et se contredisent donc sur le même objet :
--
--     le volet d'activité  lit `date_realisation`  → affiche « Terminée : … »
--     la page Tâches       lit `statut`            → affiche la tâche parmi les OUVERTES
--
-- Une tâche faite reste donc éternellement sur la liste des choses à faire d'un commercial, alors
-- que la fiche du dossier la donne pour close. C'est le genre d'écart qui ne se voit pas en trois
-- clics et qui fait perdre confiance dans les deux écrans à la fois.
--
-- ══ CE QUE CETTE MIGRATION FAIT, ET NE FAIT PAS ══
--
-- Elle aligne le statut sur le fait : là où une date de réalisation existe, la tâche est terminée.
-- La date fait foi, jamais l'inverse — c'est elle qui a été écrite par un geste d'utilisateur.
--
-- Elle ne touche AUCUNE tâche sans date de réalisation, et ne change aucune date. Les statuts
-- « En cours » et « En attente » restent dans le référentiel : aucune tâche ne les porte
-- aujourd'hui, mais les retirer serait une décision de nomenclature, pas une réparation.
--
-- LA CAUSE, ELLE, SE CORRIGE DANS LE CODE — même livraison : `useCompleteAction` écrit désormais le
-- statut ET la date. Sans cela, cette migration serait à rejouer chaque semaine.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

update public.actions a
   set statut_id = (select id from public.statuts_actions where code = 'TERMINEE')
 where a.date_realisation is not null
   and a.statut_id is distinct from (select id from public.statuts_actions where code = 'TERMINEE');

-- ── Le garde-fou ──
do $$
declare
  v_termine   uuid;
  v_restantes integer;
  v_alignees  integer;
begin
  select id into v_termine from public.statuts_actions where code = 'TERMINEE';
  if v_termine is null then
    raise exception 'Le statut TERMINEE est absent du referentiel : rien n a pu etre aligne';
  end if;

  -- Plus une seule tâche réalisée ne doit porter un autre statut.
  select count(*) into v_restantes
    from public.actions
   where date_realisation is not null
     and statut_id is distinct from v_termine;
  if v_restantes > 0 then
    raise exception 'Il reste % taches realisees sans le statut Terminee', v_restantes;
  end if;

  select count(*) into v_alignees from public.actions where statut_id = v_termine;
  raise notice 'Taches alignees sur le statut Terminee : %', v_alignees;

  -- ET RIEN D'AUTRE N'A BOUGÉ : une tâche sans date de réalisation ne peut pas être terminée.
  if exists (select 1 from public.actions where date_realisation is null and statut_id = v_termine) then
    raise exception 'Une tache sans date de realisation porte le statut Terminee : la migration a debord';
  end if;
end;
$$;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--   select s.code, count(*) from public.actions a
--     left join public.statuts_actions s on s.id = a.statut_id
--    group by s.code order by s.code;
--   -- Attendu : 12 en TERMINEE, 147 en A_FAIRE.
--
--   select count(*) from public.actions
--    where date_realisation is not null and statut_id <> (select id from public.statuts_actions where code='TERMINEE');
--   -- Attendu : 0.
